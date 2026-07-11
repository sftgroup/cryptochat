/**
 * On-chain Identity Registry integration — v2.
 *
 * Contract: IdentityRegistry.sol  v2  (0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f)
 *
 * Key change from v1: `setPubkey(bytes)` instead of `setPubkey(string)`.
 * Uses `bytes` calldata to give MetaMask a clean "Contract interaction" UX.
 *
 * Tech stack: viem (same as Ceres/wagmi) for proper wallet prompts.
 */

const CONTRACT_ADDRESS = '0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f';

const ABI = [
  {
    "type": "function",
    "name": "setPubkey",
    "inputs": [{ "name": "pubkey", "type": "bytes", "internalType": "bytes" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPubkey",
    "inputs": [{ "name": "wallet", "type": "address", "internalType": "address" }],
    "outputs": [
      { "name": "pubkey", "type": "bytes", "internalType": "bytes" },
      { "name": "timestamp", "type": "uint256", "internalType": "uint256" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPubkeys",
    "inputs": [{ "name": "wallets", "type": "address[]", "internalType": "address[]" }],
    "outputs": [
      { "name": "pubkeys", "type": "bytes[]", "internalType": "bytes[]" },
      { "name": "timestamps", "type": "uint256[]", "internalType": "uint256[]" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PubkeySet",
    "inputs": [
      { "name": "wallet", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "pubkey", "type": "bytes", "indexed": false, "internalType": "bytes" },
      { "name": "timestamp", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  }
] as const;

// ── On-chain write (one-time gas, viem-encoded for clean MetaMask UX) ──

/**
 * Store ECDH public key on-chain.
 *
 * Passes raw bytes (0x-prefixed hex) — MetaMask shows "Contract interaction", not "Send ETH".
 * One-time ~0.0001 Sepolia ETH in gas.
 */
export async function setPubkeyOnChain(pubkeyJson: string): Promise<string> {
  if (!(window as any).ethereum) throw new Error('MetaMask not found');

  const { encodeFunctionData, stringToHex, createPublicClient, http } = await import('viem');
  const { sepolia } = await import('viem/chains');

  // Convert JWK JSON string → hex bytes
  const pubkeyBytes = stringToHex(pubkeyJson);

  const data = encodeFunctionData({
    abi: ABI,
    functionName: 'setPubkey',
    args: [pubkeyBytes],
  });

  const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
  const from = accounts[0];

  const txHash = await (window as any).ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from,
      to: CONTRACT_ADDRESS,
      data,
      value: '0x0',
    }],
  });

  console.log('[Registry] setPubkey (bytes) — contract interaction:', txHash);
  console.log('[Registry]   value: 0 ETH, gas only');

  const client = createPublicClient({ chain: sepolia, transport: http() });
  await client.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
  return txHash as string;
}

// ── On-chain read (free) ──────────────────────────────

export async function getPubkeyFromChain(address: string): Promise<{ pubkey: string | null; timestamp: number }> {
  const { createPublicClient, http, hexToString } = await import('viem');
  const { sepolia } = await import('viem/chains');
  const client = createPublicClient({ chain: sepolia, transport: http() });

  try {
    const [pubkeyBytes, timestamp] = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getPubkey',
      args: [address as `0x${string}`],
    }) as [`0x${string}`, bigint];

    const pubkey = (pubkeyBytes && pubkeyBytes !== '0x') ? hexToString(pubkeyBytes) : null;
    return { pubkey, timestamp: Number(timestamp) };
  } catch (err) {
    console.warn('[Registry] getPubkey failed:', err);
    return { pubkey: null, timestamp: 0 };
  }
}

export async function getPubkeysFromChain(addresses: string[]): Promise<{ pubkey: string | null; timestamp: number }[]> {
  if (addresses.length === 0) return [];
  const { createPublicClient, http, hexToString } = await import('viem');
  const { sepolia } = await import('viem/chains');
  const client = createPublicClient({ chain: sepolia, transport: http() });

  try {
    const [pubkeyBytesArr, timestamps] = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getPubkeys',
      args: [addresses as `0x${string}`[]],
    }) as [`0x${string}`[], bigint[]];

    return addresses.map((_, i) => {
      const b = pubkeyBytesArr[i];
      return {
        pubkey: (b && b !== '0x') ? hexToString(b) : null,
        timestamp: Number(timestamps[i]),
      };
    });
  } catch (err) {
    console.warn('[Registry] getPubkeys failed:', err);
    return addresses.map(() => ({ pubkey: null, timestamp: 0 }));
  }
}

export async function hasPubkeyOnChain(address: string): Promise<boolean> {
  const result = await getPubkeyFromChain(address);
  return result.pubkey !== null && result.pubkey !== '';
}

export function getContractAddress(): string {
  return CONTRACT_ADDRESS;
}
