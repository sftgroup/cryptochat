/**
 * On-chain Identity Registry integration.
 * Uses IdentityRegistry.sol on BSC testnet for decentralized public key storage.
 *
 * Contract address: TBD (deployer needs 0.3 tBNB from https://www.bnbchain.org/en/testnet-faucet)
 * Deployer: 0x584Ebb3e9938109bF5DD3b7eaC3a158530c5240A
 */

const CONTRACT_ADDRESS = ''; // Will be filled after deployment

const ABI = [
  {
    "type": "function",
    "name": "setPubkey",
    "inputs": [{ "name": "pubkey", "type": "string", "internalType": "string" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getPubkey",
    "inputs": [{ "name": "wallet", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "string", "internalType": "string" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPubkeys",
    "inputs": [{ "name": "wallets", "type": "address[]", "internalType": "address[]" }],
    "outputs": [{ "name": "", "type": "string[]", "internalType": "string[]" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PubkeySet",
    "inputs": [
      { "name": "wallet", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "pubkey", "type": "string", "indexed": false, "internalType": "string" }
    ],
    "anonymous": false
  }
];

/**
 * Store ECDH public key on-chain. Requires gas (one-time per wallet).
 */
export async function setPubkeyOnChain(pubkeyJson: string): Promise<string> {
  if (!(window as any).ethereum) throw new Error('MetaMask not found');
  if (!CONTRACT_ADDRESS) throw new Error('Contract not deployed yet');

  const { ethers } = await import('ethers');
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  const tx = await contract.setPubkey(pubkeyJson);
  await tx.wait(); // Wait for confirmation
  return tx.hash;
}

/**
 * Get a wallet's ECDH public key from chain. Free (view call, no gas).
 */
export async function getPubkeyFromChain(address: string): Promise<string | null> {
  if (!CONTRACT_ADDRESS) {
    console.warn('[Registry] contract not deployed, skipping on-chain lookup');
    return null;
  }

  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('https://bsc-testnet.publicnode.com');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  try {
    const pubkey = await contract.getPubkey(address);
    return pubkey || null;
  } catch (err) {
    console.warn('[Registry] getPubkey failed:', err);
    return null;
  }
}

/**
 * Batch get multiple wallets' public keys.
 */
export async function getPubkeysFromChain(addresses: string[]): Promise<(string | null)[]> {
  if (!CONTRACT_ADDRESS || addresses.length === 0) return addresses.map(() => null);

  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('https://bsc-testnet.publicnode.com');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

  try {
    const results = await contract.getPubkeys(addresses);
    return results.map((r: string) => r || null);
  } catch (err) {
    console.warn('[Registry] getPubkeys failed:', err);
    return addresses.map(() => null);
  }
}

/**
 * Check if a wallet has registered their public key.
 */
export async function hasPubkeyOnChain(address: string): Promise<boolean> {
  const pk = await getPubkeyFromChain(address);
  return pk !== null && pk !== '';
}

/** Get the contract address (for display/verification) */
export function getContractAddress(): string {
  return CONTRACT_ADDRESS;
}
