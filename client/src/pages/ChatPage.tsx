import { useState, useEffect, useRef } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { ethers } from 'ethers';
import { authStore, searchUsers } from '../lib/api';
import { encodeTxMessage, decodeTxMessage } from '../lib/tx';
import type { TxMessage, TransferPayload } from '../lib/tx';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';
import DiscoverPanel from '../components/DiscoverPanel';
import CreateGroup from '../components/CreateGroup';

interface ChatMsg {
  id: string;
  content?: string;
  txMsg?: TxMessage;
  sender: string;
  timestamp: number;
}

interface GroupInfo {
  id: string;
  name: string;
  description: string | null;
  creatorId: string;
  members: Array<{ userId: string; role: string; user: { id: string; address: string; displayName: string | null; avatarUrl: string | null } }>;
}

interface Props { onLogout: () => void; }

export default function ChatPage({ onLogout }: Props) {
  const user = authStore.user!;
  const [tab, setTab] = useState<'chats' | 'groups' | 'discover'>('chats');

  // Chat state
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<Array<{ id: string; address: string; ensName: string | null; displayName: string }>>([]);
  const [xmtpClient, setXmtpClient] = useState<Client | null>(null);
  const [xmtpLoading, setXmtpLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [activeChatAddress, setActiveChatAddress] = useState<string | null>(null);
  const [composing, setComposing] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [myAddress, setMyAddress] = useState('');
  const initRef = useRef(false);
  const convoIdRef = useRef<string | null>(null);

  // Group state
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  function parseMsg(content: string, sender: string, msgId: string): ChatMsg {
    const txMsg = decodeTxMessage(content);
    if (txMsg) return { id: msgId, txMsg, sender, timestamp: txMsg.timestamp || Date.now() };
    return { id: msgId, content, sender, timestamp: Date.now() };
  }

  // Init XMTP
  useEffect(() => { if (!initRef.current) { initRef.current = true; initXmtp(); } }, []);

  async function initXmtp() {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      setMyAddress((await signer.getAddress()).toLowerCase());
      const client = await Client.create(signer, { env: 'production' });
      setXmtpClient(client);
      setXmtpLoading(false);
    } catch (err) {
      console.error('XMTP init:', err);
      setXmtpLoading(false);
    }
  }

  // Load groups
  useEffect(() => { loadGroups(); }, []);
  async function loadGroups() {
    try {
      const res = await fetch('http://localhost:4089/api/groups', {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch { /* ignore */ }
  }

  // Search users
  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await searchUsers(authStore.token!, searchQ);
        setResults(res.users);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Stream messages
  useEffect(() => {
    if (!xmtpClient || !activeChat) return;
    let cancelled = false;
    (async () => {
      try {
        const convos = await xmtpClient.conversations.list();
        const convo = convos.find(c => c.id === activeChat);
        if (!convo || convo.id !== convoIdRef.current) return;
        const stream$ = convo.messages({ direction: 'SORT_DIRECTION_DESCENDING' });
        let prev: ChatMsg[] = [];
        for await (const msg of stream$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          prev.unshift(parseMsg(typeof msg.content === 'string' ? msg.content : '', msg.senderAddress || '', msg.id || crypto.randomUUID()));
        }
        if (!cancelled) setMessages(prev);
        const live$ = await convo.stream({});
        for await (const msg of live$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          setMessages(prev => [...prev, parseMsg(typeof msg.content === 'string' ? msg.content : '', msg.senderAddress || '', msg.id || crypto.randomUUID())]);
        }
      } catch (err) { console.error('Stream error:', err); }
    })();
    return () => { cancelled = true; };
  }, [xmtpClient, activeChat]);

  async function sendMessage() {
    if (!xmtpClient || !activeChat || !composing.trim()) return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat);
      if (!convo) return;
      await convo.send(composing.trim());
      setComposing('');
    } catch (err) { console.error('Send error:', err); }
  }

  async function sendTransfer(payload: TransferPayload) {
    if (!xmtpClient || !activeChat) return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat);
      if (!convo) return;
      await convo.send(encodeTxMessage({ kind: 'tx', txType: 'transfer', payload, from: myAddress, timestamp: Date.now() }));
      setShowTransfer(false);
    } catch (err) { console.error('Send transfer error:', err); }
  }

  async function startChat(address: string) {
    if (!xmtpClient) return;
    setShowTransfer(false);
    setActiveGroup(null);
    try {
      const convos = await xmtpClient.conversations.listDms();
      const existing = convos.find(c => c.peerAddress?.toLowerCase() === address.toLowerCase());
      const id = existing?.id || (await xmtpClient.conversations.newDm(address)).id;
      convoIdRef.current = id;
      setActiveChat(id);
      setActiveChatAddress(address);
      setMessages([]);
    } catch (err) { console.error('Start chat error:', err); }
  }

  async function ensureXmtp() {
    if (xmtpClient) return;
    setXmtpLoading(true);
    await initXmtp();
  }

  // Render sidebar content based on tab
  const sidebarContent = () => {
    switch (tab) {
      case 'discover':
        return <DiscoverPanel onStartChat={startChat} onInviteToGroup={addr => {}} />;
      case 'groups':
        return (
          <div className="flex-1 flex flex-col">
            <div className="p-3 border-b border-white/5 flex justify-between items-center">
              <span className="text-gray-300 text-sm font-semibold">Groups</span>
              <button onClick={() => setShowCreateGroup(true)}
                className="text-xs bg-blue-500/20 text-blue-400 px-3 py-1 rounded-lg hover:bg-blue-500/30 transition-colors">
                + New
              </button>
            </div>
            {showCreateGroup && (
              <CreateGroup
                onCreate={(g) => { setGroups(prev => [g, ...prev]); setShowCreateGroup(false); loadGroups(); }}
                onCancel={() => setShowCreateGroup(false)}
              />
            )}
            <div className="flex-1 overflow-y-auto">
              {groups.length === 0 && (
                <p className="text-gray-600 text-sm p-4 text-center">No groups yet. Create one!</p>
              )}
              {groups.map(g => (
                <div key={g.id}
                  onClick={() => { setActiveGroup(g); setActiveChat(null); }}
                  className={`p-3 cursor-pointer hover:bg-white/5 transition-colors ${activeGroup?.id === g.id ? 'bg-white/10' : ''}`}>
                  <div className="text-white text-sm font-medium truncate">{g.name}</div>
                  <div className="text-gray-500 text-xs">{g.members?.length || 0} members</div>
                </div>
              ))}
            </div>
          </div>
        );
      default: // 'chats'
        return (
          <>
            <div className="p-3">
              <input type="text" placeholder="Search address / ENS / name" value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
            </div>
            {xmtpLoading && <div className="px-3 py-2 text-xs text-amber-400">Connecting to XMTP...</div>}
            {!xmtpClient && !xmtpLoading && (
              <div className="px-3 py-2">
                <button onClick={ensureXmtp} className="w-full text-xs bg-brand/20 text-brand hover:bg-brand/30 px-3 py-1.5 rounded-lg transition-colors">
                  Connect XMTP
                </button>
              </div>
            )}
            {results.length > 0 && (
              <div className="flex-1 overflow-y-auto px-2">
                {results.map(u => (
                  <div key={u.id} onClick={() => startChat(u.address)}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {(u.displayName || u.address)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-sm truncate font-medium">{u.ensName || u.displayName}</div>
                      <div className="text-gray-500 text-xs font-mono truncate">{u.address}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {results.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm p-4 text-center">
                Search users by wallet address, ENS, or display name
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <h2 className="text-white font-bold text-lg">
          Crypt<span className="gradient-text">Chat</span>
        </h2>
        <div className="flex items-center gap-3">
          {xmtpClient && (
            <span className="text-green-400 text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              E2EE
            </span>
          )}
          <span className="text-gray-400 text-xs font-mono hidden sm:inline">{user.ensName || user.displayName}</span>
          <button onClick={onLogout} className="text-gray-500 hover:text-red-400 text-xs transition-colors">Disconnect</button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="glass border-b border-white/5 flex">
        {(['chats', 'groups', 'discover'] as const).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              tab === t ? 'text-white border-b-2 border-brand' : 'text-gray-500 hover:text-gray-300'
            }`}>
            {t === 'chats' ? '💬 Chats' : t === 'groups' ? '👥 Groups' : '🌐 Discover'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-72 border-r border-white/5 glass hidden md:flex flex-col">
          {sidebarContent()}
        </aside>

        {/* Main area */}
        <main className="flex-1 flex flex-col">
          {(activeChat || activeGroup) ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeGroup ? (
                  // Group chat view
                  <div className="text-center">
                    <div className="text-4xl mb-3">👥</div>
                    <h3 className="text-white text-lg font-semibold">{activeGroup.name}</h3>
                    <p className="text-gray-500 text-sm">{activeGroup.description || 'No description'}</p>
                    <div className="mt-4 space-y-2">
                      <p className="text-gray-400 text-xs uppercase tracking-wider">Members ({activeGroup.members?.length || 0})</p>
                      {activeGroup.members?.map(m => (
                        <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              {(m.user.displayName || m.user.address)[0].toUpperCase()}
                            </div>
                            <span className="text-white text-sm">{m.user.displayName || m.user.address.slice(0,6)+'...'+m.user.address.slice(-4)}</span>
                          </div>
                          <span className="text-gray-500 text-xs">{m.role}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-gray-400 text-sm">
                        🚧 Group chat messaging via XMTP coming soon.
                      </p>
                    </div>
                  </div>
                ) : (
                  // DM chat
                  <>
                    {messages.length === 0 && (
                      <p className="text-gray-500 text-sm text-center mt-8">E2E encrypted. Start the conversation.</p>
                    )}
                    {messages.map((msg, i) => {
                      const isSent = msg.sender?.toLowerCase() === myAddress;
                      return (
                        <div key={msg.id || i} className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}>
                          {msg.txMsg ? (
                            <TransferCard msg={msg.txMsg} isSent={isSent} />
                          ) : (
                            <div className={`rounded-xl px-4 py-2 max-w-[70%] ${isSent ? 'bg-brand/20 text-white' : 'bg-white/5 text-white'}`}>
                              <p className="text-sm">{msg.content}</p>
                            </div>
                          )}
                          <span className="text-gray-600 text-[10px] mt-0.5">{msg.sender?.slice(0, 6)}...{msg.sender?.slice(-4)}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Only show compose for DM */}
              {!activeGroup && (
                <div className="border-t border-white/5 p-3 space-y-2">
                  {showTransfer && <TransferForm onSend={sendTransfer} onCancel={() => setShowTransfer(false)} />}
                  <div className="flex gap-2">
                    <button onClick={() => setShowTransfer(!showTransfer)}
                      className={`px-3 py-2 rounded-xl text-sm transition-colors ${showTransfer ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}>
                      💸
                    </button>
                    <input type="text" value={composing} onChange={e => setComposing(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Type a message..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50" />
                    <button onClick={sendMessage}
                      className="bg-brand/20 text-brand px-4 py-2 rounded-xl text-sm hover:bg-brand/30 transition-colors">Send</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-white text-xl font-semibold mb-1">Welcome to CryptChat</h3>
              <p className="text-gray-500 text-sm max-w-xs text-center">
                {tab === 'discover' ? 'Find people through Ceres invite network.' :
                 tab === 'groups' ? 'Create or join encrypted group chats.' :
                 'Select a contact to start chatting. E2E encrypted via XMTP.'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
