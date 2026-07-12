import { useState } from 'react';
import { useWriteContract, useChainId, useSwitchChain } from 'wagmi';
import { ethers } from 'ethers';
import type { TransferPayload } from '../lib/tx';
import { getChainConfig, formatAmount, formatAddress } from '../lib/tx';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

interface Props {
  payload: TransferPayload;
  isSent: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function TransferCard({ payload, isSent }: Props) {
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const chain = getChainConfig(payload.chainId);
  const amountDisplay = formatAmount(payload.amount);
  const symbol = payload.tokenSymbol || chain?.symbol || 'ETH';

  async function execute() {
    if (isSent || txHash) return;
    setExecuting(true);
    setError(null);
    try {
      const targetChainId = payload.chainId;

      // Switch chain if needed
      if (chainId !== targetChainId) {
        try {
          await switchChainAsync({ chainId: targetChainId as 11155111 });
        } catch {
          // ignore — try anyway
        }
      }

      let hash: string;

      if (payload.tokenAddress) {
        // ERC20 transfer via wagmi writeContract
        hash = await writeContractAsync({
          address: payload.tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [payload.to as `0x${string}`, BigInt(payload.amount)],
          chainId: 11155111,
        });
      } else {
        // Native ETH — use wallet provider via ethers (simplest)
        const provider = window.ethereum;
        if (!provider) throw new Error('No wallet provider');
        const ethProvider = new ethers.BrowserProvider(provider);
        const signer = await ethProvider.getSigner();
        const tx = await signer.sendTransaction({
          to: payload.to,
          value: payload.amount,
        });
        hash = tx.hash;
      }

      setTxHash(hash);
    } catch (err: any) {
      setError(err?.message?.slice(0, 100) || 'Transaction failed');
    } finally {
      setExecuting(false);
    }
  }

  const explorerUrl = txHash && payload.chainId
    ? payload.chainId === 56 ? `https://bscscan.com/tx/${txHash}`
    : payload.chainId === 1 ? `https://etherscan.io/tx/${txHash}`
    : `https://${payload.chainId === 137 ? 'polygonscan.com' : 'basescan.org'}/tx/${txHash}`
    : null;

  return (
    <div className="bg-[#f7f9f9] border border-[#eff3f4] rounded-2xl p-3 max-w-[300px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">💸</span>
        <span className="text-[#0f1419] text-sm font-semibold">
          {payload.tokenAddress ? 'Token Transfer' : 'Transfer'}
        </span>
        {txHash && <span className="text-[#00ba7c] text-xs ml-auto">✅ Confirmed</span>}
        {error && <span className="text-[#f4212e] text-xs ml-auto">❌ Failed</span>}
      </div>

      <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#1d9bf0] to-[#00ba7c] mb-1">
        {amountDisplay} {symbol}
      </div>

      <div className="text-xs space-y-1 text-[#536471]">
        <div>To: <span className="text-[#0f1419] font-mono">{formatAddress(payload.to)}</span></div>
        <div>Chain: {chain?.name || `Chain ${payload.chainId}`}</div>
        {payload.message && <div className="text-[#536471]/60 italic">"{payload.message}"</div>}
      </div>

      {!txHash && !error && (
        <button onClick={execute} disabled={executing}
          className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1d9bf0] text-white hover:bg-[#1a8cd8] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {executing ? 'Confirming...' : 'Execute Transfer'}
        </button>
      )}

      {txHash && explorerUrl && (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
          className="mt-2 block text-xs text-[#1d9bf0] hover:underline text-center">
          View on Explorer ↗
        </a>
      )}

      {error && <p className="text-xs text-[#f4212e] mt-1">{error}</p>}
    </div>
  );
}
