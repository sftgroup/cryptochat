import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import type { TxMessage, TransferPayload } from '../lib/tx';
import { SUPPORTED_CHAINS, getChainConfig, formatAmount, formatAddress } from '../lib/tx';

interface Props {
  onSend: (payload: TransferPayload) => void;
  onCancel: () => void;
}

export default function TransferForm({ onSend, onCancel }: Props) {
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [chainId, setChainId] = useState(56);
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [balance, setBalance] = useState('');

  const chain = getChainConfig(chainId);

  useEffect(() => {
    loadBalance();
  }, [chainId]);

  async function loadBalance() {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const bal = await provider.getBalance(signer.address);
      setBalance(formatAmount(bal.toString()));
    } catch { /* ignore */ }
  }

  async function handleSend() {
    if (!to || !amount || !ethers.isAddress(to)) return;
    setSending(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const chain = getChainConfig(chainId);
      const expectedChainId = chain?.id || 56;

      // Switch chain if needed
      const network = await provider.getNetwork();
      if (network.chainId !== BigInt(expectedChainId)) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + expectedChainId.toString(16) }],
          });
        } catch {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x' + expectedChainId.toString(16),
              chainName: chain?.name || 'Unknown',
              rpcUrls: [chain?.rpc || ''],
              nativeCurrency: { name: chain?.symbol || 'ETH', symbol: chain?.symbol || 'ETH', decimals: 18 },
            }],
          });
        }
      }

      const amountWei = ethers.parseUnits(amount, 18).toString();

      const payload: TransferPayload = {
        type: 'transfer',
        to,
        amount: amountWei,
        chainId: expectedChainId,
        tokenAddress: tokenAddress || undefined,
        tokenSymbol: tokenSymbol || chain?.symbol || 'ETH',
        message: message || undefined,
      };

      onSend(payload);
    } catch (err: any) {
      console.error('Send error:', err);
      alert(err?.message || 'Failed to prepare transfer');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          💸 Send Transfer
        </h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
      </div>

      {/* Chain */}
      <div>
        <label className="text-gray-500 text-xs">Chain</label>
        <select
          value={chainId}
          onChange={(e) => setChainId(parseInt(e.target.value))}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white mt-1"
        >
          {SUPPORTED_CHAINS.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
          ))}
        </select>
      </div>

      {/* Recipient */}
      <div>
        <label className="text-gray-500 text-xs">To Address</label>
        <input
          type="text"
          placeholder="0x..."
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 mt-1 font-mono"
        />
      </div>

      {/* Amount */}
      <div>
        <label className="text-gray-500 text-xs flex justify-between">
          <span>Amount</span>
          {balance && <span className="text-gray-600">Balance: {balance} {chain?.symbol}</span>}
        </label>
        <input
          type="text"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 mt-1"
        />
      </div>

      {/* Optional: Token contract */}
      <details className="text-xs">
        <summary className="text-gray-500 cursor-pointer hover:text-gray-400">Token (optional)</summary>
        <input
          type="text"
          placeholder="Token contract address"
          value={tokenAddress}
          onChange={(e) => setTokenAddress(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 mt-1 font-mono"
        />
        <input
          type="text"
          placeholder="Token symbol (e.g. USDT)"
          value={tokenSymbol}
          onChange={(e) => setTokenSymbol(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-700 mt-1"
        />
      </details>

      {/* Message */}
      <div>
        <input
          type="text"
          placeholder="Add a note (optional)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 mt-1"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-xl text-sm text-gray-400 border border-white/10 hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          disabled={sending || !to || !amount}
          className="flex-1 px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-cyan-400 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {sending ? 'Preparing...' : 'Send Transfer Card'}
        </button>
      </div>
    </div>
  );
}
