import { useState, useEffect, useRef } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { ethers } from 'ethers';
import { authStore, getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers, getGroups } from '../lib/api';
import { encodeTxMessage, decodeTxMessage } from '../lib/tx';
import type { TxMessage, TransferPayload } from '../lib/tx';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';

interface FriendInfo { userId: string; address: string; displayName: string; avatarUrl: string | null; bio: string | null; status: string; id: string; }
interface FriendReq { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; }
interface GroupInfo { id: string; name: string; description: string | null; members: any[]; }

interface Props { onLogout: () => void; onGoProfile: () => void; }

export default function ChatPage({ onLogout, onGoProfile }: Props) {
  const user = authStore.user!;
  const [myAddress, setMyAddress] = useState('');
  const [xmtpClient, setXmtpClient] = useState<Client | null>(null);

  // Sidebar tabs
  const [tab, setTab] = useState<'friends' | 'groups' | 'requests'>('friends');

  // Friends
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendReq[]>([]);

  // Groups
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Active conversation — can be friend or group
  const [activeChat, setActiveChat] = useState<{ type: 'dm'; friend: FriendInfo } | { type: 'group'; group: GroupInfo } | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [composing, setComposing] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const convoIdRef = useRef<string | null>(null);
  const pollRef = useRef<any>(null);

  // Right panel
  const [rightPanel, setRightPanel] = useState<'add_friend' | 'info' | null>(null);
  const [addFriendAddr, setAddFriendAddr] = useState('');
  const [addFriendMsg, setAddFriendMsg] = useState('');
  const [addFriendErr, setAddFriendErr] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);

  const initRef = useRef(false);

  // Init
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        setMyAddress((await signer.getAddress()).toLowerCase());
        setXmtpClient(await Client.create(signer, { env: 'production' }));
      } catch (err) { console.error('XMTP init:', err); }
    })();
    loadData();
  }, []);

  async function loadData() {
    try { setFriends(await getFriends()); } catch {}
    try { setRequests(await getFriendRequests()); } catch {}
    try { setGroups(await getGroups()); } catch {}
  }

  // Poll group messages
  useEffect(() => {
    if (!activeChat || activeChat.type !== 'group') return;
    const group = activeChat.group;
    async function poll() {
      try {
        const r = await fetch(`/api/groups/${group.id}/messages`, { headers: authStore.headers() });
        if (r.ok) {
          const d = await r.json();
          setMessages(d.messages || []);
        }
      } catch {}
    }
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat]);

  // Stream XMTP
  useEffect(() => {
    if (!xmtpClient || !activeChat || activeChat.type !== 'dm') return;
    let cancelled = false;
    const friend = activeChat.friend;
    (async () => {
      try {
        const convos = await xmtpClient.conversations.list();
        const convo = convos.find(c => c.id === friend.userId);
        if (!convo || convo.id !== convoIdRef.current) return;
        const stream$ = convo.messages({ direction: 'SORT_DIRECTION_DESCENDING' });
        let prev: any[] = [];
        for await (const m of stream$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          prev.unshift({ id: m.id || crypto.randomUUID(), content: typeof m.content === 'string' ? m.content : '', sender: m.senderAddress || '', time: Date.now() });
        }
        if (!cancelled) setMessages(prev);
        const live$ = await convo.stream({});
        for await (const m of live$) {
          if (cancelled || convo.id !== convoIdRef.current) break;
          const content = typeof m.content === 'string' ? m.content : '';
          setMessages(prev => [...prev, { id: m.id || crypto.randomUUID(), content, sender: m.senderAddress || '', time: Date.now() }]);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [xmtpClient, activeChat]);

  async function startDmChat(friend: FriendInfo) {
    if (!xmtpClient) return;
    setRightPanel(null);
    try {
      const convos = await xmtpClient.conversations.listDms();
      const existing = convos.find(c => c.peerAddress?.toLowerCase() === friend.address.toLowerCase());
      const id = existing?.id || (await xmtpClient.conversations.newDm(friend.address)).id;
      convoIdRef.current = id;
      setActiveChat({ type: 'dm', friend });
    } catch {}
  }

  async function sendDm() {
    if (!xmtpClient || !activeChat || activeChat.type !== 'dm' || !composing.trim()) return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat.friend.userId);
      if (!convo) return;
      await convo.send(composing.trim());
      setComposing('');
    } catch {}
  }

  async function sendTransfer(payload: TransferPayload) {
    if (!xmtpClient || !activeChat || activeChat.type !== 'dm') return;
    try {
      const convos = await xmtpClient.conversations.listDms();
      const convo = convos.find(c => c.peerInboxId === activeChat.friend.userId);
      if (!convo) return;
      await convo.send(encodeTxMessage({ kind: 'tx', txType: 'transfer', payload, from: myAddress, timestamp: Date.now() }));
      setShowTransfer(false);
    } catch {}
  }

  async function sendGroupMsg() {
    if (!activeChat || activeChat.type !== 'group' || !composing.trim()) return;
    try {
      await fetch(`/api/groups/${activeChat.group.id}/messages`, {
        method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ content: composing.trim() }),
      });
      setComposing('');
      // Re-poll
      const r = await fetch(`/api/groups/${activeChat.group.id}/messages`, { headers: authStore.headers() });
      if (r.ok) setMessages((await r.json()).messages || []);
    } catch {}
  }

  async function handleAddFriend() {
    setAddFriendErr(''); setAddFriendMsg('');
    if (!addFriendAddr.trim()) return;
    try {
      const result = await sendFriendRequest(addFriendAddr.trim());
      if (result.status === 'accepted') {
        setAddFriendMsg('You are now friends! ✅');
        loadData();
      } else {
        setAddFriendMsg('Friend request sent! 📨');
      }
    } catch (err: any) { setAddFriendErr(err.message); }
  }

  async function handleAccept(reqId: string) { await acceptFriendRequest(reqId); loadData(); }
  async function handleRemove(addr: string) { await removeFriend(addr); setActiveChat(null); loadData(); }

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      await fetch('/api/groups', {
        method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }),
      });
      loadData();
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateGroup(false);
    } catch {}
    setCreatingGroup(false);
  }

  // Search for add friend
  useEffect(() => {
    if (!addFriendAddr || addFriendAddr.length < 3) { setSearchedUsers([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await searchUsers(authStore.token!, addFriendAddr);
        setSearchedUsers(r.results || []);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [addFriendAddr]);

  function getAvatarLetter(s: string) { return (s || '?')[0].toUpperCase(); }

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden" style={{fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'}}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 border-b border-[#2f3336] flex-shrink-0" style={{height:52}}>
        <div className="flex items-center gap-3">
          <button onClick={onGoProfile} className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-sm">
            {(user.displayName || user.address)[0].toUpperCase()}
          </button>
          <h1 className="text-[#e7e9ea] font-bold text-lg">CryptChat</h1>
        </div>
        <button onClick={onLogout} className="text-[#71767b] hover:text-red-400 text-sm">Logout</button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-72 border-r border-[#2f3336] flex flex-col bg-black flex-shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-[#2f3336]">
            {[
              { key: 'friends' as const, label: 'Friends', icon: '💬' },
              { key: 'groups' as const, label: 'Groups', icon: '👥' },
              { key: 'requests' as const, label: requests.length > 0 ? `Requests (${requests.length})` : 'Requests', icon: '🔔' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === t.key ? 'text-[#e7e9ea] border-b-2 border-[#1d9bf0]' : 'text-[#71767b] hover:text-[#e7e9ea]'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'friends' && (
              <>
                {friends.length === 0 && (
                  <p className="text-[#71767b] text-sm p-4 text-center">
                    No friends yet. Click "Add Friend" below to find people.
                  </p>
                )}
                {friends.map(f => (
                  <button key={f.userId} onClick={() => startDmChat(f)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#16181c] transition-colors text-left ${activeChat?.type === 'dm' && activeChat.friend.userId === f.userId ? 'bg-[#16181c] border-r-2 border-[#1d9bf0]' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {getAvatarLetter(f.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e7e9ea] text-[15px] font-medium truncate">{f.displayName}</div>
                      <div className="text-[#71767b] text-[13px] font-mono truncate">{f.address.slice(0,6)}...{f.address.slice(-4)}</div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {tab === 'groups' && (
              <>
                {groups.length === 0 && (
                  <p className="text-[#71767b] text-sm p-4 text-center">No groups yet.</p>
                )}
                {groups.map(g => (
                  <button key={g.id} onClick={() => { setMessages([]); setActiveChat({ type: 'group', group: g }); setRightPanel(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#16181c] transition-colors text-left ${activeChat?.type === 'group' && activeChat.group.id === g.id ? 'bg-[#16181c] border-r-2 border-[#1d9bf0]' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00ba7c] to-[#1d9bf0] flex items-center justify-center text-white font-bold text-sm shrink-0">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e7e9ea] text-[15px] font-medium truncate">{g.name}</div>
                      <div className="text-[#71767b] text-[13px]">{g.members?.length || 0} member{(g.members?.length||0) !== 1 ? 's' : ''}</div>
                    </div>
                  </button>
                ))}
                {showCreateGroup && (
                  <div className="p-4 space-y-3 border-b border-[#2f3336]">
                    <input type="text" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      className="w-full bg-transparent border border-[#2f3336] rounded-lg px-3 py-2 text-sm text-[#e7e9ea] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" autoFocus />
                    <input type="text" placeholder="Description (optional)" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                      className="w-full bg-transparent border border-[#2f3336] rounded-lg px-3 py-2 text-sm text-[#e7e9ea] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" />
                    <div className="flex gap-2">
                      <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
                        className="bg-[#1d9bf0] text-white font-bold text-sm px-4 py-2 rounded-full hover:bg-[#1a8cd8] disabled:opacity-50">Create</button>
                      <button onClick={() => setShowCreateGroup(false)} className="text-[#71767b] text-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {tab === 'requests' && (
              <>
                {requests.length === 0 && (
                  <p className="text-[#71767b] text-sm p-4 text-center">No pending friend requests.</p>
                )}
                {requests.map(r => (
                  <div key={r.id} className="px-4 py-3 border-b border-[#2f3336]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-xs font-bold">
                        {getAvatarLetter(r.displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[#e7e9ea] text-sm truncate">{r.displayName}</div>
                        <div className="text-[#71767b] text-xs font-mono">{r.address.slice(0,6)}...{r.address.slice(-4)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(r.id)} className="bg-[#1d9bf0] text-white font-bold text-xs px-4 py-1.5 rounded-full">Accept</button>
                      <button onClick={() => handleRemove(r.address)} className="text-[#71767b] border border-[#2f3336] font-bold text-xs px-4 py-1.5 rounded-full">Decline</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-[#2f3336] p-3 space-y-2">
            <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
              className={`w-full text-left px-4 py-2 rounded-full text-sm font-semibold transition-colors ${rightPanel === 'add_friend' ? 'bg-[#1d9bf0]/10 text-[#1d9bf0]' : 'text-[#e7e9ea] bg-[#1d9bf0] hover:bg-[#1a8cd8]'}`}>
              + Add Friend
            </button>
            {tab === 'groups' && !showCreateGroup && (
              <button onClick={() => setShowCreateGroup(true)}
                className="w-full text-left px-4 py-2 rounded-full text-sm font-semibold text-[#1d9bf0] border border-[#1d9bf0] hover:bg-[#1d9bf0]/10 transition-colors">
                + Create Group
              </button>
            )}
          </div>
        </aside>

        {/* CENTER — Chat */}
        <main className="flex-1 flex flex-col bg-black min-w-0">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#2f3336]">
                {activeChat.type === 'dm' ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-sm">
                      {getAvatarLetter(activeChat.friend.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e7e9ea] font-semibold text-[15px]">{activeChat.friend.displayName}</div>
                      <div className="text-[#71767b] text-[13px] font-mono truncate">{activeChat.friend.address.slice(0,8)}...{activeChat.friend.address.slice(-6)}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00ba7c] to-[#1d9bf0] flex items-center justify-center text-white text-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#e7e9ea] font-semibold text-[15px]">{activeChat.group.name}</div>
                      <div className="text-[#71767b] text-[13px]">{activeChat.group.members?.length || 0} members</div>
                    </div>
                  </>
                )}
                <button onClick={() => setRightPanel(rightPanel === 'info' ? null : 'info')}
                  className="text-[#71767b] hover:text-[#e7e9ea] text-sm font-semibold">Info</button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <p className="text-[#71767b] text-sm text-center py-8">Send a message to start the conversation.</p>
                )}
                {messages.map((msg: any, i: number) => {
                  // For DM messages, check if it's a tx card
                  const txMsg = activeChat.type === 'dm' ? decodeTxMessage(msg.content || '') : null;
                  const isSent = (msg.sender || '').toLowerCase() === myAddress;
                  return (
                    <div key={msg.id || i} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                      {txMsg ? (
                        <TransferCard msg={txMsg} isSent={isSent} />
                      ) : (
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[15px] ${isSent ? 'bg-[#1d9bf0] text-white rounded-br-md' : 'bg-[#16181c] text-[#e7e9ea] rounded-bl-md border border-[#2f3336]'}`}>
                          {msg.content || '(encrypted)'}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Input */}
              <div className="border-t border-[#2f3336] p-3 space-y-2">
                {showTransfer && activeChat.type === 'dm' && <TransferForm onSend={sendTransfer} onCancel={() => setShowTransfer(false)} />}
                <div className="flex gap-2 items-end">
                  {activeChat.type === 'dm' && (
                    <button onClick={() => setShowTransfer(!showTransfer)}
                      className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg transition-colors ${showTransfer ? 'bg-[#1d9bf0] text-white' : 'text-[#71767b] hover:bg-[#16181c]'}`}>💸</button>
                  )}
                  <input type="text" value={composing} onChange={e => setComposing(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (activeChat.type === 'dm' ? sendDm() : sendGroupMsg())}
                    placeholder="Start a new message"
                    className="flex-1 bg-transparent border-none outline-none text-[#e7e9ea] text-[15px] placeholder-[#536471] py-2" />
                  <button onClick={activeChat.type === 'dm' ? sendDm : sendGroupMsg} disabled={!composing.trim()}
                    className="bg-[#1d9bf0] text-white font-bold text-sm px-5 py-2 rounded-full hover:bg-[#1a8cd8] disabled:opacity-50 shrink-0">Send</button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-5xl mb-4">💬</div>
              <h3 className="text-[#e7e9ea] text-xl font-bold mb-2">CryptChat</h3>
              <p className="text-[#71767b] text-[15px]">Web3 Encrypted Messaging</p>
              <p className="text-[#71767b] text-sm mt-1">Select a conversation or add friends to get started.</p>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {rightPanel && (
          <aside className="w-80 border-l border-[#2f3336] bg-black overflow-y-auto flex-shrink-0 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#e7e9ea] font-bold text-lg">
                {rightPanel === 'add_friend' ? 'Add Friend' : 'Conversation Info'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-[#71767b] hover:text-[#e7e9ea] text-lg">✕</button>
            </div>

            {rightPanel === 'add_friend' && (
              <div className="space-y-3">
                <p className="text-[#71767b] text-sm">Search by wallet address or name</p>
                <input type="text" placeholder="0x... or username" value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                  className="w-full bg-transparent border border-[#2f3336] rounded-lg px-3 py-2.5 text-sm text-[#e7e9ea] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" autoFocus />
                {searchedUsers.length > 0 && (
                  <div className="space-y-1 border border-[#2f3336] rounded-lg max-h-48 overflow-y-auto">
                    {searchedUsers.map((u: any) => (
                      <button key={u.id} onClick={() => setAddFriendAddr(u.address)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#16181c] transition-colors text-left">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-xs font-bold">
                          {getAvatarLetter(u.displayName || u.address)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[#e7e9ea] text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                          <div className="text-[#71767b] text-xs font-mono truncate">{u.address}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={handleAddFriend} className="w-full bg-[#1d9bf0] text-white font-bold text-sm py-2.5 rounded-full hover:bg-[#1a8cd8]">
                  Send Friend Request
                </button>
                {addFriendMsg && <p className="text-[#00ba7c] text-sm">{addFriendMsg}</p>}
                {addFriendErr && <p className="text-red-400 text-sm">{addFriendErr}</p>}
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'dm' && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-2xl mx-auto">
                  {getAvatarLetter(activeChat.friend.displayName)}
                </div>
                <div>
                  <div className="text-[#e7e9ea] text-lg font-bold">{activeChat.friend.displayName}</div>
                  <div className="text-[#71767b] text-sm font-mono break-all mt-1">{activeChat.friend.address}</div>
                </div>
                <button onClick={() => handleRemove(activeChat.friend.address)}
                  className="w-full border border-red-500/30 text-red-400 font-bold text-sm py-2 rounded-full hover:bg-red-500/10">
                  Remove Friend
                </button>
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'group' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">👥</div>
                  <div className="text-[#e7e9ea] text-lg font-bold">{activeChat.group.name}</div>
                  {activeChat.group.description && <div className="text-[#71767b] text-sm mt-1">{activeChat.group.description}</div>}
                </div>
                <p className="text-[#71767b] text-xs uppercase tracking-wider">Members ({activeChat.group.members?.length || 0})</p>
                {activeChat.group.members?.map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#16181c] transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-sm font-bold">
                      {getAvatarLetter(m.user?.displayName || m.user?.address)}
                    </div>
                    <div className="flex-1">
                      <div className="text-[#e7e9ea] text-sm">{m.user?.displayName || m.user?.address?.slice(0,6)+'...'+m.user?.address?.slice(-4)}</div>
                      <div className="text-[#71767b] text-xs capitalize">{m.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
