import { useState, useEffect, useCallback, useRef } from 'react';
import { authStore, getFriends, getFriendRequests, sendFriendRequest, acceptFriendRequest, removeFriend, searchUsers, getGroups } from '../lib/api';
import { getOrCreateKeyPair, importPublicKey, deriveSharedKey, encrypt, tryDecrypt, type KeyPair } from '../lib/crypto';
import { getPubkey, checkCeresDID } from '../lib/registry';
import { decodeTxMessage } from '../lib/tx';
import type { TransferPayload } from '../lib/tx';
import { setupGroupKeys, fetchMyGroupKey, encryptGroupMessage, decryptGroupMessage } from '../lib/groupKeys';
import TransferCard from '../components/TransferCard';
import TransferForm from '../components/TransferForm';
import IpfsMomentContent from '../components/IpfsMomentContent';
import EmojiPicker from '../components/EmojiPicker';

interface FriendInfo { userId: string; address: string; displayName: string; avatarUrl: string | null; bio: string | null; status: string; id: string; }
interface FriendReq { id: string; userId: string; address: string; displayName: string; avatarUrl: string | null; }
interface GroupInfo { id: string; name: string; description: string | null; members: any[]; }

interface DmMessage { id: string; content: string; sender: string; time: number; }

interface Props {
  myAddress: string;
  ceresDID: { hasDID: boolean; inviter: string | null; inviteeCount: number; chainId: number | null };
  pubkeyRegistered: boolean;
  onGoProfile: () => void;
}

export default function ChatPage({ myAddress, ceresDID, pubkeyRegistered, onGoProfile }: Props) {
  const user = authStore.user!;
  const [tab, setTab] = useState<'friends' | 'groups' | 'moments' | 'requests'>('friends');
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [requests, setRequests] = useState<FriendReq[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [activeChat, setActiveChat] = useState<{ type: 'dm'; friend: FriendInfo } | { type: 'group'; group: GroupInfo } | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [composing, setComposing] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [rightPanel, setRightPanel] = useState<'add_friend' | 'join_group' | 'info' | null>(null);
  const [joinByCodeMode, setJoinByCodeMode] = useState(false);
  const [groupInviteCode, setGroupInviteCode] = useState('');
  const [newGroupCreated, setNewGroupCreated] = useState<{ id: string; name: string; code: string } | null>(null);
  const [inviteCodeLoading, setInviteCodeLoading] = useState(false);
  const [inviteMemberAddr, setInviteMemberAddr] = useState('');
  const [inviteMemberLoading, setInviteMemberLoading] = useState(false);
  const [inviteMemberMsg, setInviteMemberMsg] = useState('');
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
  const groupPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Group chat helpers ────────────────────────────────────────

  async function loadGroupMessages(group: GroupInfo) {
    try {
      // Try to load encryption key first
      const creatorMember = group.members?.find((m: any) => m.role === 'admin' || m.userId === group.members?.[0]?.userId);
      const creatorAddress = creatorMember?.user?.address || '';

      if (keyPairRef.current) {
        await fetchMyGroupKey(group.id, creatorAddress, keyPairRef.current, user.id);
      }

      const r = await fetch(`/api/groups/${group.id}/messages`, { headers: authStore.headers() });
      const d = await r.json();
      if (d.messages) {
        const decrypted = await Promise.all(
          d.messages.map(async (m: any) => ({
            id: m.id,
            content: await decryptGroupMessage(m.content, group.id),
            sender: m.senderId,
            time: new Date(m.createdAt).getTime(),
          }))
        );
        setMessages(decrypted);
        if (d.messages.length > 0) {
          lastMsgIdRef.current = d.messages[d.messages.length - 1].id;
        }
      }
    } catch (err) { console.error('loadGroupMessages:', err); }
  }

  function startGroupPolling(group: GroupInfo) {
    if (groupPollRef.current) clearInterval(groupPollRef.current);
    groupPollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/groups/${group.id}/messages`, { headers: authStore.headers() });
        const d = await r.json();
        if (!d.messages) return;

        const decrypted = await Promise.all(
          d.messages.map(async (m: any) => ({
            id: m.id,
            content: await decryptGroupMessage(m.content, group.id),
            sender: m.senderId,
            time: new Date(m.createdAt).getTime(),
          }))
        );
        setMessages(decrypted);
        if (d.messages.length > 0) lastMsgIdRef.current = d.messages[d.messages.length - 1].id;
      } catch {}
    }, 2000);
  }

  async function sendGroupMessage() {
    if (!activeChat || activeChat.type !== 'group' || !composing.trim()) return;

    const plaintext = composing.trim();
    setComposing('');
    const tempId = 'local-group-' + Date.now();

    // Optimistic: show message immediately
    setMessages(prev => [...prev, { id: tempId, content: plaintext, sender: user.id, time: Date.now() }]);

    try {
      const { content: encrypted, keyVersion } = await encryptGroupMessage(plaintext, activeChat.group.id);

      const r = await fetch(`/api/groups/${activeChat.group.id}/messages`, {
        method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ content: encrypted, keyVersion }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.message) {
          setMessages(prev => prev.map(m => m.id === tempId ? { id: d.message.id, content: plaintext, sender: user.id, time: new Date(d.message.createdAt).getTime() } : m));
        }
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err: any) { console.error('send group msg:', err); alert(err?.message || 'Failed to send message'); }
  }

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

    // Poll friends & requests every 5s so that when someone else accepts our request,
    // we see the update without manual refresh.
    const pollFriends = setInterval(() => {
      getFriends().then(setFriends).catch(() => {});
      getFriendRequests().then(setRequests).catch(() => {});
    }, 5000);
    return () => { clearInterval(pollFriends); stopPolling(); };
  }, []);

  async function loadData() {
    try { setFriends(await getFriends()); } catch {}
    try { setRequests(await getFriendRequests()); } catch {}
    try { setGroups(await getGroups()); } catch {}
    try {
      const r = await fetch('/api/moments', { headers: authStore.headers() });
      if (r.ok) { const d = await r.json(); setMoments(d.moments); }
    } catch {}

    // Auto-fetch group keys for all my groups
    if (keyPairRef.current) {
      try {
        const user = authStore.user;
        if (user) {
          const gs = await getGroups();
          for (const g of gs) {
            const creatorMember = g.members?.find((m: any) => m.role === 'admin');
            const creatorAddress = creatorMember?.user?.address || '';
            if (creatorAddress) {
              fetchMyGroupKey(g.id, creatorAddress, keyPairRef.current, user.id).catch(() => {});
            }
          }
        }
      } catch {}
    }
  }

  // Fetch friend's public key — Ceres DID backend lookup (no chain RPC)
  async function getFriendPubkey(address: string): Promise<JsonWebKey | null> {
    try {
      const pubkey = await getPubkey(address);
      if (pubkey) {
        console.log('[ECDH] got pubkey from backend for:', address.slice(0,10));
        return importPublicKey(pubkey);
      }
    } catch (e) {
      console.warn('[ECDH] pubkey lookup failed:', e);
    }
    return null;
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
      user.id,
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

  // Poll for new DM messages every 2s (re-fetch all for reliability)
  function startPolling(friend: FriendInfo) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/dm/${friend.userId}/messages`, { headers: authStore.headers() });
        const d = await r.json();
        if (!d.messages) return;

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
        if (d.messages.length > 0) lastMsgIdRef.current = d.messages[d.messages.length - 1].id;
      } catch {}
    }, 2000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined; }
    if (groupPollRef.current) { clearInterval(groupPollRef.current); groupPollRef.current = undefined; }
  }

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function formatChatTime(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (d.toDateString() === now.toDateString()) return hm;
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday ' + hm;
    return `${d.getMonth()+1}/${d.getDate()} ${hm}`;
  }

  const startDmChat = useCallback(async (friend: FriendInfo) => {
    setRightPanel(null);
    setMessages([]);
    lastMsgIdRef.current = '';
    setActiveChat({ type: 'dm', friend });
    await loadDmMessages(friend);
    startPolling(friend);
  }, []);

  async function sendDmMessage() {
    if (!activeChat || activeChat.type !== 'dm' || !composing.trim()) return;

    const plaintext = composing.trim();
    setComposing('');
    const tempId = 'local-' + Date.now();

    // Optimistic: show message immediately
    setMessages(prev => [...prev, { id: tempId, content: plaintext, sender: user.id, time: Date.now() }]);

    let content = plaintext;
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
          // Replace temp message with real server message
          setMessages(prev => prev.map(m => m.id === tempId ? { id: d.message.id, content: plaintext, sender: user.id, time: d.message.time } : m));
        }
      } else {
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m.id !== tempId));
      }
    } catch (err) { console.error('send dm error:', err); }
  }

  async function sendMessage() {
    if (!activeChat || !composing.trim()) return;
    if (activeChat.type === 'dm') {
      await sendDmMessage();
    } else {
      await sendGroupMessage();
    }
  }

  async function sendTransfer(_payload: TransferPayload) { setShowTransfer(false); }

  async function handleAddFriend() {
    setAddFriendErr(''); setAddFriendMsg('');
    if (!addFriendAddr.trim()) return;

    // Validate Ceres DID on both sides
    if (!ceresDID.hasDID) {
      setAddFriendErr('You must mint Ceres DID before adding friends.');
      return;
    }

    try {
      // Check if target has Ceres DID
      const targetAddr = addFriendAddr.trim().toLowerCase();
      const profile = await checkCeresDID(targetAddr);
      if (!profile?.invited) {
        setAddFriendErr('This user has not minted Ceres DID yet. Only DID holders can be added.');
        return;
      }

      const result = await sendFriendRequest(targetAddr);
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
      const r = await fetch('/api/groups', { method: 'POST', headers: authStore.headers(),
        body: JSON.stringify({ name: newGroupName.trim(), description: newGroupDesc.trim() || undefined }) });
      const d = await r.json();

      // Setup group encryption keys if key pair is ready
      if (d.group && keyPairRef.current) {
        const members = d.group.members?.map((m: any) => ({ userId: m.userId, address: m.user?.address || '' })) || [];
        try {
          await setupGroupKeys(d.group.id, members, keyPairRef.current, user.id);
        } catch (e) { console.warn('[GroupKeys] setup failed:', e); }
      }

      loadData(); setNewGroupName(''); setNewGroupDesc(''); setShowCreateGroup(false);
      // Auto-generate invite code for new group and show it
      try {
        const ir = await fetch(`/api/groups/${d.group.id}/invite-code`, { method: 'POST', headers: authStore.headers() });
        if (ir.ok) { const idata = await ir.json(); setGroupInviteCode(idata.inviteCode); setNewGroupCreated({ id: d.group.id, name: d.group.name, code: idata.inviteCode }); }
      } catch {}
    } catch {}
    setCreatingGroup(false);
  }

  async function handleInviteMember() {
    if (!activeChat || activeChat.type !== 'group' || !inviteMemberAddr.trim()) return;
    setInviteMemberLoading(true); setInviteMemberMsg('');
    try {
      const r = await fetch(`/api/groups/${activeChat.group.id}/invite`, {
        method: 'POST',
        headers: authStore.headers(),
        body: JSON.stringify({ address: inviteMemberAddr.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setInviteMemberMsg('✅ Member invited!');
        setInviteMemberAddr('');
        // Refresh group members
        const gr = await fetch(`/api/groups/${activeChat.group.id}`, { headers: authStore.headers() });
        if (gr.ok) {
          const gd = await gr.json();
          setActiveChat({ type: 'group', group: gd });
          loadData();
        }
      } else {
        setInviteMemberMsg('❌ ' + (d.error || 'Failed to invite'));
      }
    } catch { setInviteMemberMsg('❌ Network error'); }
    setInviteMemberLoading(false);
  }

  async function handleLeaveGroup() {
    if (!activeChat || activeChat.type !== 'group') return;
    if (!confirm(`Leave "${activeChat.group.name}"?`)) return;
    try {
      const r = await fetch(`/api/groups/${activeChat.group.id}/leave`, {
        method: 'POST', headers: authStore.headers(),
      });
      const d = await r.json();
      if (r.ok) {
        setActiveChat(null); setRightPanel(null); setMessages([]);
        if (d.deleted) setAddFriendMsg('Group deleted (last member left).');
        loadData();
      } else {
        alert(d.error || 'Failed to leave');
      }
    } catch { alert('Network error'); }
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
  const cryptoReady = encryptionReady && pubkeyRegistered;

  return (
    <div className="h-screen flex flex-col bg-[#e8eaed] overflow-hidden" style={{fontFamily:'-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'}}>
      {/* ═══ TOP BAR ═══ */}
      <header className="flex items-center justify-between px-5 flex-shrink-0 border-b border-gray-200" style={{height:52,background:'linear-gradient(135deg,#dce8f5,#c5ddf0)'}}>
        <div className="flex items-center gap-3">
          <div className="text-xl">🔐</div>
          <h1 className="text-gray-900 font-bold text-base tracking-tight">CryptChat</h1>
          {cryptoReady ? (
            <span className="text-emerald-600 text-[11px] bg-white/70 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> E2EE
            </span>
          ) : (
            <span className="text-amber-600 text-[11px] bg-white/70 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Initializing...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onGoProfile}
            className="flex items-center gap-2 bg-white/70 hover:bg-white border border-gray-200 rounded-full px-3 py-1.5 transition-all cursor-pointer" title="View Profile">
            <span className={`w-2 h-2 rounded-full ${cryptoReady ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
            {(() => { const [c1, c2] = getAvatarColor(user.displayName || user.address); return (
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                {getAvatarLetter(user.displayName || user.address)}
              </div>
            );})()}
            <span className="text-gray-700 text-sm font-medium hidden sm:inline">{user.displayName || shortAddr}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden" style={{gap:0}}>
        {/* ═══ LEFT SIDEBAR ═══ */}
        <aside className="w-72 flex flex-col flex-shrink-0 bg-[#dce8f5] border-r border-gray-200">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 bg-[#dce8f5]">
            {[
              { key: 'friends' as const, label: '💬 Friends' },
              { key: 'groups' as const, label: '👥 Groups' },
              { key: 'moments' as const, label: '🌏 Moments' },
              { key: 'requests' as const, label: `📨 Req${requests.length > 0 ? ` (${requests.length})` : ''}` },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  tab === t.key ? 'text-blue-600 border-b-2 border-blue-500 bg-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Content area — each tab in a distinct card */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {tab === 'friends' && (
              <>
                {friends.length === 0 && <p className="text-gray-400 text-sm p-6 text-center">No friends yet.<br/><span className="text-xs">Add friends to start chatting!</span></p>}
                {friends.map(f => { const [c1, c2] = getAvatarColor(f.displayName); return (
                  <div key={f.userId} onClick={() => startDmChat(f)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                      activeChat?.type === 'dm' && activeChat.friend.userId === f.userId ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                    }`}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>
                      {getAvatarLetter(f.displayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800 text-sm font-semibold truncate">{f.displayName}</div>
                      <div className="text-gray-400 text-xs font-mono truncate">{f.address.slice(0,6)}...{f.address.slice(-4)}</div>
                    </div>
                  </div>
                );})}
              </>
            )}

            {tab === 'groups' && (
              <>
                {groups.length === 0 && !showCreateGroup && <p className="text-gray-400 text-sm p-6 text-center">No groups yet.<br/><span className="text-xs">Create or join one!</span></p>}
                {groups.map(g => (
                  <div key={g.id} onClick={async () => { stopPolling(); setMessages([]); lastMsgIdRef.current = ''; setActiveChat({ type: 'group', group: g }); setRightPanel(null); await loadGroupMessages(g); startGroupPolling(g); }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${activeChat?.type === 'group' && activeChat.group.id === g.id ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-gray-50'}`}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm shrink-0 shadow-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800 text-sm font-semibold truncate">{g.name}</div>
                      <div className="text-gray-400 text-xs">{g.members?.length || 0} member</div>
                    </div>
                  </div>
                ))}
                {showCreateGroup && (
                  <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 mt-2">
                    <input type="text" placeholder="Group name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" autoFocus />
                    <input type="text" placeholder="Description (optional)" value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                    <button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()}
                      className="w-full bg-blue-500 text-white font-bold text-sm py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">Create Group</button>
                  </div>
                )}

                {/* New Group Created Modal */}
                {newGroupCreated && (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setNewGroupCreated(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-[360px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
                      <div className="text-center mb-4">
                        <div className="text-5xl mb-3">🎉</div>
                        <h3 className="text-gray-800 text-lg font-bold">{newGroupCreated.name}</h3>
                        <p className="text-gray-500 text-sm mt-1">Group created! Share the invite code:</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-center">
                        <code className="text-blue-800 font-mono font-bold text-3xl tracking-[0.3em] select-all">{newGroupCreated.code}</code>
                        <p className="text-gray-500 text-xs mt-2">Others can join with this 6-character code</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(newGroupCreated.code); alert('Copied!'); }}
                          className="flex-1 bg-blue-500 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-blue-600 transition-colors">Copy Code</button>
                        <button onClick={() => setNewGroupCreated(null)}
                          className="flex-1 bg-gray-100 text-gray-700 font-bold text-sm py-2.5 rounded-lg hover:bg-gray-200 transition-colors">Close</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'moments' && (
              <div className="space-y-2">
                {/* Compose card */}
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
                  <textarea placeholder="What's on your mind? 🌟" value={newMoment} onChange={e => setNewMoment(e.target.value)}
                    rows={3} className="w-full bg-transparent outline-none text-sm text-gray-800 placeholder-gray-400 resize-none" />
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${newMoment.length > 260 ? 'text-orange-500' : 'text-gray-400'}`}>{newMoment.length}/280</span>
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
                            if (r.ok) { const d = await r.json(); setNewMoment(prev => prev.replace(` [Uploading: ${file.name}...]`, ` ipfs://${d.cid}`)); }
                            else { setNewMoment(prev => prev.replace(` [Uploading: ${file.name}...]`, '')); }
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
                        className="bg-blue-500 text-white font-bold text-xs px-4 py-1.5 rounded-full hover:bg-blue-600 disabled:opacity-50 transition-colors">Post</button>
                    </div>
                  </div>
                </div>
                {moments.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-4xl mb-3">🌏</div>
                    <p className="text-gray-400 text-sm">No moments yet. Share something!</p>
                  </div>
                )}
                {moments.map((m: any, i: number) => (
                  <div key={m.id || i} className="bg-white border border-gray-200 rounded-xl p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      {(() => { const [c1,c2] = getAvatarColor(m.authorAddr || m.userId || '?'); return (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(m.authorAddr || m.userId || '?')}</div>
                      );})()}
                      <div className="flex-1 min-w-0"><span className="text-gray-800 text-sm font-semibold">{m.authorName || 'User'}</span><span className="text-gray-400 text-xs ml-2">{m.time || ''}</span></div>
                    </div>
                    <div className="text-gray-700 text-sm pl-10">
                      {m.content?.startsWith('ipfs://') ? <IpfsMomentContent cid={m.content.replace('ipfs://', '')} /> : m.content}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'requests' && (
              <>
                {requests.length === 0 && <div className="text-center py-8"><div className="text-4xl mb-3">📨</div><p className="text-gray-400 text-sm">No pending requests.</p></div>}
                {requests.map(r => { const [c1,c2] = getAvatarColor(r.displayName || r.address); return (
                  <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(r.displayName)}</div>
                      <div className="min-w-0"><div className="text-gray-800 text-sm font-medium truncate">{r.displayName}</div><div className="text-gray-400 text-xs font-mono">{r.address.slice(0,6)}...{r.address.slice(-4)}</div></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(r.id)} className="bg-blue-500 text-white font-bold text-xs px-4 py-1.5 rounded-full hover:bg-blue-600 transition-colors">Accept</button>
                      <button onClick={() => handleRemove(r.address)} className="text-gray-500 border border-gray-200 bg-white font-bold text-xs px-4 py-1.5 rounded-full hover:bg-gray-50 transition-colors">Decline</button>
                    </div>
                  </div>
                );})}
              </>
            )}
          </div>

          {/* Bottom action bar */}
          <div className="border-t border-gray-200 p-2.5 space-y-1.5 bg-[#dce8f5]">
            {tab === 'groups' && (
              !showCreateGroup ? (
                <>
                  <button onClick={() => setShowCreateGroup(true)} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-white bg-gray-800 hover:bg-gray-900 transition-colors">+ Create Group</button>
                  <button onClick={() => setRightPanel(rightPanel === 'join_group' ? null : 'join_group')} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition-colors">+ Join Group</button>
                </>
              ) : (
                <button onClick={() => setShowCreateGroup(false)} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors">Cancel</button>
              )
            )}
            {tab === 'friends' && (
              <button onClick={() => setRightPanel(rightPanel === 'add_friend' ? null : 'add_friend')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${rightPanel === 'add_friend' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'text-white bg-gray-800 hover:bg-gray-900'}`}>+ Add Friend</button>
            )}
            {tab === 'requests' && (
              <button onClick={() => setTab('friends')} className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition-colors">← Back to Friends</button>
            )}
            <button onClick={onGoProfile}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition-colors flex items-center gap-2">
              {(() => { const [c1,c2] = getAvatarColor(user.displayName || user.address); return (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(user.displayName || user.address)}</span>
              );})()}
              My Profile
            </button>
          </div>
        </aside>

        {/* ═══ CENTER CHAT AREA ═══ */}
        <main className="flex-1 flex flex-col min-w-0 bg-white">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200">
                {activeChat.type === 'dm' ? (
                  <>
                    {(() => { const [c1,c2] = getAvatarColor(activeChat.friend.displayName); return (
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(activeChat.friend.displayName)}</div>
                    );})()}
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800 font-semibold text-sm">{activeChat.friend.displayName}</div>
                      <div className="text-gray-400 text-xs font-mono truncate">{activeChat.friend.address.slice(0,8)}...{activeChat.friend.address.slice(-6)}</div>
                    </div>
                    {(() => {
                      const sk = sharedKeysRef.current.get(activeChat.friend.address.toLowerCase());
                      return sk
                        ? <span className="text-emerald-600 text-[11px] bg-emerald-50 px-2.5 py-0.5 rounded-full ml-auto border border-emerald-200 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>🔐 E2EE</span>
                        : <span className="text-amber-600 text-[11px] bg-amber-50 px-2.5 py-0.5 rounded-full ml-auto border border-amber-200 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>⚠ Plaintext</span>;
                    })()}
                  </>
                ) : (
                  <>
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm shadow-sm">👥</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-800 font-semibold text-sm">{activeChat.group.name}</div>
                      <div className="text-gray-400 text-xs">{activeChat.group.members?.length || 0} members</div>
                    </div>
                  </>
                )}
                <button onClick={() => setRightPanel(rightPanel === 'info' ? null : 'info')} className="text-gray-500 hover:text-gray-700 text-sm font-semibold hover:bg-gray-100 px-3 py-1.5 rounded-full transition-colors">Info</button>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#ededed]">
                {messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">🔐</div>
                    <p className="text-gray-400 text-sm">{cryptoReady ? 'E2EE ready — send an encrypted message.' : 'Send a message to start.'}</p>
                  </div>
                )}
                {messages.map((msg, i) => {
                  const txMsg = (activeChat.type === 'dm') ? decodeTxMessage(msg.content || '') : null;
                  const isSent = msg.sender === user.id;
                  return (
                    <div key={msg.id || i} className={`flex items-end gap-2 ${isSent ? 'flex-row-reverse' : ''}`}>
                      {/* Avatar */}
                      <div className="shrink-0">
                        {(() => {
                          if (activeChat.type === 'dm') {
                            const name = isSent ? (user.displayName || myAddress) : activeChat.friend.displayName;
                            const [c1, c2] = getAvatarColor(name);
                            return <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(name)}</div>;
                          }
                          const addr = isSent ? (user.displayName || myAddress) : (msg.sender || '?');
                          const [c1, c2] = getAvatarColor(addr);
                          return <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(addr)}</div>;
                        })()}
                      </div>
                      {/* Message bubble */}
                      <div className={isSent ? 'flex flex-col items-end' : ''} style={{maxWidth:'65%'}}>
                        {txMsg ? (
                          <TransferCard payload={txMsg.payload} isSent={isSent} />
                        ) : (
                          <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            isSent ? 'bg-blue-500 text-white rounded-br-md shadow-sm' : 'bg-white text-gray-800 rounded-bl-md shadow-sm border border-gray-100'
                          }`}>{msg.content}</div>
                        )}
                        <span className="text-[10px] text-gray-400 mt-0.5 px-1">{formatChatTime(msg.time)}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input area — WeChat style: textarea on top, toolbar below */}
              <div className="bg-[#f7f7f7] border-t border-gray-300">
                {showTransfer && <div className="px-3 pt-3"><TransferForm onSend={sendTransfer} onCancel={() => setShowTransfer(false)} /></div>}
                {/* Textarea — tall, rounded */}
                <div className="px-3 pt-3 pb-1">
                  <textarea
                    value={composing}
                    onChange={e => setComposing(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && composing.trim() && !showTransfer) { e.preventDefault(); sendMessage(); } }}
                    placeholder=""
                    rows={3}
                    className="w-full bg-white border border-gray-200 rounded-lg outline-none text-gray-800 text-sm placeholder-gray-400 py-2.5 px-3 resize-none focus:border-gray-300 transition-colors"
                  />
                </div>
                {/* Toolbar row: emoji | file | red-packet | spacer | send */}
                <div className="flex items-center gap-1 px-3 pb-3 relative">
                  <div className="relative">
                    <button onClick={() => setShowEmoji(!showEmoji)}
                      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded transition-colors text-lg cursor-pointer" title="Emoji">
                      😊
                    </button>
                    {showEmoji && (
                      <EmojiPicker onSelect={e => setComposing(prev => prev + e)} onClose={() => setShowEmoji(false)} />
                    )}
                  </div>
                  <label className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded transition-colors cursor-pointer" title="File">
                    📎
                    <input type="file" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0]; if (!file) return;
                      try {
                        setComposing(prev => prev + `\n[Uploading: ${file.name}...]`);
                        const buf = await file.arrayBuffer();
                        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                        const r = await fetch('/api/ipfs/upload', { method: 'POST', headers: { ...authStore.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, data: base64, mimeType: file.type || 'application/octet-stream' }) });
                        if (r.ok) { const d = await r.json(); setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `\nipfs://${d.cid}`).trim()); }
                        else { setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `[Upload failed]`)); }
                      } catch { setComposing(prev => prev.replace(`[Uploading: ${file.name}...]`, `[Upload failed]`)); }
                      e.target.value = '';
                    }} />
                  </label>
                  <button onClick={() => { setShowTransfer(true); }}
                    className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded transition-colors cursor-pointer" title="Red Packet">🧧</button>
                  <div className="flex-1" />
                  <button onClick={sendMessage} disabled={!composing.trim()}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm px-5 py-1.5 rounded-md disabled:opacity-40 transition-colors">Send</button>
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="relative mb-6">
                <div className="text-7xl">💬</div>
                <div className="absolute -bottom-2 -right-2 text-4xl">🔐</div>
              </div>
              <h3 className="text-gray-800 text-2xl font-bold mb-2 tracking-tight">Welcome to CryptChat</h3>
              <p className="text-gray-500 text-sm mb-6">Web3 Encrypted Messaging</p>
              {cryptoReady ? (
                <div className="flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 px-4 py-2 rounded-full border border-emerald-200"><span className="w-2 h-2 rounded-full bg-emerald-500"/>ECDH + AES-256-GCM E2EE Active</div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 px-4 py-2 rounded-full border border-amber-200"><span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"/>Setting up encryption...</div>
              )}
            </div>
          )}
        </main>

        {/* ═══ RIGHT PANEL ═══ */}
        {rightPanel && (
          <aside className="w-80 flex flex-col flex-shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-gray-800 font-bold text-sm">
                {rightPanel === 'add_friend' ? 'Add Friend' : rightPanel === 'join_group' ? 'Join Group' : 'Info'}
              </h3>
              <button onClick={() => setRightPanel(null)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-7 h-7 rounded-full flex items-center justify-center transition-colors">✕</button>
            </div>

            <div className="p-4 space-y-3">
              {(rightPanel === 'add_friend' || rightPanel === 'join_group') && (
                <>
                  <p className="text-gray-500 text-xs">{rightPanel === 'join_group' ? 'Search groups by name' : 'Search by wallet address or name'}</p>
                  {rightPanel === 'add_friend' && (
                    <>
                      <input type="text" placeholder="0x... or username" value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" autoFocus />
                      {searchedUsers.length > 0 && (
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                          {searchedUsers.map((u: any) => { const [c1,c2] = getAvatarColor(u.displayName || u.address); return (
                            <div key={u.id} onClick={() => setAddFriendAddr(u.address)} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(u.displayName || u.address)}</div>
                              <div className="min-w-0"><div className="text-gray-800 text-xs truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div></div>
                            </div>
                          );})}
                        </div>
                      )}
                      <button onClick={handleAddFriend} className="w-full bg-gray-800 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-gray-900 transition-colors">Send Friend Request</button>
                      {addFriendMsg && <p className="text-emerald-600 text-xs bg-emerald-50 px-3 py-2 rounded-lg">{addFriendMsg}</p>}
                      {addFriendErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{addFriendErr}</p>}
                    </>
                  )}
                  {rightPanel === 'join_group' && (
                    <>
                      <div className="flex gap-0 bg-gray-100 rounded-lg p-0.5">
                        <button onClick={() => { setAddFriendAddr(''); setAddFriendMsg(''); setAddFriendErr(''); }}
                          className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${!joinByCodeMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Name</button>
                        <button onClick={() => { setAddFriendAddr(''); setAddFriendMsg(''); setAddFriendErr(''); setJoinByCodeMode(true); }}
                          className={`flex-1 text-xs font-semibold py-2 rounded-md transition-colors ${joinByCodeMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>By Code</button>
                      </div>
                      <input type="text" placeholder={joinByCodeMode ? 'Enter 6-char invite code' : 'Group name'} value={addFriendAddr} onChange={e => setAddFriendAddr(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-400" autoFocus />
                      <button onClick={async () => {
                        if (!addFriendAddr.trim()) return;
                        try {
                          const endpoint = joinByCodeMode ? '/api/groups/join-by-code' : '/api/groups/join';
                          const bodyKey = joinByCodeMode ? 'code' : 'name';
                          const res = await fetch(endpoint, { method: 'POST', headers: authStore.headers(), body: JSON.stringify({ [bodyKey]: addFriendAddr.trim() }) });
                          if (res.ok) { setAddFriendMsg('Joined group! ✅'); loadData(); }
                          else { const d = await res.json(); setAddFriendErr(d.error || 'Failed to join'); }
                        } catch { setAddFriendErr('Network error'); }
                      }} className="w-full bg-emerald-500 text-white font-bold text-sm py-2.5 rounded-lg hover:bg-emerald-600 transition-colors">Join Group</button>
                      {addFriendMsg && <p className="text-emerald-600 text-xs bg-emerald-50 px-3 py-2 rounded-lg">{addFriendMsg}</p>}
                      {addFriendErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{addFriendErr}</p>}
                    </>
                  )}
                </>
              )}

              {rightPanel === 'info' && activeChat && activeChat.type === 'dm' && (
                <div className="space-y-4 text-center mt-2">
                  {(() => { const [c1,c2] = getAvatarColor(activeChat.friend.displayName); return (
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto shadow-md" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(activeChat.friend.displayName)}</div>
                  );})()}
                  <div>
                    <div className="text-gray-800 text-lg font-bold">{activeChat.friend.displayName}</div>
                    <div className="text-gray-500 text-xs font-mono break-all mt-2 bg-gray-50 rounded-lg p-2">{activeChat.friend.address}</div>
                  </div>
                  <button onClick={() => handleRemove(activeChat.friend.address)}
                    className="w-full border border-red-200 text-red-500 font-bold text-sm py-2.5 rounded-lg hover:bg-red-50 transition-colors">Remove Friend</button>
                </div>
              )}

              {rightPanel === 'info' && activeChat && activeChat.type === 'group' && (
                <div className="space-y-3 mt-2">
                  <div className="text-center pb-2">
                    <div className="text-5xl mb-2">👥</div>
                    <div className="text-gray-800 text-lg font-bold">{activeChat.group.name}</div>
                    {activeChat.group.description && <div className="text-gray-500 text-xs mt-1">{activeChat.group.description}</div>}
                  </div>
                  {/* Invite code section */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-gray-500 text-[11px] uppercase tracking-wider font-semibold mb-2">Invite Code</p>
                    {groupInviteCode ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <code className="flex-1 bg-white text-blue-800 font-mono font-bold text-lg tracking-widest py-1.5 px-3 rounded border border-blue-300 text-center">{groupInviteCode}</code>
                          <button onClick={() => { navigator.clipboard.writeText(groupInviteCode); setAddFriendMsg('Copied!'); setTimeout(() => setAddFriendMsg(''), 2000); }}
                            className="bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded hover:bg-blue-600 transition-colors shrink-0">Copy</button>
                        </div>
                        <p className="text-gray-500 text-xs">Share this code — others can join with it.</p>
                      </>
                    ) : (
                      <button onClick={async () => {
                        setInviteCodeLoading(true);
                        try {
                          const res = await fetch(`/api/groups/${activeChat.group.id}/invite-code`, { method: 'POST', headers: authStore.headers() });
                          if (res.ok) { const d = await res.json(); setGroupInviteCode(d.inviteCode); }
                          else { const d = await res.json(); alert(d.error || 'Failed to generate invite code'); }
                        } catch { alert('Network error'); }
                        setInviteCodeLoading(false);
                      }} disabled={inviteCodeLoading} className="w-full bg-blue-500 text-white font-bold text-sm py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">{inviteCodeLoading ? 'Generating...' : 'Generate Invite Code'}</button>
                    )}
                  </div>
                  <div className="border-t border-gray-200 pt-3">
                    {/* Invite member */}
                    <p className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold mb-2">Invite Member</p>
                    <div className="flex gap-2 mb-3">
                      <input type="text" placeholder="Wallet address" value={inviteMemberAddr} onChange={e => setInviteMemberAddr(e.target.value)}
                        className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-blue-400" />
                      <button onClick={handleInviteMember} disabled={inviteMemberLoading || !inviteMemberAddr.trim()}
                        className="bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors shrink-0">
                        {inviteMemberLoading ? '...' : 'Invite'}
                      </button>
                    </div>
                    {inviteMemberMsg && <p className="text-xs mb-3 text-gray-500">{inviteMemberMsg}</p>}

                    <p className="text-gray-400 text-[11px] uppercase tracking-wider font-semibold mb-2">Members ({activeChat.group.members?.length || 0})</p>
                    {activeChat.group.members?.map((m: any) => { const [c1,c2] = getAvatarColor(m.user?.displayName || m.user?.address || '?'); return (
                      <div key={m.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm" style={{background:`linear-gradient(135deg,${c1},${c2})`}}>{getAvatarLetter(m.user?.displayName || m.user?.address || '?')}</div>
                        <div className="flex-1"><div className="text-gray-800 text-xs font-medium">{m.user?.displayName || m.user?.address?.slice(0,6)+'...'+m.user?.address?.slice(-4)}</div><div className="text-gray-400 text-[11px] capitalize">{m.role}</div></div>
                      </div>
                    );})}

                    <button onClick={handleLeaveGroup}
                      className="w-full mt-3 py-2 border border-red-200 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors">
                      Leave Group
                    </button>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
