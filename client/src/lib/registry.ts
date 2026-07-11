/**
 * On-chain Identity Registry integration — v2.1.
 *
 * Contract: IdentityRegistry.sol v2 (0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f)
 *
 * Uses viem's createWalletClient + writeContract (same stack as Ceres/wagmi)
 * for proper MetaMask "Contract Interaction" prompts.
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

// ── viem walletClient.writeContract (identical to Ceres/wagmi stack) ──

/**
 * Store ECDH public key on-chain.
 *
 * Uses viem's createWalletClient + writeContract — the exact same flow
 * that Ceres uses via wagmi's useWriteContract.  MetaMask should show
 * a clean "Contract Interaction" prompt.
 */
export async function setPubkeyOnChain(pubkeyJson: string): Promise<string> {
  if (!(window as any).ethereum) throw new Error('MetaMask not found');

  const {
    createWalletClient, custom, createPublicClient, http,
    stringToHex,
  } = await import('viem');
  const { sepolia } = await import('viem/chains');

  const pubkeyBytes = stringToHex(pubkeyJson);

  // Create wallet client from MetaMask — wagmi does the same internally
  const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom((window as any).ethereum),
  });

  const [account] = await walletClient.getAddresses();

  // This is the exact call wagmi's writeContractAsync does
  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'setPubkey',
    args: [pubkeyBytes],
    account,
    chain: sepolia,
  });

  console.log('[Registry] writeContract tx:', hash);

  // Wait for confirmation
  const publicClient = createPublicClient({ chain: sepolia, transport: http() });
  await publicClient.waitForTransactionReceipt({ hash });

  return hash;
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
