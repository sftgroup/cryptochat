import { useState, useEffect, useCallback, useRef } from 'react';
import { authStore, getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers, getGroups } from '../lib/api';
import { getOrCreateKeyPair, importPublicKey, deriveSharedKey, encrypt, tryDecrypt, type KeyPair } from '../lib/crypto';
import { getPubkeyFromChain } from '../lib/registry';
import { decodeTxMessage } from '../lib/tx';
import type { TransferPayload } from '../lib/tx';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';
import IpfsMomentContent from '../components/IpfsMomentContent';

interface FriendInfo { userId: string; address: string; displayName: string; avatarUrl: string | null; bio: string | null; status: string; id: string; }
interface FriendReq { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; }
interface GroupInfo { id: string; name: string; description: string | null; members: any[]; }

interface DmMessage { id: string; content: string; sender: string; time: number; }

interface Props {
  myAddress: string;
  myPubkeyRegistered: boolean;
  onPubkeyRegistered: () => void;
  onGoProfile: () => void;
}

export default function ChatPage({ myAddress, myPubkeyRegistered, onPubkeyRegistered, onGoProfile }: Props) {
  const user = authStore.user!;
  const [tab, setTab] = useState<'friends' | 'groups' | 'moments' | 'requests'>('friends');
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
  const [rightPanel, setRightPanel] = useState<'add_friend' | 'join_group' | 'info' | null>(null);
  const [addFriendAddr, setAddFriendAddr] = useState('');
  const [addFriendMsg, setAddFriendMsg] = useState('');
  const [addFriendErr, setAddFriendErr] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [encryptionReady, setEncryptionReady] = useState(false);
  // Moments
  const [moments, setMoments] = useState<any[]>([]);
  const [newMoment, setNewMoment] = useState('');
  const [postingMoment, setPostingMoment] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
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
    try {
      const r = await fetch('/api/moments', { headers: authStore.headers() });
      if (r.ok) { const d = await r.json(); setMoments(d.moments); }
    } catch {}
  }

  // Fetch friend's public key — on-chain first, backend fallback
  async function getFriendPubkey(address: string): Promise<JsonWebKey | null> {
    // 1. Try on-chain (decentralized, trustless)
    try {
      const result = await getPubkeyFromChain(address);
      if (result.pubkey) {
        console.log('[ECDH] got pubkey from chain for:', address.slice(0,10));
        return importPublicKey(result.pubkey);
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

  /**
   * Ensure pubkey is registered on-chain before any social action.
   * Blocks with a clear error message if gas is insufficient or user rejects.
   */
  async function ensurePubkeyOnChain(): Promise<boolean> {
    if (myPubkeyRegistered) return true;

    setAddFriendErr('');
    setAddFriendMsg('⛽ Identity not yet on-chain. One-time gas required.');

    try {
      const { setPubkeyOnChain } = await import('../lib/registry');
      const { exportPublicKey, getOrCreateKeyPair } = await import('../lib/crypto');
      const kp = await getOrCreateKeyPair();
      await setPubkeyOnChain(exportPublicKey(kp.publicKey));
      onPubkeyRegistered();
      setAddFriendMsg('✅ Identity registered on-chain!');
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('insufficient funds') || msg.includes('Insufficient')) {
        setAddFriendErr('❌ Insufficient Sepolia ETH for gas. Get free test ETH from faucet.quicknode.com/ethereum/sepolia');
      } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User')) {
        setAddFriendErr('❌ Transaction rejected. You must register on-chain before adding friends.');
      } else {
        setAddFriendErr('❌ ' + msg);
      }
      setAddFriendMsg('');
      return false;
    }
  }

  async function handleAddFriend() {
    setAddFriendErr(''); setAddFriendMsg('');
    if (!addFriendAddr.trim()) return;

    // Must register on-chain first
    const ok = await ensurePubkeyOnChain();
    if (!ok) return;

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

    // Must register on-chain first
    const ok = await ensurePubkeyOnChain();
    if (!ok) return;

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
  function getAvatarColor(s: string) {
    const palettes = [
      ['#1d9bf0','#7856ff'],['#f4212e','#ff7a00'],['#00ba7c','#10c469'],
      ['#7856ff','#c069ff'],['#ff7a00','#ffc700'],['#e91e63','#ff5252'],
      ['#00bcd4','#26c6da'],['#7cb342','#aeea00'],['#ff6f00','#ff9100'],
    ];
    let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
    return palettes[Math.abs(h) % palettes.length];
  }
  const shortAddr = myAddress ? `${myAddress.slice(0, 6)}...${myAddress.slice(-4)}` : '';

  // Crypto status indicator
  const cryptoReady = encryptionReady && myPubkeyRegistered;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/30 overflow-hidden" style={{fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'}}>
      {/* TOP BAR — glass-morphism */}
      <header className="flex items-center justify-between px-5 flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/60 shadow-sm" style={{height:52}}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">🔐</div>
          <h1 className="text-slate-800 font-bold text-lg tracking-tight">CryptChat</h1>
          {cryptoReady ? (
            <span className="text-emerald-600 text-xs bg-emerald-50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 border border-emerald-200/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              E2EE
            </span>
          ) : (
            <span className="text-amber-600 text-xs bg-amber-50 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 border border-amber-200/50">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Initializing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGoProfile}
            className="flex items-center gap-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 transition-all cursor-pointer shadow-sm hover:shadow" title="View Profile">
            <span className={`w-2 h-2 rounded-full ${cryptoReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
            {(() => { const [c1, c2] = getAvatarColor(user.displayName || user.address); return (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                {getAvatarLetter(user.displayName || user.address)}
              </div>
            );})()}
            <span className="text-slate-700 text-sm font-medium hidden sm:inline">
              {user.displayName || shortAddr}
            </span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR — light gradient */}
        <aside className="w-72 flex flex-col flex-shrink-0 border-r border-slate-200/60 bg-gradient-to-b from-slate-50/80 to-white">
          <div className="flex border-b border-slate-200/60">
            {[
              { key: 'friends' as const, label: '💬 Friends' },
              { key: 'groups' as const, label: '👥 Groups' },
              { key: 'moments' as const, label: '🌏 Moments' },
              { key: 'requests' as const, label: requests.length > 0 ? `📨 Requests (${requests.length})` : '📨 Requests' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-[11px] font-semibold transition-all duration-200 ${
                  tab === t.key
                    ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto border-b border-slate-200/60">
            {tab === 'friends' && (
              <>
                {friends.length === 0 && <p className="text-slate-400 text-sm p-6 text-center">No friends yet.<br/><span className="text-xs">Add friends below! 🎉</span></p>}
                {friends.map(f => { const [c1, c2] = getAvatarColor(f.displayName); return (
                  <button key={f.userId} onClick={() => startDmChat(f)}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left border-b border-slate-100 hover:bg-white/80 ${
                      activeChat?.type === 'dm' && activeChat.friend.userId === f.userId ? 'bg-white border-r-[3px] border-r-blue-500 shadow-sm' : ''
                    }`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                      {getAvatarLetter(f.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 text-[15px] font-medium truncate">{f.displayName}</div>
                      <div className="text-slate-400 text-[13px] font-mono truncate">{f.address.slice(0,6)}...{f.address.slice(-4)}</div>
                    </div>
                  </button>
                );})}
              </>
            )}
            {tab === 'groups' && (
              <>
                {groups.length === 0 && !showCreateGroup && <p className="text-slate-400 text-sm p-6 text-center">No groups yet.<br/><span className="text-xs">Create one below! 👥</span></p>}
                {groups.map(g => (
                  <button key={g.id} onClick={() => { setMessages([]); stopPolling(); setActiveChat({ type: 'group', group: g }); setRightPanel(null); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 transition-all text-left border-b border-slate-100 hover:bg-white/80 ${activeChat?.type === 'group' && activeChat.group.id === g.id ? 'bg-white border-r-[3px] border-r-emerald-500 shadow-sm' : ''}`}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm shrink-0 shadow-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 text-[15px] font-medium truncate">{g.name}</div>
                      <div className="text-slate-400 text-[13px]">{g.members?.length || 0} member</div>
                    </div>
                  </button>
                ))}
                {showCreateGroup && (
                  <div className="px-3 pb-3 space-y-2 mt-2">
                    <input type="text" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" autoFocus />
                    <input type="text" placeholder="Description (optional)" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" />
                    <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm py-2.5 rounded-full hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 shadow-sm transition-all">Create Group</button>
                  </div>
                )}
              </>
            )}
            {tab === 'moments' && (
              <div className="px-3 py-3 space-y-3">
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 space-y-2">
                  <textarea placeholder="What's on your mind? 🌟" value={newMoment} onChange={e => setNewMoment(e.target.value)}
                    rows={3}
                    className="w-full bg-transparent border-none rounded-xl px-1 py-1 text-sm text-slate-800 placeholder-slate-400 outline-none resize-none" />
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${newMoment.length > 260 ? 'text-orange-500' : 'text-slate-400'}`}>{newMoment.length}/280</span>
                    <div className="flex gap-2 items-center">
                      <label className="text-blue-500 text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full cursor-pointer font-semibold transition-colors">
                        🖼️ Photo
                        <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            setNewMoment(prev => prev + ` [Uploading: ${file.name}...]`);
                            const buf = await file.arrayBuffer();
                            const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                            const r = await fetch('/api/ipfs/upload', { method: 'POST', headers: { ...authStore.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, data: base64, mimeType: file.type }) });
                            if (r.ok) {
                              const d = await r.json();
                              setNewMoment(prev => prev.replace(` [Uploading: ${file.name}...]`, ` ipfs://${d.cid}`));
                            } else {
                              setNewMoment(prev => prev.replace(` [Uploading: ${file.name}...]`, ''));
                            }
                          } catch { setNewMoment(prev => prev.replace(/ \[Uploading.*?\]/, '')); }
                          e.target.value = '';
                        }} />
                      </label>
                      <button onClick={async () => {
                        if (!newMoment.trim()) return;
                        try {
                          setPostingMoment(true);
                          const content = newMoment.trim();
                          const base64 = btoa(unescape(encodeURIComponent(content)));
                          const r = await fetch('/api/ipfs/upload', { method: 'POST', headers: { ...authStore.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: 'moment.txt', data: base64, mimeType: 'text/plain;charset=utf-8' }) });
                          if (!r.ok) throw new Error('IPFS upload failed');
                          const { cid } = await r.json();
                          const mr = await fetch('/api/moments', { method: 'POST', headers: authStore.headers(), body: JSON.stringify({ content: `ipfs://${cid}` }) });
                          if (mr.ok) { const d = await mr.json(); setMoments(prev => [d.moment, ...prev]); setNewMoment(''); }
                        } catch (e) { console.error('post moment error', e); }
                        setPostingMoment(false);
                      }} disabled={!newMoment.trim() || postingMoment}
                        className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold text-sm px-5 py-1.5 rounded-full hover:from-blue-600 hover:to-indigo-600 disabled:opacity-50 shadow-sm transition-all">Post</button>
                    </div>
                  </div>
                </div>
                {moments.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">🌏</div>
                    <p className="text-slate-400 text-sm">No moments yet. Share something!</p>
                  </div>
                )}
                {moments.map((m: any, i: number) => (
                  <div key={m.id || i} className="bg-white rounded-2xl p-3.5 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 mb-2">
                      {(() => { const [c1,c2] = getAvatarColor(m.authorAddr || m.userId || '?'); return (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(m.authorAddr || m.userId || '?')}</div>
                      );})()}
                      <div className="flex-1 min-w-0"><span className="text-slate-800 text-sm font-semibold">{m.authorName || 'User'}</span><span className="text-slate-400 text-xs ml-2">{m.time || ''}</span></div>
                    </div>
                    <div className="text-slate-700 text-sm pl-10">
                      {m.content?.startsWith('ipfs://')
                        ? <IpfsMomentContent cid={m.content.replace('ipfs://', '')} />
                        : m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === 'requests' && (
              <>
                {requests.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">📨</div>
                    <p className="text-slate-400 text-sm">No pending friend requests.</p>
                  </div>
                )}
                {requests.map(r => { const [c1,c2] = getAvatarColor(r.displayName || r.address); return (
                  <div key={r.id} className="px-4 py-3 border-b border-slate-100 bg-white/60">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                        {getAvatarLetter(r.displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-slate-800 text-sm font-medium truncate">{r.displayName}</div>
                        <div className="text-slate-400 text-xs font-mono">{r.address.slice(0,6)}...{r.address.slice(-4)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(r.id)} className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-xs px-4 py-1.5 rounded-full hover:from-blue-600 hover:to-blue-700 shadow-sm transition-all">Accept</button>
                      <button onClick={() => handleRemove(r.address)} className="text-slate-500 border border-slate-200 bg-white font-bold text-xs px-4 py-1.5 rounded-full hover:bg-slate-50 transition-colors">Decline</button>
                    </div>
                  </div>
                );})}
              </>
            )}
          </div>

          {/* Bottom actions */}
          <div className="border-t border-slate-200/60 p-3 space-y-1.5 bg-white/60">
            {tab === 'groups' && (
              <>
                {!showCreateGroup ? (
                  <>
                    <button onClick={() => setShowCreateGroup(true)}
                      className="w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900 shadow-sm transition-all">
                      + Create Group
                    </button>
                    <button onClick={() => setRightPanel(rightPanel === 'join_group' ? null : 'join_group')}
                      className="w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                      + Join Group
                    </button>
                  </>
                ) : (
                  <button onClick={() => setShowCreateGroup(false)}
                    className="w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                )}
              </>
            )}
            {tab === 'friends' && (
              <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
                className={`w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold transition-all shadow-sm ${
                  rightPanel === 'add_friend'
                    ? 'bg-blue-50 text-blue-600 border border-blue-200'
                    : 'text-white bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900'
                }`}>
                + Add Friend
              </button>
            )}
            {tab === 'requests' && (
              <button onClick={() => setTab('friends')}
                className="w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                ← Back to Friends
              </button>
            )}
            <button onClick={onGoProfile}
              className="w-full text-left px-4 py-2.5 rounded-full text-sm font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-all flex items-center gap-2">
              {(() => { const [c1,c2] = getAvatarColor(user.displayName || user.address); return (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                  {getAvatarLetter(user.displayName || user.address)}
                </span>
              );})()}
              My Profile
            </button>
          </div>
        </aside>

        {/* CENTER CHAT AREA */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#f0f2f5]">
          {activeChat ? (
            <>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200/60 bg-white/90 backdrop-blur-sm shadow-sm">
                {activeChat.type === 'dm' ? (
                  <>
                    {(() => { const [c1,c2] = getAvatarColor(activeChat.friend.displayName); return (
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                        {getAvatarLetter(activeChat.friend.displayName)}
                      </div>
                    );})()}
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 font-semibold text-[15px]">{activeChat.friend.displayName}</div>
                      <div className="text-slate-400 text-[13px] font-mono truncate">{activeChat.friend.address.slice(0,8)}...{activeChat.friend.address.slice(-6)}</div>
                    </div>
                    {(() => {
                      const sk = sharedKeysRef.current.get(activeChat.friend.address.toLowerCase());
                      return sk
                        ? <span className="text-emerald-600 text-xs bg-emerald-50 px-2.5 py-0.5 rounded-full ml-auto border border-emerald-200/50 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>🔐 E2EE</span>
                        : <span className="text-amber-600 text-xs bg-amber-50 px-2.5 py-0.5 rounded-full ml-auto border border-amber-200/50 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>⚠ Plaintext</span>;
                    })()}
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm shadow-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-800 font-semibold text-[15px]">{activeChat.group.name}</div>
                      <div className="text-slate-400 text-[13px]">{activeChat.group.members?.length || 0} members</div>
                    </div>
                  </>
                )}
                <button onClick={() => setRightPanel(rightPanel === 'info' ? null : 'info')}
                  className="text-slate-500 hover:text-slate-700 text-sm font-semibold hover:bg-slate-100 px-3 py-1.5 rounded-full transition-colors">Info</button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#f0f2f5]">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">🔐</div>
                    <p className="text-slate-400 text-sm">
                      {cryptoReady ? 'E2EE ready — send an encrypted message to start.' : 'Send a message to start the conversation.'}
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const txMsg = (activeChat.type === 'dm') ? decodeTxMessage(msg.content || '') : null;
                  const isSent = msg.sender === user.userId;
                  return (
                    <div key={msg.id || i} className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}>
                      {txMsg ? (
                        <TransferCard payload={txMsg.payload} isSent={isSent} />
                      ) : (
                        <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
                          isSent
                            ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md shadow-md shadow-blue-500/20'
                            : 'bg-white text-slate-800 rounded-bl-md shadow-sm border border-slate-100'
                        }`}>
                          {msg.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-200/60 p-3 bg-white/90 backdrop-blur-sm">
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setShowTransfer(true); }}
                    className="text-red-500 text-xs bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors font-semibold border border-red-200/50"
                    title="Send Red Packet"
                  >🧧 Red Packet</button>
                  <label className="text-blue-500 text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-full transition-colors font-semibold cursor-pointer border border-blue-200/50" title="Upload file via IPFS">
                    📎 File
                    <input type="file" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setComposing(prev => prev + `\n[Uploading: ${file.name}...]`);
                        const buf = await file.arrayBuffer();
                        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                        const r = await fetch('/api/ipfs/upload', {
                          method: 'POST',
                          headers: { ...authStore.headers(), 'Content-Type': 'application/json' },
                          body: JSON.stringify({ fileName: file.name, data: base64, mimeType: file.type || 'application/octet-stream' }),
                        });
                        if (r.ok) {
                          const d = await r.json();
                          setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `\nipfs://${d.cid}`).trim());
                        } else {
                          setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `[Upload failed]`));
                        }
                      } catch (err) {
                        setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `[Upload failed]`));
                      }
                      e.target.value = '';
                    }} />
                  </label>
                </div>
                {showTransfer && (
                  <div className="mb-2">
                    <TransferForm onSend={sendTransfer} onCancel={() => setShowTransfer(false)} />
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <input type="text" value={composing} onChange={e => setComposing(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && composing.trim() && !showTransfer) { sendDm(); } }}
                    placeholder="Type a message..."
                    className="flex-1 bg-slate-100 border-none outline-none text-slate-800 text-[15px] placeholder-slate-400 py-2.5 px-3 rounded-2xl focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all" />
                  <button onClick={sendDm} disabled={!composing.trim()}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold text-sm px-5 py-2.5 rounded-full hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 shrink-0 shadow-md shadow-blue-500/25 transition-all">
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#f0f2f5]">
              <div className="relative mb-6">
                <div className="text-7xl">💬</div>
                <div className="absolute -bottom-2 -right-2 text-4xl">🔐</div>
              </div>
              <h3 className="text-slate-800 text-2xl font-bold mb-2 tracking-tight">Welcome to CryptChat</h3>
              <p className="text-slate-500 text-[15px] mb-6">Web3 Encrypted Messaging</p>
              {cryptoReady ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 px-4 py-2 rounded-full border border-emerald-200/50">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"/>
                  ECDH + AES-256-GCM End-to-End Encryption Active
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 px-4 py-2 rounded-full border border-amber-200/50">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>
                  Setting up encryption...
                </div>
              )}
            </div>
          )}
        </main>

        {/* RIGHT PANEL */}
        {rightPanel && (
          <aside className="w-80 border-l border-slate-200/60 bg-white overflow-y-auto flex-shrink-0 p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-lg">
                {rightPanel === 'add_friend' ? 'Add Friend' : rightPanel === 'join_group' ? 'Join Group' : 'Conversation Info'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 w-8 h-8 rounded-full flex items-center justify-center transition-colors">✕</button>
            </div>

            {(rightPanel === 'add_friend' || rightPanel === 'join_group') && (
              <div className="space-y-3">
                <p className="text-slate-500 text-sm">
                  {rightPanel === 'join_group' ? 'Search groups by name to join' : 'Search by wallet address or name'}
                </p>
                {rightPanel === 'add_friend' && (
                  <>
                    <input type="text" placeholder="0x... or username" value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all" autoFocus />
                    {searchedUsers.length > 0 && (
                      <div className="space-y-1 border border-slate-100 rounded-xl max-h-48 overflow-y-auto bg-slate-50/50">
                        {searchedUsers.map((u: any) => { const [c1,c2] = getAvatarColor(u.displayName || u.address); return (
                          <button key={u.id} onClick={() => setAddFriendAddr(u.address)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white transition-colors text-left">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                              {getAvatarLetter(u.displayName || u.address)}
                            </div>
                            <div className="min-w-0">
                              <div className="text-slate-800 text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                              <div className="text-slate-400 text-xs font-mono truncate">{u.address}</div>
                            </div>
                          </button>
                        );})}
                      </div>
                    )}
                    <button onClick={handleAddFriend} className="w-full bg-gradient-to-r from-slate-700 to-slate-800 text-white font-bold text-sm py-2.5 rounded-full hover:from-slate-800 hover:to-slate-900 shadow-sm transition-all">
                      Send Friend Request
                    </button>
                    {addFriendMsg && <p className="text-emerald-600 text-sm bg-emerald-50 px-3 py-2 rounded-xl">{addFriendMsg}</p>}
                    {addFriendErr && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-xl">{addFriendErr}</p>}
                  </>
                )}
                {rightPanel === 'join_group' && (
                  <>
                    <input type="text" placeholder="Group name or ID" value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all" autoFocus />
                    <button onClick={async () => {
                      if (!addFriendAddr.trim()) return;
                      try {
                        const res = await fetch('/api/groups/join', { method: 'POST', headers: authStore.headers(), body: JSON.stringify({ name: addFriendAddr.trim() }) });
                        if (res.ok) { setAddFriendMsg('Joined group!'); loadData(); }
                        else { const d = await res.json(); setAddFriendErr(d.error || 'Failed to join'); }
                      } catch { setAddFriendErr('Network error'); }
                    }} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm py-2.5 rounded-full hover:from-emerald-600 hover:to-emerald-700 shadow-sm transition-all">
                      Join Group
                    </button>
                    {addFriendMsg && <p className="text-emerald-600 text-sm bg-emerald-50 px-3 py-2 rounded-xl">{addFriendMsg}</p>}
                    {addFriendErr && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-xl">{addFriendErr}</p>}
                  </>
                )}
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'dm' && (
              <div className="space-y-4 text-center">
                {(() => { const [c1,c2] = getAvatarColor(activeChat.friend.displayName); return (
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl mx-auto shadow-lg" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                    {getAvatarLetter(activeChat.friend.displayName)}
                  </div>
                );})()}
                <div>
                  <div className="text-slate-800 text-xl font-bold">{activeChat.friend.displayName}</div>
                  <div className="text-slate-500 text-sm font-mono break-all mt-1 bg-slate-50 rounded-lg p-2">{activeChat.friend.address}</div>
                </div>
                <button onClick={() => handleRemove(activeChat.friend.address)}
                  className="w-full border border-red-200 text-red-500 font-bold text-sm py-2.5 rounded-full hover:bg-red-50 transition-colors">
                  Remove Friend
                </button>
              </div>
            )}

            {rightPanel === 'info' && activeChat && activeChat.type === 'group' && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-5xl mb-3">👥</div>
                  <div className="text-slate-800 text-xl font-bold">{activeChat.group.name}</div>
                  {activeChat.group.description && <div className="text-slate-500 text-sm mt-1">{activeChat.group.description}</div>}
                </div>
                <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Members ({activeChat.group.members?.length || 0})</p>
                {activeChat.group.members?.map((m: any) => { const [c1,c2] = getAvatarColor(m.user?.displayName || m.user?.address || '?'); return (
                  <div key={m.userId} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                      {getAvatarLetter(m.user?.displayName || m.user?.address || '?')}
                    </div>
                    <div className="flex-1">
                      <div className="text-slate-800 text-sm font-medium">{m.user?.displayName || m.user?.address?.slice(0,6)+'...'+m.user?.address?.slice(-4)}</div>
                      <div className="text-slate-400 text-xs capitalize">{m.role}</div>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
