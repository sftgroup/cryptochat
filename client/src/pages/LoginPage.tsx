import { useState } from 'react';
import { getNonce, login, authStore } from '../lib/api';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      removeListener: (event: string, cb: (...args: unknown[]) => void) => void;
      selectedAddress?: string;
    };
  }
}

interface Props {
  onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'signing' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!window.ethereum) {
      setError('Please install MetaMask or a Web3 wallet');
      setStatus('error');
      return;
    }

    try {
      setStatus('connecting');
      setError('');

      // Request accounts
      const accounts = (await window.ethereum.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0].toLowerCase();

      // Get nonce
      const nonce = await getNonce(address);

      // Sign
      setStatus('signing');
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [nonce, address],
      }) as string;

      // Login
      const res = await login(address, signature);
      authStore.setSession(res);
      onLogin();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('rejected') || msg.includes('denied')) {
        setError('Signature rejected');
      } else {
        setError(msg);
      }
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Logo + Title */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">💬</div>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">
          Crypt<span className="gradient-text">Chat</span>
        </h1>
        <p className="text-gray-400 text-sm">
          Wallet as identity. End-to-end encrypted.
        </p>
      </div>

      {/* Login Card */}
      <div className="glow-card p-8 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold">
            🔑
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Wallet Sign-In</div>
            <div className="text-gray-500 text-xs">No email or password needed</div>
          </div>
        </div>

        <button
          onClick={handleLogin}
          disabled={status === 'connecting' || status === 'signing'}
          className="btn-brand w-full"
        >
          {status === 'connecting' ? 'Connecting...' :
           status === 'signing' ? 'Signing...' :
           'Connect Wallet'}
        </button>

        {error && (
          <div className="text-red-400 text-xs text-center bg-red-400/10 rounded-lg py-2 px-3">
            {error}
          </div>
        )}

        <div className="text-gray-600 text-xs text-center pt-2">
          Supports MetaMask, Coinbase Wallet, WalletConnect
        </div>
      </div>
    </div>
  );
}
