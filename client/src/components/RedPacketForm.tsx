import { useState } from 'react';
import { ethers } from 'ethers';
import { useAccount, useBalance } from 'wagmi';
import { SUPPORTED_CHAINS, getChainConfig } from '../lib/tx';

interface Props {
  scope: 'dm' | 'group';
  scopeId: string;  // dm: peer userId; group: groupId
  onSend: () => void;
  onCancel: () => void;
}

export default function RedPacketForm({ scope, scopeId, onSend, onCancel }: Props) {
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1');
  const [message, setMessage] = useState('恭喜发财，大吉大利！');
  const [chainId, setChainId] = useState(56);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const { address } = useAccount();
  const { data: balanceData } = useBalance({ address });
  const chain = getChainConfig(chainId);

  const balance = balanceData
    ? ethers.formatUnits(balanceData.value, 18)
    : '0';

  async function handleSend() {
    if (!amount || !count) return;
    setSending(true);
    setError('');
    try {
      const amountWei = ethers.parseUnits(amount, 18).toString();
      const body = JSON.stringify({
        amount: amountWei,
        count: parseInt(count),
        chainId,
        scope,
        scopeId,
        message: message || undefined,
        tokenSymbol: chain?.symbol || 'ETH',
      });

      const r = await fetch('/api/redpacket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create red packet');
      }
      onSend();
    } catch (err: any) {
      setError(err?.message || 'Failed to send red packet');
    } finally {
      setSending(false);
    }
  }

  const totalNum = parseFloat(amount) || 0;
  const countNum = parseInt(count) || 1;
  const avgAmount = countNum > 0 ? (totalNum / countNum).toFixed(4) : '0';

  return (
    <div className="bg-gradient-to-b from-[#fef0f0] to-white border-2 border-[#e63946] rounded-2xl p-4 space-y-3 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[#d90429] text-base font-bold flex items-center gap-2">
          🧧 Send Red Packet
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
      </div>

      {/* Total Amount */}
      <div>
        <label className="text-gray-500 text-xs">Total Amount</label>
        <div className="relative mt-1">
          <input type="number" step="0.001" placeholder="0.0" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-white border border-[#e63946]/30 rounded-lg px-3 py-2.5 text-xl font-bold text-[#d90429] placeholder-gray-300 outline-none focus:border-[#e63946]" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{chain?.symbol}</span>
        </div>
        {balance && (
          <div className="text-xs text-gray-400 mt-1">
            Balance: {parseFloat(balance).toFixed(4)} {chain?.symbol}
            <button onClick={() => setAmount(balance)} className="ml-2 text-[#e63946] hover:underline cursor-pointer">Max</button>
          </div>
        )}
      </div>

      {/* Count */}
      <div>
        <label className="text-gray-500 text-xs">Number of Packets</label>
        <input type="number" min="1" max="100" value={count}
          onChange={e => setCount(e.target.value)}
          className="w-full bg-white border border-[#e63946]/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#e63946]" />
        <div className="text-xs text-gray-400 mt-1">~{avgAmount} {chain?.symbol} each</div>
      </div>

      {/* Blessing Message */}
      <div>
        <label className="text-gray-500 text-xs">Blessing Message</label>
        <input type="text" value={message} onChange={e => setMessage(e.target.value)}
          placeholder="恭喜发财，大吉大利！"
          className="w-full bg-white border border-[#e63946]/30 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#e63946]" />
      </div>

      {/* Chain (collapsed) */}
      <details className="text-xs">
        <summary className="text-gray-400 cursor-pointer hover:text-gray-500">Chain: {chain?.name}</summary>
        <select value={chainId} onChange={e => setChainId(parseInt(e.target.value))}
          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs mt-1">
          {SUPPORTED_CHAINS.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
          ))}
        </select>
      </details>

      {/* Error */}
      {error && <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
          Cancel
        </button>
        <button onClick={handleSend} disabled={sending || !amount || !count}
          className="flex-1 px-4 py-2 rounded-xl text-sm bg-[#e63946] text-white font-bold hover:bg-[#d90429] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
          {sending ? 'Sending...' : '🧧 Send'}
        </button>
      </div>
    </div>
  );
}
