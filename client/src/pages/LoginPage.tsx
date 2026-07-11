import { useState, useEffect } from 'react';
import { getNonce, login } from '../lib/api';

interface Props { onLogin: () => void; }

export default function LoginPage({ onLogin }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMetamask, setHasMetamask] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHasMetamask(!!(window as any).ethereum);
    setReady(true);
  }, []);

  async function connect() {
    setError('');
    setLoading(true);
    try {
      if (!(window as any).ethereum) {
        setHasMetamask(false);
        setLoading(false);
        return;
      }
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const nonce = await getNonce(address);
      const signature = await signer.signMessage(nonce);
      await login(address, signature);
      onLogin();
    } catch (err: any) {
      if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) {
        setError('You rejected the signature request.');
      } else {
        setError(err?.message?.slice(0, 120) || 'Connection failed');
      }
    }
    setLoading(false);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-[#536471] text-lg">Loading CryptChat...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="tw-avatar tw-avatar-lg mx-auto mb-4 text-4xl">🔒</div>
        <h1 className="text-[#0f1419] text-3xl font-bold">CryptChat</h1>
        <p className="text-[#536471] mt-2 text-[15px]">Encrypted messaging. Wallet identity. Social.</p>
      </div>

      {/* Features */}
      <div className="flex gap-4 mb-8 text-center">
        {[
          { icon: '🔑', label: 'Wallet Sign-In' },
          { icon: '🔐', label: 'End-to-End Encrypted' },
          { icon: '💬', label: 'Chat & Groups' },
        ].map(f => (
          <div key={f.label} className="text-[#536471] text-sm">
            <div className="text-xl mb-1">{f.icon}</div>
            {f.label}
          </div>
        ))}
      </div>

      {/* Connect */}
      <button
        onClick={connect}
        disabled={loading}
        className="tw-btn tw-btn-primary px-10 py-3 text-[15px] font-bold min-w-[240px]"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Signing in...
          </span>
        ) : (
          'Connect Wallet'
        )}
      </button>

      {error && (
        <p className="mt-4 text-[#f4212e] text-sm max-w-sm text-center">{error}</p>
      )}

      {!hasMetamask && (
        <p className="mt-4 text-[#536471] text-sm">
          No wallet detected.{' '}
          <a href="https://metamask.io" target="_blank" className="text-[#1d9bf0] hover:underline">
            Install MetaMask
          </a>
        </p>
      )}

      <p className="mt-8 text-[#536471] text-xs">
        Powered by XMTP · Ceres · BSC
      </p>
    </div>
  );
}
