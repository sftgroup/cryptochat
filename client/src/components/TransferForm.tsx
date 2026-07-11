import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import type { TransferPayload } from '../lib/tx';
import { SUPPORTED_CHAINS, getChainConfig, formatAmount } from '../lib/tx';

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
    } catch {}
  }

  async function handleSend() {
    if (!to || !amount || !ethers.isAddress(to)) return;
    setSending(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const chain = getChainConfig(chainId);
      const expectedChainId = chain?.id || 56;

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
      alert(err?.message || 'Failed to prepare transfer');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-[#f7f9f9] border border-[#eff3f4] rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[#0f1419] text-sm font-semibold flex items-center gap-2">
          💸 Send Transfer
        </h3>
        <button onClick={onCancel} className="text-[#536471] hover:text-[#0f1419] text-xs">✕</button>
      </div>

      <div>
        <label className="text-[#536471] text-xs">Chain</label>
        <select value={chainId} onChange={(e) => setChainId(parseInt(e.target.value))}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] mt-1 outline-none focus:border-[#1d9bf0]">
          {SUPPORTED_CHAINS.map(c => (
            <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[#536471] text-xs">To Address</label>
        <input type="text" placeholder="0x..." value={to} onChange={(e) => setTo(e.target.value)}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] mt-1 font-mono outline-none focus:border-[#1d9bf0]" />
      </div>

      <div>
        <label className="text-[#536471] text-xs flex justify-between">
          <span>Amount</span>
          {balance && <span>Balance: {balance} {chain?.symbol}</span>}
        </label>
        <input type="text" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] mt-1 outline-none focus:border-[#1d9bf0]" />
      </div>

      <details className="text-xs">
        <summary className="text-[#536471] cursor-pointer hover:text-[#0f1419]">Token (optional)</summary>
        <input type="text" placeholder="Token contract address" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-xs text-[#0f1419] placeholder-[#536471] mt-1 font-mono outline-none focus:border-[#1d9bf0]" />
        <input type="text" placeholder="Token symbol (e.g. USDT)" value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-xs text-[#0f1419] placeholder-[#536471] mt-1 outline-none focus:border-[#1d9bf0]" />
      </details>

      <div>
        <input type="text" placeholder="Add a note (optional)" value={message} onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-white border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] mt-1 outline-none focus:border-[#1d9bf0]" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-xl text-sm text-[#536471] border border-[#cfd9de] hover:bg-[#f7f9f9] transition-colors">
          Cancel
        </button>
        <button onClick={handleSend} disabled={sending || !to || !amount}
          className="flex-1 px-4 py-2 rounded-xl text-sm bg-[#1d9bf0] text-white font-semibold hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {sending ? 'Preparing...' : 'Send Transfer Card'}
        </button>
      </div>
    </div>
  );
}
