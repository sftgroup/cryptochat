import { useState, useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import { authStore } from './lib/api';
import { getOrCreateKeyPair, exportPublicKey, getCachedPublicKey } from './lib/crypto';
import { setPubkeyOnChain } from './lib/registry';

type CryptoStatus = 'ready' | 'error';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!authStore.token);
  const [page, setPage] = useState<'chat' | 'profile'>('chat');
  const [cryptoStatus, setCryptoStatus] = useState<CryptoStatus>('ready');
  const [cryptoError, setCryptoError] = useState('');
  const [myAddress, setMyAddress] = useState('');
  const [myPubkeyRegistered, setMyPubkeyRegistered] = useState(false);

  function handleLogin() { setLoggedIn(true); }

  // Generate ECDH key pair + register public key on backend
  useEffect(() => {
    if (!loggedIn || !authStore.user) return;

    let cancelled = false;
    (async () => {
      try {
        const { ethers } = await import('ethers');
        if (!(window as any).ethereum) {
          setCryptoError('No MetaMask detected');
          setCryptoStatus('error');
          return;
        }
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const address = (await signer.getAddress()).toLowerCase();
        if (cancelled) return;
        setMyAddress(address);
        console.log('[ECDH] wallet:', address);

        // Generate ECDH key pair (or load from localStorage)
        const keyPair = await getOrCreateKeyPair();
        console.log('[ECDH] key pair ready');

        // Register public key on backend AND on-chain
        const pubkeyStr = exportPublicKey(keyPair.publicKey);

        // 1. Backend (fast, for convenience)
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

        // 2. On-chain (decentralized trust)
        try {
          const txHash = await setPubkeyOnChain(pubkeyStr);
          console.log('[ECDH] pubkey on-chain:', txHash);
        } catch (e) {
          console.warn('[ECDH] on-chain pubkey skipped (or not deployed yet)', e);
        }

        setMyPubkeyRegistered(true);

        setCryptoStatus('ready');
      } catch (err: any) {
        console.error('[ECDH] init error:', err);
        if (!cancelled) {
          setCryptoError(err.message);
          setCryptoStatus('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [loggedIn]);

  function handleLogout() {
    authStore.clear();
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
      cryptoStatus={cryptoStatus}
      cryptoError={cryptoError}
      myAddress={myAddress}
      myPubkeyRegistered={myPubkeyRegistered}
      onLogout={handleLogout}
      onGoProfile={() => setPage('profile')}
    />
  );
}
