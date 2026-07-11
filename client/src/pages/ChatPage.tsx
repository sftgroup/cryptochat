import { useState, useEffect, useCallback, useRef } from 'react';
import { authStore, getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers, getGroups } from '../lib/api';
import { getOrCreateKeyPair, importPublicKey, deriveSharedKey, encrypt, decrypt, tryDecrypt, type KeyPair, type EncryptedMessage } from '../lib/crypto';
import { getPubkeyFromChain } from '../lib/registry';
import { encodeTxMessage, decodeTxMessage } from '../lib/tx';
import type { TxMessage, TransferPayload } from '../lib/tx';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';

interface FriendInfo { userId: string; address: string; displayName: string; avatarUrl: string | null; bio: string | null; status: string; id: string; }
interface FriendReq { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; }
interface GroupInfo { id: string; name: string; description: string | null; members: any[]; }

interface DmMessage { id: string; content: string; sender: string; time: number; }

interface Props {
  cryptoStatus: 'ready' | 'error';
  cryptoError: string;
  myAddress: string;
  myPubkeyRegistered: boolean;
  onLogout: () => void;
  onGoProfile: () => void;
}

export default function ChatPage({ cryptoStatus, cryptoError, myAddress, myPubkeyRegistered, onLogout, onGoProfile }: Props) {
  const user = authStore.user!;
  const [tab, setTab] = useState<'friends' | 'groups' | 'requests'>('friends');
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeChat, setActiveChat] = useState<{ type: 'dm'; friend: FriendInfo } | { type: 'group'; group: GroupInfo } | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [composing, setComposing] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [rightPanel, setRightPanel] = useState<'add_friend' | 'info' | null>(null);
  const [addFriendAddr, setAddFriendAddr] = useState('');
  const [addFriendMsg, setAddFriendMsg] = useState('');
  const [addFriendErr, setAddFriendErr] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const lastMsgIdRef = useRef('');
  const keyPairRef = useRef<KeyPair | null>(null);
  const sharedKeysRef = useRef<Map<string, CryptoKey>>(new Map());

  // Init ECDH key pair
  useEffect(() => {
    getOrCreateKeyPair().then(kp => {
      keyPairRef.current = kp;
      setEncryptionReady(true);
      console.log('[ECDH] ChatPage key pair ready');
    }).catch(err => {
      console.error('[ECDH] ChatPage key pair failed:', err);
    });
    loadData();
  }, []);

  async function loadData() {
    try { setFriends(await getFriends()); } catch {}
    try { setRequests(await getFriendRequests()); } catch {}
    try { setGroups(await getGroups()); } catch {}
  }

  // Fetch friend's public key — on-chain first, backend fallback
  async function getFriendPubkey(address: string): Promise<JsonWebKey | null> {
    // 1. Try on-chain (decentralized, trustless)
    try {
      const chainPubkey = await getPubkeyFromChain(address);
      if (chainPubkey) {
        console.log('[ECDH] got pubkey from chain for:', address.slice(0,10));
        return importPublicKey(chainPubkey);
      }
    } catch (e) {
      console.warn('[ECDH] chain lookup skipped:', e);
    }

    // 2. Fallback to backend
    try {
      const r = await fetch(`/api/user/pubkey/${address}`, { headers: authStore.headers() });
      if (!r.ok) return null;
      const d = await r.json();
      console.log('[ECDH] got pubkey from backend for:', address.slice(0,10));
      return importPublicKey(d.publicKey);
    } catch {
      return null;
    }
  }

  // Get or derive shared key with a friend
  async function getOrDeriveSharedKey(friendAddr: string): Promise<CryptoKey | null> {
    if (!keyPairRef.current) return null;

    // Check cache first
    const cached = sharedKeysRef.current.get(friendAddr.toLowerCase());
    if (cached) return cached;

    // Fetch friend's pubkey and derive
    const peerPubkey = await getFriendPubkey(friendAddr);
    if (!peerPubkey) {
      console.warn('[ECDH] friend pubkey not found for:', friendAddr);
      return null;
    }

    const sharedKey = await deriveSharedKey(
      keyPairRef.current,
      peerPubkey,
      user.userId,
      friendAddr.toLowerCase()
    );

    sharedKeysRef.current.set(friendAddr.toLowerCase(), sharedKey);
    return sharedKey;
  }

  // Load DM messages — decrypt if possible
  async function loadDmMessages(friend: FriendInfo) {
    try {
      const r = await fetch(`/api/dm/${friend.userId}/messages`, { headers: authStore.headers() });
      const d = await r.json();
      if (d.messages) {
        const sharedKey = await getOrDeriveSharedKey(friend.address);

        const decrypted = await Promise.all(
          d.messages.map(async (m: any) => ({
            id: m.id,
            content: await tryDecrypt(sharedKey, m.content),
            sender: m.sender,
            time: m.time,
          }))
        );

        setMessages(decrypted);
        if (d.messages.length > 0) {
          lastMsgIdRef.current = d.messages[d.messages.length - 1].id;
        }
      }
    } catch (err) { console.error('loadDmMessages error:', err); }
  }

  // Poll for new DM messages every 2s
  function startPolling(friend: FriendInfo) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/dm/${friend.userId}/messages`, { headers: authStore.headers() });
        const d = await r.json();
        if (!d.messages) return;

        const sharedKey = await getOrDeriveSharedKey(friend.address);

        const newRaw = d.messages.filter((m: any) => m.id > lastMsgIdRef.current);
        if (newRaw.length === 0) return;

        const newDecrypted = await Promise.all(
          newRaw.map(async (m: any) => ({
            id: m.id,
            content: await tryDecrypt(sharedKey, m.content),
            sender: m.sender,
            time: m.time,
          }))
        );

        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          const toAdd = newDecrypted.filter(m => !existing.has(m.id));
          return [...prev, ...toAdd];
        });
        lastMsgIdRef.current = d.messages[d.messages.length - 1].id;
      } catch {}
    }, 2000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined; }
  }

  useEffect(() => { return stopPolling; }, []);

  const startDmChat = useCallback(async (friend: FriendInfo) => {
    setRightPanel(null);
    setMessages([]);
    lastMsgIdRef.current = '';
    setActiveChat({ type: 'dm', friend });
    await loadDmMessages(friend);
    startPolling(friend);
  }, []);

  async function sendDm() {
    if (!activeChat || activeChat.type !== 'dm' || !composing.trim()) return;

    let content = composing.trim();

    // Encrypt if we have a shared key
    try {
      const sharedKey = await getOrDeriveSharedKey(activeChat.friend.address);
      if (sharedKey) {
        const encrypted = await encrypt(sharedKey, content);
        content = JSON.stringify(encrypted);
      }
    } catch (err) {
      console.warn('[ECDH] encrypt failed, sending plaintext:', err);
    }

    try {
      const r = await fetch(`/api/dm/${activeChat.friend.userId}/messages`, {
        method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ content }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.message) {
          // Decrypt our own sent message for display
          const sharedKey = activeChat ? await getOrDeriveSharedKey(activeChat.friend.address) : null;
          const display = await tryDecrypt(sharedKey, d.message.content);
          setMessages(prev => [...prev, { id: d.message.id, content: display, sender: d.message.sender, time: d.message.time }]);
        }
      }
      setComposing('');
    } catch (err) { console.error('send error:', err); }
  }

  async function sendTransfer(_payload: TransferPayload) { setShowTransfer(false); }

  async function handleAddFriend() {
    setAddFriendErr(''); setAddFriendMsg('');
    if (!addFriendAddr.trim()) return;
    try {
      const result = await sendFriendRequest(addFriendAddr.trim());
      setAddFriendMsg(result.status === 'accepted' ? 'You are now friends! ✅' : 'Friend request sent! 📨');
      loadData();
    } catch (err: any) { setAddFriendErr(err.message); }
  }
  async function handleAccept(reqId: string) { await acceptFriendRequest(reqId); loadData(); }
  async function handleRemove(addr: string) {
    await removeFriend(addr);
    setActiveChat(null);
    stopPolling();
    sharedKeysRef.current.delete(addr.toLowerCase());
    loadData();
  }
  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      await fetch('/api/groups', { method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }) });
      loadData(); setNewGroupName(''); setNewGroupDesc(''); setShowCreateGroup(false);
    } catch {}
    setCreatingGroup(false);
  }

  useEffect(() => {
    if (!addFriendAddr || addFriendAddr.length < 3) { setSearchedUsers([]); return; }
    const t = setTimeout(async () => {
      try { const r = await searchUsers(authStore.token!, addFriendAddr); setSearchedUsers(r.results?.length > 0 ? r.results : (r.users || [])); } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [addFriendAddr]);

  function getAvatarLetter(s: string) { return (s || '?')[0].toUpperCase(); }
  const shortAddr = myAddress ? `${myAddress.slice(0, 6)}...${myAddress.slice(-4)}` : '';

  // Crypto status indicator
  const cryptoReady = cryptoStatus === 'ready' && encryptionReady && myPubkeyRegistered;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden" style={{fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'}}>
      {/* TOP BAR */}
      <header className="flex items-center justify-between px-4 border-b border-[#eff3f4] flex-shrink-0 bg-white" style={{height:52}}>
        <div className="flex items-center gap-3">
          <h1 className="text-[#0f1419] font-bold text-lg">CryptChat</h1>
          {/* E2EE status */}
          {cryptoReady ? (
            <span className="text-[#00ba7c] text-xs bg-[#00ba7c]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ba7c]" />
              🔐 E2EE
            </span>
          ) : (
            <span className="text-[#ffd400] text-xs bg-[#ffd400]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#ffd400] animate-pulse" />
              Setting up encryption...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGoProfile}
            className="flex items-center gap-2 bg-[#f7f9f9] hover:bg-[#eff3f4] border border-[#eff3f4] rounded-full px-3 py-1.5 transition-colors cursor-pointer" title="View Profile">
            <span className={`w-2 h-2 rounded-full ${cryptoReady ? 'bg-[#00ba7c]' : 'bg-[#ffd400] animate-pulse'}`} />
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-xs font-bold">
              {getAvatarLetter(user.displayName || user.address)}
            </div>
            <span className="text-[#0f1419] text-sm font-medium hidden sm:inline">
              {user.displayName || shortAddr}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR */}
        <aside className="w-72 flex flex-col bg-white flex-shrink-0 border-r border-[#eff3f4]">
          <div className="flex border-b border-[#eff3f4]">
            {[
              { key: 'friends' as const, label: 'Friends' },
              { key: 'groups' as const, label: 'Groups' },
              { key: 'requests' as const, label: requests.length > 0 ? `Requests (${requests.length})` : 'Requests' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${tab === t.key ? 'text-[#0f1419] border-b-2 border-[#1d9bf0]' : 'text-[#536471] hover:text-[#0f1419] hover:bg-[#f7f9f9]'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {tab === 'friends' && (
              <>
                {friends.length === 0 && <p className="text-[#536471] text-sm p-4 text-center">No friends yet. Add friends below!</p>}
                {friends.map(f => (
                  <button key={f.userId} onClick={() => startDmChat(f)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-[#eff3f4] ${
                      activeChat?.type === 'dm' && activeChat.friend.userId === f.userId ? 'bg-[#f7f9f9] border-r-2 border-r-[#1d9bf0]' : 'hover:bg-[#f7f9f9]'}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {getAvatarLetter(f.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#0f1419] text-[15px] font-medium truncate">{f.displayName}</div>
                      <div className="text-[#536471] text-[13px] font-mono truncate">{f.address.slice(0,6)}...{f.address.slice(-4)}</div>
                    </div>
                  </button>
                ))}
              </>
            )}
            {tab === 'groups' && (
              <>
                {groups.length === 0 && !showCreateGroup && <p className="text-[#536471] text-sm p-4 text-center">No groups yet.</p>}
                {groups.map(g => (
                  <button key={g.id} onClick={() => { setMessages([]); stopPolling(); setActiveChat({ type: 'group', group: g }); setRightPanel(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-[#eff3f4] ${activeChat?.type === 'group' && activeChat.group.id === g.id ? 'bg-[#f7f9f9] border-r-2 border-r-[#1d9bf0]' : 'hover:bg-[#f7f9f9]'}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#00ba7c] flex items-center justify-center text-white text-sm shrink-0">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#0f1419] text-[15px] font-medium truncate">{g.name}</div>
                      <div className="text-[#536471] text-[13px]">{g.members?.length || 0} member</div>
                    </div>
                  </button>
                ))}
                <div className="p-3 space-y-2">
                  {!showCreateGroup && (
                    <button onClick={() => setShowCreateGroup(true)}
                      className="w-full px-4 py-2 rounded-full text-sm font-semibold text-white bg-[#0f1419] hover:bg-[#272c30] transition-colors">+ Create Group</button>
                  )}
                  <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
                    className="w-full px-4 py-2 rounded-full text-sm font-semibold text-[#0f1419] border border-[#cfd9de] hover:bg-[#f7f9f9] transition-colors">+ Join Group</button>
                </div>
                {showCreateGroup && (
                  <div className="px-3 pb-3 space-y-2">
                    <input type="text" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" autoFocus />
                    <input type="text" placeholder="Description (optional)" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                      className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" />
                    <div className="flex gap-2">
                      <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
                        className="bg-[#1d9bf0] text-white font-bold text-sm px-4 py-2 rounded-full hover:bg-[#1a8cd8] disabled:opacity-50">Create</button>
                      <button onClick={() => setShowCreateGroup(false)} className="text-[#536471] text-sm hover:text-[#0f1419]">Cancel</button>
                    </div>
                  </div>
                )}
              </>
            )}
            {tab === 'requests' && (
              <>
                {requests.length === 0 && <p className="text-[#536471] text-sm p-4 text-center">No pending friend requests.</p>}
                {requests.map(r => (
                  <div key={r.id} className="px-4 py-3 border-b border-[#eff3f4]">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-xs font-bold">
                        {getAvatarLetter(r.displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[#0f1419] text-sm truncate">{r.displayName}</div>
                        <div className="text-[#536471] text-xs font-mono">{r.address.slice(0,6)}...{r.address.slice(-4)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(r.id)} className="bg-[#1d9bf0] text-white font-bold text-xs px-4 py-1.5 rounded-full">Accept</button>
                      <button onClick={() => handleRemove(r.address)} className="text-[#536471] border border-[#cfd9de] font-bold text-xs px-4 py-1.5 rounded-full">Decline</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-[#eff3f4] p-3 space-y-1.5">
            <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
              className={`w-full text-left px-4 py-2 rounded-full text-sm font-semibold transition-colors ${rightPanel === 'add_friend' ? 'bg-[#1d9bf0]/10 text-[#1d9bf0]' : 'text-white bg-[#0f1419] hover:bg-[#272c30]'}`}>
              + Add Friend
            </button>
            <button onClick={onGoProfile}
              className="w-full text-left px-4 py-2 rounded-full text-sm font-semibold text-[#0f1419] border border-[#cfd9de] hover:bg-[#f7f9f9] transition-colors flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                {getAvatarLetter(user.displayName || user.address)}
              </span>
              My Profile
            </button>
          </div>
        </aside>

        {/* CENTER CHAT AREA */}
        <main className="flex-1 flex flex-col bg-white min-w-0">
          {activeChat ? (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#eff3f4] bg-white">
                {activeChat.type === 'dm' ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-sm">
                      {getAvatarLetter(activeChat.friend.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#0f1419] font-semibold text-[15px]">{activeChat.friend.displayName}</div>
                      <div className="text-[#536471] text-[13px] font-mono truncate">{activeChat.friend.address.slice(0,8)}...{activeChat.friend.address.slice(-6)}</div>
                    </div>
                    {/* Lock indicator */}
                    {(() => {
                      const sk = sharedKeysRef.current.get(activeChat.friend.address.toLowerCase());
                      return sk
                        ? <span className="text-[#00ba7c] text-xs bg-[#00ba7c]/10 px-2 py-0.5 rounded-full ml-auto">🔐 E2EE</span>
                        : <span className="text-[#ffd400] text-xs bg-[#ffd400]/10 px-2 py-0.5 rounded-full ml-auto">⚠ Plaintext</span>;
                    })()}
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#00ba7c] flex items-center justify-center text-white text-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[#0f1419] font-semibold text-[15px]">{activeChat.group.name}</div>
                      <div className="text-[#536471] text-[13px]">{activeChat.group.members?.length || 0} members</div>
                    </div>
                  </>
                )}
                <button onClick={() => setRightPanel(rightPanel === 'info' ? null : 'info')}
                  className="text-[#536471] hover:text-[#0f1419] text-sm font-semibold">Info</button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-white">
                {messages.length === 0 && (
                  <p className="text-[#536471] text-sm text-center py-8">
                    {cryptoReady ? '🔐 E2EE ready — send a message to start.' : 'Send a message to start the conversation.'}
                  </p>
                )}
                {messages.map((msg, i) => {
                  const txMsg = (activeChat.type === 'dm') ? decodeTxMessage(msg.content || '') : null;
                  const isSent = msg.sender === user.userId;
                  return (
                    <div key={msg.id || i} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                      {txMsg ? (
                        <TransferCard msg={txMsg} isSent={isSent} />
                      ) : (
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[15px] ${isSent ? 'bg-[#1d9bf0] text-white rounded-br-md' : 'bg-[#f7f9f9] text-[#0f1419] rounded-bl-md border border-[#eff3f4]'}`}>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-[#eff3f4] p-3 bg-white">
                <div className="flex gap-2 items-end">
                  <input type="text" value={composing} onChange={e => setComposing(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && composing.trim()) { sendDm(); } }}
                    placeholder="Start a new message"
                    className="flex-1 bg-transparent border-none outline-none text-[#0f1419] text-[15px] placeholder-[#536471] py-2" />
                  <button onClick={sendDm} disabled={!composing.trim()}
                    className="bg-[#1d9bf0] text-white font-bold text-sm px-5 py-2 rounded-full hover:bg-[#1a8cd8] disabled:opacity-50 shrink-0">Send</button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
              <div className="text-5xl mb-4">💬</div>
              <h3 className="text-[#0f1419] text-xl font-bold mb-2">CryptChat</h3>
              <p className="text-[#536471] text-[15px]">Web3 Encrypted Messaging</p>
              <p className="text-[#536471] text-sm mt-1">
                {cryptoReady ? '🔐 ECDH + AES-256-GCM end-to-end encryption' : 'Setting up encryption...'}
              </p>
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {rightPanel && (
          <aside className="w-80 border-l border-[#eff3f4] bg-white overflow-y-auto flex-shrink-0 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[#0f1419] font-bold text-lg">
                {rightPanel === 'add_friend' ? 'Add Friend' : 'Conversation Info'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-[#536471] hover:text-[#0f1419] text-lg">✕</button>
            </div>

            {rightPanel === 'add_friend' && (
              <div className="space-y-3">
                <p className="text-[#536471] text-sm">Search by wallet address or name</p>
                <input type="text" placeholder="0x... or username" value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                  className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2.5 text-sm text-[#0f1419] placeholder-[#536471] outline-none focus:border-[#1d9bf0]" autoFocus />
                {searchedUsers.length > 0 && (
                  <div className="space-y-1 border border-[#eff3f4] rounded-lg max-h-48 overflow-y-auto">
                    {searchedUsers.map((u: any) => (
                      <button key={u.id} onClick={() => setAddFriendAddr(u.address)}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#f7f9f9] transition-colors text-left">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-xs font-bold">
                          {getAvatarLetter(u.displayName || u.address)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[#0f1419] text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                          <div className="text-[#536471] text-xs font-mono truncate">{u.address}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button onClick={handleAddFriend} className="w-full bg-[#0f1419] text-white font-bold text-sm py-2.5 rounded-full hover:bg-[#272c30]">
                  Send Friend Request
                </button>
                {addFriendMsg && <p className="text-[#00ba7c] text-sm">{addFriendMsg}</p>}
                {addFriendErr && <p className="text-[#f4212e] text-sm">{addFriendErr}</p>}
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'dm' && (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white font-bold text-2xl mx-auto">
                  {getAvatarLetter(activeChat.friend.displayName)}
                </div>
                <div>
                  <div className="text-[#0f1419] text-lg font-bold">{activeChat.friend.displayName}</div>
                  <div className="text-[#536471] text-sm font-mono break-all mt-1">{activeChat.friend.address}</div>
                </div>
                <button onClick={() => handleRemove(activeChat.friend.address)}
                  className="w-full border border-[#f4212e]/30 text-[#f4212e] font-bold text-sm py-2 rounded-full hover:bg-[#f4212e]/5">
                  Remove Friend
                </button>
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'group' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl mb-2">👥</div>
                  <div className="text-[#0f1419] text-lg font-bold">{activeChat.group.name}</div>
                  {activeChat.group.description && <div className="text-[#536471] text-sm mt-1">{activeChat.group.description}</div>}
                </div>
                <p className="text-[#536471] text-xs uppercase tracking-wider">Members ({activeChat.group.members?.length || 0})</p>
                {activeChat.group.members?.map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f7f9f9] transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1d9bf0] to-[#7856ff] flex items-center justify-center text-white text-sm font-bold">
                      {getAvatarLetter(m.user?.displayName || m.user?.address)}
                    </div>
                    <div className="flex-1">
                      <div className="text-[#0f1419] text-sm">{m.user?.displayName || m.user?.address?.slice(0,6)+'...'+m.user?.address?.slice(-4)}</div>
                      <div className="text-[#536471] text-xs capitalize">{m.role}</div>
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
