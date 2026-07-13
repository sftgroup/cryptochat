import { ethers } from 'ethers';

export type ChainConfig = {
  id: number;
  name: string;
  symbol: string;
  rpc: string;
};

export type TransferPayload = {
  type: 'transfer';
  to: string;
  amount: string;       // wei (native) or token amount
  chainId: number;
  tokenAddress?: string; // undefined = native
  tokenSymbol?: string;
  message?: string;
};

export type TxMessage = {
  kind: 'tx';
  txType: 'transfer' | 'red_packet' | 'nft_share';
  payload: TransferPayload;
  from: string;
  timestamp: number;
};

// Encode/decode for XMTP message body
export function encodeTxMessage(msg: TxMessage): string {
  return JSON.stringify(msg);
}

export function decodeTxMessage(raw: string): TxMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.kind === 'tx' && parsed.txType && parsed.payload) {
      return parsed as TxMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// Supported chains
export const SUPPORTED_CHAINS: ChainConfig[] = [
  { id: 1, name: 'Ethereum', symbol: 'ETH', rpc: 'https://eth.llamarpc.com' },
  { id: 56, name: 'BNB Chain', symbol: 'BNB', rpc: 'https://bsc-dataseed.binance.org' },
  { id: 137, name: 'Polygon', symbol: 'POL', rpc: 'https://polygon.llamarpc.com' },
  { id: 8453, name: 'Base', symbol: 'ETH', rpc: 'https://base.llamarpc.com' },
  { id: 42161, name: 'Arbitrum', symbol: 'ETH', rpc: 'https://arb1.arbitrum.io/rpc' },
];

export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find(c => c.id === chainId);
}

// Format amount for display
export function formatAmount(amountWei: string, decimals: number = 18): string {
  const formatted = ethers.formatUnits(amountWei, decimals);
  // Trim trailing zeros
  return parseFloat(formatted).toString();
}

// Format address for display
export function formatAddress(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}
