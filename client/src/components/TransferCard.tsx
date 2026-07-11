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

      // Switch chain if needed
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
        // ERC20 transfer
        const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
        const data = iface.encodeFunctionData('transfer', [payload.to, payload.amount]);
        tx = await signer.sendTransaction({
          to: payload.tokenAddress,
          data,
          chainId,
        });
      } else {
        // Native transfer
        tx = await signer.sendTransaction({
          to: payload.to,
          value: payload.amount,
          chainId,
        });
      }

      setTxHash(tx.hash);
    } catch (err: any) {
      setError(err?.message?.slice(0, 100) || 'Transaction failed');
    } finally {
      setExecuting(false);
    }
  }

  const isOutgoing = !isSent; // For the recipient, it's their action to execute
  const explorerUrl = txHash && chainId
    ? chainId === 56 ? `https://bscscan.com/tx/${txHash}`
    : chainId === 1 ? `https://etherscan.io/tx/${txHash}`
    : `https://${chainId === 137 ? 'polygonscan.com' : 'basescan.org'}/tx/${txHash}`
    : null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 max-w-[300px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">💸</span>
        <span className="text-white text-sm font-semibold">
          {payload.tokenAddress ? 'Token Transfer' : 'Transfer'}
        </span>
        {txHash && <span className="text-green-400 text-xs ml-auto">✅ Confirmed</span>}
        {error && <span className="text-red-400 text-xs ml-auto">❌ Failed</span>}
      </div>

      {/* Amount */}
      <div className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 mb-1">
        {amountDisplay} {symbol}
      </div>

      {/* Details */}
      <div className="text-xs space-y-1 text-gray-400">
        <div>To: <span className="text-gray-300 font-mono">{formatAddress(payload.to)}</span></div>
        <div>Chain: {chain?.name || `Chain ${payload.chainId}`}</div>
        {payload.message && <div className="text-gray-500 italic">"{payload.message}"</div>}
      </div>

      {/* Execute button (for recipient) */}
      {!txHash && !error && (
        <button
          onClick={execute}
          disabled={executing}
          className="mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-blue-500 to-cyan-400 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {executing ? 'Confirming...' : 'Execute Transfer'}
        </button>
      )}

      {/* Explorer link */}
      {txHash && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-xs text-cyan-400 hover:underline text-center"
        >
          View on Explorer ↗
        </a>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
