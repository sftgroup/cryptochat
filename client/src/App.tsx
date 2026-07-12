import { useState, useEffect } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import { authStore } from './lib/api';
import { getOrCreateKeyPair, exportPublicKey } from './lib/crypto';
import { checkCeresDID, registerPubkey } from './lib/registry';

export default function App() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [loggedIn, setLoggedIn] = useState(() => !!authStore.token);
  const [page, setPage] = useState<'chat' | 'profile'>('chat');
  const [myAddress, setMyAddress] = useState('');
  const [ceresDID, setCeresDID] = useState<{
    hasDID: boolean;
    inviter: string | null;
    inviteeCount: number;
    chainId: number | null;
  }>({ hasDID: false, inviter: null, inviteeCount: 0, chainId: null });
  const [pubkeyRegistered, setPubkeyRegistered] = useState(false);

  function handleLogin() {
    setLoggedIn(true);
  }

  // On login: generate key pair + register pubkey + check Ceres DID
  useEffect(() => {
    if (!loggedIn || !authStore.user) return;

    let cancelled = false;
    (async () => {
      try {
        const addr = (address || authStore.user?.address || '').toLowerCase();
        if (!addr) return;
        if (cancelled) return;
        setMyAddress(addr);

        // 1. Check Ceres DID status
        try {
          const profile = await checkCeresDID(addr);
          if (profile) {
            setCeresDID({
              hasDID: profile.invited,
              inviter: profile.inviter,
              inviteeCount: profile.inviteeCount,
              chainId: profile.chainId,
            });
            console.log('[Ceres] DID status:', profile.invited ? `✅ (invited by ${profile.inviter?.slice(0,10)}...)` : '⚠️ not yet cast');
          }
        } catch (e) {
          console.warn('[Ceres] DID check failed:', e);
        }

        // 2. Generate ECDH key pair + register pubkey on backend
        const keyPair = await getOrCreateKeyPair();
        const pubkeyStr = exportPublicKey(keyPair.publicKey);
        try {
          await registerPubkey(pubkeyStr);
          setPubkeyRegistered(true);
          console.log('[ECDH] pubkey registered on backend ✅');
        } catch (e) {
          console.warn('[ECDH] pubkey registration failed:', e);
        }
      } catch (err: any) {
        console.error('[Init] error:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [loggedIn]);

  // Auto-logout if wallet disconnects
  useEffect(() => {
    if (!isConnected && loggedIn) {
      handleLogout();
    }
  }, [isConnected]);

  function handleLogout() {
    authStore.clear();
    disconnect();
    setLoggedIn(false);
    setPage('chat');
    setMyAddress('');
    setPubkeyRegistered(false);
    setCeresDID({ hasDID: false, inviter: null, inviteeCount: 0, chainId: null });
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;
  if (page === 'profile') {
    return <ProfilePage onBack={() => setPage('chat')} onLogout={handleLogout} />;
  }

  return (
    <ChatPage
      myAddress={myAddress}
      ceresDID={ceresDID}
      pubkeyRegistered={pubkeyRegistered}
      onGoProfile={() => setPage('profile')}
    />
  );
}
