/**
 * On-chain Identity Registry integration — v3 (wagmi 3.7.1).
 *
 * Contract: IdentityRegistry.sol v2 (0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f)
 *
 * Uses wagmi core actions. Must be called within WagmiProvider.
 */

import { readContract, writeContract, waitForTransactionReceipt } from 'wagmi/actions';
import { config } from '../wagmi';

const CONTRACT_ADDRESS = '0x253E08cE05ae2C72D19b14506C58CA5Fe9FDdC0f' as const;

const ABI = [
  {
    type: 'function',
    name: 'setPubkey',
    inputs: [{ name: 'pubkey', type: 'bytes' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getPubkey',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [
      { name: 'pubkey', type: 'bytes' },
      { name: 'timestamp', type: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPubkeys',
    inputs: [{ name: 'wallets', type: 'address[]' }],
    outputs: [
      { name: 'pubkeys', type: 'bytes[]' },
      { name: 'timestamps', type: 'uint256[]' },
    ],
    stateMutability: 'view',
  },
] as const;

/** Store ECDH public key on-chain via wagmi writeContract */
export async function setPubkeyOnChain(pubkeyJson: string): Promise<string> {
  const { stringToHex } = await import('viem');
  const pubkeyBytes = stringToHex(pubkeyJson);

  const hash = await writeContract(config, {
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'setPubkey',
    args: [pubkeyBytes],
    chainId: 11155111,
  });

  console.log('[Registry] writeContract tx:', hash);
  await waitForTransactionReceipt(config, { hash });
  return hash;
}

/** Read pubkey from chain (free, view call) */
export async function getPubkeyFromChain(
  address: string
): Promise<{ pubkey: string | null; timestamp: number }> {
  const { hexToString } = await import('viem');

  try {
    const [pubkeyBytes, timestamp] = await readContract(config, {
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getPubkey',
      args: [address as `0x${string}`],
    });

    const pubkey =
      pubkeyBytes && pubkeyBytes !== '0x' ? hexToString(pubkeyBytes as `0x${string}`) : null;
    return { pubkey, timestamp: Number(timestamp) };
  } catch (err) {
    console.warn('[Registry] getPubkey failed:', err);
    return { pubkey: null, timestamp: 0 };
  }
}

export async function getPubkeysFromChain(
  addresses: string[]
): Promise<{ pubkey: string | null; timestamp: number }[]> {
  if (addresses.length === 0) return [];
  const { hexToString } = await import('viem');

  try {
    const [pubkeyBytesArr, timestamps] = await readContract(config, {
      address: CONTRACT_ADDRESS,
      abi: ABI,
      functionName: 'getPubkeys',
      args: [addresses as `0x${string}`[]],
    });

    return addresses.map((_, i) => {
      const b = pubkeyBytesArr[i];
      return {
        pubkey: b && b !== '0x' ? hexToString(b) : null,
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
