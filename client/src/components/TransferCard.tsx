import { useState } from 'react';
import { ethers } from 'ethers';
import type { TxMessage, TransferPayload } from '../lib/tx';
import { getChainConfig, formatAmount, formatAddress } from '../lib/tx';

interface Props {
  msg: TxMessage;
  isSent: boolean;
}

export default function TransferCard({ msg, isSent }: Props) {
  const [executing, setExecuting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { payload, from } = msg;
  const chain = getChainConfig(payload.chainId);
  const amountDisplay = formatAmount(payload.amount);
  const symbol = payload.tokenSymbol || chain?.symbol || 'ETH';

  async function execute() {
    if (isSent || txHash) return;
    setExecuting(true);
    setError(null);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const chainId = payload.chainId;
      const network = await provider.getNetwork();

      if (network.chainId !== BigInt(chainId)) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x' + chainId.toString(16) }],
          });
        } catch {
          const c = getChainConfig(chainId);
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x' + chainId.toString(16),
              chainName: c?.name || 'Unknown',
              rpcUrls: [c?.rpc || ''],
              nativeCurrency: { name: c?.symbol || 'ETH', symbol: c?.symbol || 'ETH', decimals: 18 },
            }],
          });
        }
      }

      let tx;
      if (payload.tokenAddress) {
        const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
        const data = iface.encodeFunctionData('transfer', [payload.to, payload.amount]);
        tx = await signer.sendTransaction({ to: payload.tokenAddress, data, chainId });
      } else {
        tx = await signer.sendTransaction({ to: payload.to, value: payload.amount, chainId });
      }
      setTxHash(tx.hash);
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
