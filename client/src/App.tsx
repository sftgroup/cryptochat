import { useState, useEffect } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import CeresMintPage from './pages/CeresMintPage';
import { authStore } from './lib/api';
import { getOrCreateKeyPair, exportPublicKey } from './lib/crypto';
import { checkCeresDID, registerPubkey } from './lib/registry';

export default function App() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [loggedIn, setLoggedIn] = useState(() => !!authStore.token);
  const [page, setPage] = useState<'chat' | 'profile' | 'ceres_mint'>('chat');
  const [myAddress, setMyAddress] = useState('');
  const [ceresDID, setCeresDID] = useState<{
    hasDID: boolean;
    inviter: string | null;
    inviteeCount: number;
    chainId: number | null;
  }>({ hasDID: false, inviter: null, inviteeCount: 0, chainId: null });
  const [pubkeyRegistered, setPubkeyRegistered] = useState(false);
  const [pubkeyJson, setPubkeyJson] = useState<string>('');
  const [ceresChecked, setCeresChecked] = useState(false);
  const [_ceresCheckError, setCeresCheckError] = useState(false);

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
            if (!profile.invited) {
              // No Ceres DID → show mint page
              setPage('ceres_mint');
            }
          } else {
            setCeresCheckError(true);
            // API 不可用 → 也显示 mint page（用户可以跳过）
            setPage('ceres_mint');
          }
        } catch (e) {
          console.warn('[Ceres] DID check failed:', e);
          setCeresCheckError(true);
          setPage('ceres_mint');
        }
        setCeresChecked(true);

        // 2. Generate ECDH key pair + register pubkey on backend
        const keyPair = await getOrCreateKeyPair();
        const pubkeyStr = exportPublicKey(keyPair.publicKey);
        setPubkeyJson(pubkeyStr);
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
    setCeresChecked(false);
    setCeresCheckError(false);
  }

  // Ceres DID mint done
  function handleCeresDone() {
    setCeresDID(prev => ({ ...prev, hasDID: true }));
    setPage('chat');
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;

  // Ceres DID mint page (shown if no DID yet)
  if (page === 'ceres_mint' && ceresChecked) {
    return (
      <CeresMintPage
        myAddress={myAddress}
        inviterAddress={ceresDID.inviter || undefined}
        pubkeyJson={pubkeyJson}
        onDone={handleCeresDone}
      />
    );
  }

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
