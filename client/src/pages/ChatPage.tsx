import { useState, useEffect, useRef } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { ethers } from 'ethers';
import {
  authStore, getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend,
  getFriendStatus, searchUsers, getGroups,
} from '../lib/api';
import { encodeTxMessage, decodeTxMessage } from '../lib/tx';
import type { TxMessage, TransferPayload } from '../lib/tx';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';
import DiscoverPanel from '../components/DiscoverPanel';
import CreateGroup from '../components/CreateGroup';

interface ChatMsg { id: string; content?: string; txMsg?: TxMessage; sender: string; timestamp: number; }
interface FriendInfo { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; bio: string | null; status: string; }
interface FriendReq { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; createdAt: string; }
interface GroupInfo { id: string; name: string; description: string | null; members: any[]; }

interface Props { onLogout: () => void; onGoProfile: () => void; }

export default function ChatPage({ onLogout, onGoProfile }: Props) {
  const user = authStore.user!;
  const [myAddress, setMyAddress] = useState('');

  // XMTP
  const [xmtpClient, setXmtpClient] = useState<Client | null>(null);
  const [xmtpLoading, setXmtpLoading] = useState(true);

  // Friends
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [showRequests, setShowRequests] = useState(false);

  // Active chat
  const [activeChat, setActiveChat] = useState<FriendInfo | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [composing, setComposing] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const convoIdRef = useRef<string | null>(null);

  // Groups
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Right panel
  const [rightPanel, setRightPanel] = useState<'profile' | 'add_friend' | null>(null);
  const [addFriendAddr, setAddFriendAddr] = useState('');
  const [addFriendStatus, setAddFriendStatus] = useState('');
  const [addFriendError, setAddFriendError] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const initRef = useRef(false);

  // Init
  useEffect(() => { if (!initRef.current) { initRef.current = true; initXmtp(); } loadData(); }, []);
  async function initXmtp() {
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      setMyAddress((await signer.getAddress()).toLowerCase());
      setXmtpClient(await Client.create(signer, { env: 'production' }));
    } catch (err) { console.error('XMTP:', err); }
    setXmtpLoading(false);
  }
  async function loadData() {
    try { setFriends(await getFriends()); } catch {}
    try { setRequests(await getFriendRequests()); } catch {}
    try { setGroups(await getGroups()); } catch {}
  }

  // Stream messages
  useEffect(() => {
    if (!xmtpClient || !activeChat) return;
    let cancelled = false;
    (async () => {
      try {
        const convos = await xmtpClient.conversations.list();
        const convo = convos.find(c => c.id === activeChat.userId);
        if (!convo || convo.id !== convoIdRef.current) return;
        const stream$ = convo.messages({ direction: 'SORT_DIRECTION_DESCENDING' });
        let prev: ChatMsg[] = [];
        for await (const m of stream$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          const content = typeof m.content === 'string' ? m.content : '';
          const tx = decodeTxMessage(content);
          prev.unshift(tx ? { id: m.id || crypto.randomUUID(), txMsg: tx, sender: m.senderAddress || '', timestamp: tx.timestamp } : { id: m.id || crypto.randomUUID(), content, sender: m.senderAddress || '', timestamp: Date.now() });
        }
        if (!cancelled) setMessages(prev);
        const live$ = await convo.stream({});
        for await (const m of live$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          const content = typeof m.content === 'string' ? m.content : '';
          const tx = decodeTxMessage(content);
          setMessages(prev => [...prev, tx ? { id: m.id || crypto.randomUUID(), txMsg: tx, sender: m.senderAddress || '', timestamp: tx.timestamp } : { id: m.id || crypto.randomUUID(), content, sender: m.senderAddress || '', timestamp: Date.now() }]);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [xmtpClient, activeChat]);

  async function startChat(friend: FriendInfo) {
    if (!xmtpClient) return;
    setActiveGroup(null);
    setRightPanel(null);
    try {
      const convos = await xmtpClient.conversations.listDms();
      const existing = convos.find(c => c.peerAddress?.toLowerCase() === friend.address.toLowerCase());
      const id = existing?.id || (await xmtpClient.conversations.newDm(friend.address)).id;
      convoIdRef.current = id;
      setActiveChat(friend);
      setMessages([]);
    } catch {}
  }

  async function sendMsg() {
    if (!xmtpClient || !activeChat || !composing.trim()) return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat.userId);
      if (!convo) return;
      await convo.send(composing.trim());
      setComposing('');
    } catch {}
  }

  async function sendTransfer(payload: TransferPayload) {
    if (!xmtpClient || !activeChat) return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat.userId);
      if (!convo) return;
      await convo.send(encodeTxMessage({ kind: 'tx', txType: 'transfer', payload, from: myAddress, timestamp: Date.now() }));
      setShowTransfer(false);
    } catch {}
  }

  // Friend management
  async function handleAddFriend() {
    setAddFriendError(''); setAddFriendStatus('');
    if (!addFriendAddr.trim()) return;
    try {
      const result = await sendFriendRequest(addFriendAddr.trim());
      setAddFriendStatus(result.status === 'accepted' ? 'You are now friends!' : 'Friend request sent!');
      loadData();
    } catch (err: any) { setAddFriendError(err.message); }
  }
  async function handleAccept(reqId: string) {
    await acceptFriendRequest(reqId);
    loadData();
  }
  async function handleRemove(addr: string) {
    await removeFriend(addr);
    setActiveChat(null);
    loadData();
  }

  // Search users for add friend
  useEffect(() => {
    if (!addFriendAddr || addFriendAddr.length < 3) { setSearchedUsers([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(authStore.token!, addFriendAddr);
        setSearchedUsers(r.results || []);
      } catch { setSearchedUsers([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [addFriendAddr]);

  return (
    <div className="h-screen flex flex-col bg-tw-bg overflow-hidden">
      {/* Top Nav */}
      <header className="border-b border-tw-border px-4 py-3 flex items-center justify-between flex-shrink-0" style={{height:52}}>
        <div className="flex items-center gap-3">
          <button onClick={onGoProfile} className="tw-avatar tw-avatar-sm">
            {(user.displayName || user.address)[0].toUpperCase()}
          </button>
          <h2 className="text-white font-bold text-lg">CryptChat</h2>
          {xmtpClient && <span className="tw-badge">E2EE</span>}
        </div>
        <button onClick={onLogout} className="text-tw-text-dim hover:text-tw-red text-sm">Logout</button>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR — Friends list */}
        <aside className="w-72 border-r border-tw-border flex flex-col flex-shrink-0 bg-tw-bg">
          {/* Request badge */}
          {requests.length > 0 && (
            <button onClick={() => setShowRequests(!showRequests)}
              className="mx-3 mt-3 p-3 rounded-xl bg-tw-blue/10 border border-tw-blue/20 text-tw-blue text-sm font-semibold text-left">
              🔔 {requests.length} friend request{requests.length > 1 ? 's' : ''}
            </button>
          )}
          {showRequests && requests.map(r => (
            <div key={r.id} className="px-3 py-2 border-b border-tw-border bg-tw-card/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="tw-avatar tw-avatar-sm">{(r.displayName || r.address)[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm truncate">{r.displayName}</div>
                  <div className="text-tw-text-dim text-xs font-mono truncate">{r.address.slice(0,6)}...{r.address.slice(-4)}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleAccept(r.id)} className="tw-btn text-xs px-4 py-1">Accept</button>
                <button onClick={() => handleRemove(r.address)} className="tw-btn-outline text-xs px-4 py-1">Decline</button>
              </div>
            </div>
          ))}

          {/* Friends */}
          <div className="flex-1 overflow-y-auto">
            {friends.length === 0 && (
              <p className="text-tw-text-dim text-sm p-4 text-center">No friends yet. Search users or import from Ceres.</p>
            )}
            {friends.map(f => (
              <button key={f.userId}
                onClick={() => startChat(f)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-tw-card-hover transition-colors text-left ${activeChat?.userId === f.userId ? 'bg-tw-card border-r-2 border-tw-blue' : ''}`}>
                <div className="tw-avatar">{f.displayName[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-[15px] font-medium truncate">{f.displayName}</div>
                  <div className="text-tw-text-dim text-[13px] truncate">{f.bio || f.address.slice(0,6)+'...'+f.address.slice(-4)}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-tw-border p-3 space-y-2">
            <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
              className={`w-full text-left px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${rightPanel === 'add_friend' ? 'bg-tw-blue/10 text-tw-blue' : 'text-tw-text-dim hover:text-white hover:bg-tw-card'}`}>
              + Add Friend
            </button>
            <button onClick={() => { loadData(); }}
              className="hidden w-full text-left px-4 py-2 rounded-xl text-sm text-tw-text-dim hover:text-white hover:bg-tw-card transition-colors">
              ↻ Refresh
            </button>
          </div>
        </aside>

        {/* CENTER — Chat */}
        <main className="flex-1 flex flex-col bg-tw-bg min-w-0">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="border-b border-tw-border px-4 py-3 flex items-center gap-3">
                <div className="tw-avatar">{activeChat.displayName[0].toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-semibold text-[15px]">{activeChat.displayName}</div>
                  <div className="text-tw-text-dim text-[13px] font-mono truncate">{activeChat.address.slice(0,8)}...{activeChat.address.slice(-6)}</div>
                </div>
                <button onClick={() => setRightPanel(rightPanel === 'profile' ? null : 'profile')}
                  className="tw-btn-outline text-xs px-3 py-1">Info</button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <p className="text-tw-text-dim text-sm text-center py-8">
                    🔐 End-to-end encrypted. Send a message to start.
                  </p>
                )}
                {messages.map((msg, i) => {
                  const isSent = msg.sender?.toLowerCase() === myAddress;
                  return (
                    <div key={msg.id || i} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                      {msg.txMsg ? (
                        <TransferCard msg={msg.txMsg} isSent={isSent} />
                      ) : (
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[15px] ${isSent ? 'bg-tw-blue text-white rounded-br-md' : 'bg-tw-card text-tw-text rounded-bl-md'}`}>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="border-t border-tw-border p-3 space-y-2">
                {showTransfer && <TransferForm onSend={sendTransfer} onCancel={() => setShowTransfer(false)} />}
                <div className="flex gap-2 items-end">
                  <button onClick={() => setShowTransfer(!showTransfer)}
                    className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${showTransfer ? 'bg-tw-blue text-white' : 'text-tw-text-dim hover:bg-tw-card hover:text-white'}`}>💸</button>
                  <input type="text" value={composing} onChange={e => setComposing(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendMsg()}
                    placeholder="Start a new message"
                    className="flex-1 bg-transparent border-none outline-none text-white text-[15px] placeholder-tw-text-dim py-2" />
                  <button onClick={sendMsg} disabled={!composing.trim()}
                    className="tw-btn shrink-0 px-5 py-2">Send</button>
                </div>
              </div>
            </>
          ) : activeGroup ? (
            /* Group view */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-lg mx-auto text-center">
                <div className="text-5xl mb-4">👥</div>
                <h3 className="text-white text-xl font-bold mb-1">{activeGroup.name}</h3>
                {activeGroup.description && <p className="text-tw-text-dim mb-6">{activeGroup.description}</p>}
                <p className="text-tw-text-dim text-xs uppercase tracking-wider mb-3">Members ({activeGroup.members?.length || 0})</p>
                {activeGroup.members?.map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-tw-card transition-colors">
                    <div className="tw-avatar">{(m.user?.displayName || m.user?.address)[0]?.toUpperCase()}</div>
                    <div className="flex-1 text-left">
                      <div className="text-white text-sm">{m.user?.displayName || m.user?.address?.slice(0,6)+'...'+m.user?.address?.slice(-4)}</div>
                      <div className="text-tw-text-dim text-xs">{m.role}</div>
                    </div>
                  </div>
                ))}
                <p className="mt-6 text-tw-text-dim text-sm">🚧 Group messaging coming soon</p>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-white text-2xl font-bold mb-2">Select a conversation</h3>
              <p className="text-tw-text-dim text-[15px]">Choose a friend from the left or add new friends to start chatting.</p>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {rightPanel && (
          <aside className="w-80 border-l border-tw-border overflow-y-auto bg-tw-bg flex-shrink-0 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold">{rightPanel === 'add_friend' ? 'Add Friend' : 'Details'}</h3>
              <button onClick={() => setRightPanel(null)} className="text-tw-text-dim hover:text-white text-lg">✕</button>
            </div>

            {rightPanel === 'add_friend' && (
              <div className="space-y-3">
                <p className="text-tw-text-dim text-sm">Search by wallet address or display name</p>
                <input type="text" placeholder="0x... or name"
                  value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                  className="tw-input w-full" autoFocus />
                {searchedUsers.length > 0 && (
                  <div className="space-y-1">
                    {searchedUsers.map((u: any) => (
                      <div key={u.id} onClick={() => setAddFriendAddr(u.address)}
                        className="flex items-center gap-2 p-2 rounded-xl hover:bg-tw-card cursor-pointer transition-colors">
                        <div className="tw-avatar tw-avatar-sm">{(u.displayName || u.address)[0].toUpperCase()}</div>
                        <div className="min-w-0">
                          <div className="text-white text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                          <div className="text-tw-text-dim text-xs font-mono truncate">{u.address}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={handleAddFriend} className="tw-btn w-full">Send Friend Request</button>
                {addFriendStatus && <p className="text-tw-green text-sm">✓ {addFriendStatus}</p>}
                {addFriendError && <p className="text-tw-red text-sm">{addFriendError}</p>}
              </div>
            )}

            {rightPanel === 'profile' && activeChat && (
              <div className="space-y-4">
                <div className="tw-avatar tw-avatar-lg mx-auto text-3xl">{activeChat.displayName[0].toUpperCase()}</div>
                <div className="text-center">
                  <div className="text-white text-lg font-bold">{activeChat.displayName}</div>
                  <div className="text-tw-text-dim text-sm font-mono break-all mt-1">{activeChat.address}</div>
                  {activeChat.bio && <p className="text-tw-text text-sm mt-2">{activeChat.bio}</p>}
                </div>
                <button onClick={() => handleRemove(activeChat.address)}
                  className="tw-btn-outline w-full border-tw-red text-tw-red hover:bg-tw-red/10">
                  Remove Friend
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
