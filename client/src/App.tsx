import { useState, useEffect, lazy, Suspense } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { authStore } from './lib/api';
import { getOrCreateKeyPair, exportPublicKey } from './lib/crypto';
import { checkCeresDID } from './lib/registry';

// Lazy-loaded pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const CeresMintPage = lazy(() => import('./pages/CeresMintPage'));

function LoadingFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔐</div>
        <div style={{ color: '#666', fontSize: 14 }}>Loading CryptChat...</div>
      </div>
    </div>
  );
}

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
              setPage('ceres_mint');
            }
          } else {
            setPage('ceres_mint');
          }
        } catch {
          setPage('ceres_mint');
        }
        setCeresChecked(true);

        // 2. Generate ECDH key pair
        const keyPair = await getOrCreateKeyPair();
        const pubkeyStr = exportPublicKey(keyPair.publicKey);
        setPubkeyJson(pubkeyStr);
        setPubkeyRegistered(true);
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
  }

  function handleCeresDone() {
    setCeresDID(prev => ({ ...prev, hasDID: true }));
    setPage('chat');
  }

  if (!loggedIn) {
    return <Suspense fallback={<LoadingFallback />}><LoginPage onLogin={handleLogin} /></Suspense>;
  }

  if (page === 'ceres_mint' && ceresChecked) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CeresMintPage
          myAddress={myAddress}
          inviterAddress={ceresDID.inviter || undefined}
          pubkeyJson={pubkeyJson}
          onDone={handleCeresDone}
        />
      </Suspense>
    );
  }

  if (page === 'profile') {
    return <Suspense fallback={<LoadingFallback />}><ProfilePage onBack={() => setPage('chat')} onLogout={handleLogout} /></Suspense>;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ChatPage
        myAddress={myAddress}
        ceresDID={ceresDID}
        pubkeyRegistered={pubkeyRegistered}
        onGoProfile={() => setPage('profile')}
      />
    </Suspense>
  );
}
