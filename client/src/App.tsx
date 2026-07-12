import { useState, useEffect } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import { authStore } from './lib/api';
import { getOrCreateKeyPair, exportPublicKey } from './lib/crypto';

export default function App() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const [loggedIn, setLoggedIn] = useState(() => !!authStore.token);
  const [page, setPage] = useState<'chat' | 'profile'>('chat');
  const [myAddress, setMyAddress] = useState('');
  const [myPubkeyRegistered, setMyPubkeyRegistered] = useState(false);

  function handleLogin() {
    setLoggedIn(true);
  }

  // On login: generate key pair + register pubkey on backend (fast, no gas)
  useEffect(() => {
    if (!loggedIn || !authStore.user) return;

    let cancelled = false;
    (async () => {
      try {
        const addr = (address || authStore.user?.address || '').toLowerCase();
        if (!addr) return;
        if (cancelled) return;
        setMyAddress(addr);
        console.log('[ECDH] wallet:', addr);

        // Generate ECDH key pair
        const keyPair = await getOrCreateKeyPair();
        console.log('[ECDH] key pair ready');

        // Register on backend
        const pubkeyStr = exportPublicKey(keyPair.publicKey);
        try {
          await fetch('/api/user/pubkey', {
            method: 'POST',
            headers: authStore.headers(),
            body: JSON.stringify({ publicKey: pubkeyStr }),
          });
          console.log('[ECDH] pubkey registered on backend');
        } catch (e) {
          console.warn('[ECDH] backend pubkey failed', e);
        }

        // Check on-chain
        const { hasPubkeyOnChain } = await import('./lib/registry');
        const alreadyOnChain = await hasPubkeyOnChain(addr);
        if (alreadyOnChain) {
          console.log('[ECDH] pubkey already on-chain');
        }
        setMyPubkeyRegistered(alreadyOnChain);
      } catch (err: any) {
        console.error('[ECDH] init error:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
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
    setMyPubkeyRegistered(false);
  }

  if (!loggedIn) return <LoginPage onLogin={handleLogin} />;
  if (page === 'profile') {
    return <ProfilePage onBack={() => setPage('chat')} onLogout={handleLogout} />;
  }

  return (
    <ChatPage
      myAddress={myAddress}
      myPubkeyRegistered={myPubkeyRegistered}
      onPubkeyRegistered={() => setMyPubkeyRegistered(true)}
      onGoProfile={() => setPage('profile')}
    />
  );
}
