/**
 * EIP-712 based public key attestation.
 *
 * Instead of paying gas for an on-chain transaction, the user signs a typed
 * data message (EIP-712) declaring their ECDH public key.  Anyone can verify
 * the signature with ecrecover — same cryptographic trust, zero gas.
 *
 * IdentityRegistry.sol (0xf9ed...06d8 on Sepolia) is still available as an
 * optional on-chain registry for wallets that prefer it, but the default
 * flow is EIP-712 signatures.
 */

const CONTRACT_ADDRESS = '0xf9ed3547370F5558e2F4516a1a9aF96A9F8506d8'; // Sepolia IdentityRegistry

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

// ── EIP-712 typed data definition ──────────────────────────────

const DOMAIN = {
  name: 'CryptChat',
  version: '1',
  chainId: 11155111,                // Sepolia — used for replay protection
  verifyingContract: CONTRACT_ADDRESS,
} as const;

const TYPES = {
  PubkeyAttestation: [
    { name: 'wallet', type: 'address' },
    { name: 'pubkey', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
} as const;

export interface PubkeyAttestation {
  wallet: string;
  pubkey: string;
  timestamp: number;
  /** EIP-712 signature (0x-prefixed hex) */
  signature: string;
}

// ── EIP-712: sign (zero gas!) ───────────────────────────────────

/**
 * Ask the user to sign an EIP-712 typed message declaring their ECDH
 * public key.  Returns the full attestation object that can be shared
 * with anyone who needs to verify the key binding.
 *
 * Zero gas — this is an off-chain signature, not a transaction.
 */
export async function signPubkeyAttestation(pubkeyJson: string): Promise<PubkeyAttestation> {
  if (!(window as any).ethereum) throw new Error('MetaMask not found');

  const { ethers } = await import('ethers');
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const wallet = (await signer.getAddress()).toLowerCase();
  const timestamp = Math.floor(Date.now() / 1000);

  const value: Omit<PubkeyAttestation, 'signature'> = {
    wallet,
    pubkey: pubkeyJson,
    timestamp,
  };

  // EIP-712 signTypedData — MetaMask shows a clean structured prompt,
  // NOT a transaction.  Zero gas.
  const signature = await signer.signTypedData(DOMAIN, TYPES, value);
  console.log('[Registry] EIP-712 attestation signed by', wallet, '(zero gas)');

  return { ...value, signature };
}

/**
 * Verify an EIP-712 attestation off-chain.  Returns the wallet address
 * that signed it, or null if the signature is invalid.
 */
export async function verifyPubkeyAttestation(attestation: PubkeyAttestation): Promise<string | null> {
  const { ethers } = await import('ethers');
  try {
    const { signature, ...value } = attestation;
    const recovered = ethers.verifyTypedData(DOMAIN, TYPES, value, signature);
    if (recovered.toLowerCase() === attestation.wallet.toLowerCase()) {
      return attestation.wallet;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Legacy on-chain path (gas-required, optional) ────────────────

/**
 * Store ECDH public key on-chain via IdentityRegistry.setPubkey().
 * Requires gas (Sepolia ETH).  Prefer signPubkeyAttestation() for zero-gas flow.
 */
export async function setPubkeyOnChain(pubkeyJson: string): Promise<string> {
  if (!(window as any).ethereum) throw new Error('MetaMask not found');

  const { ethers } = await import('ethers');
  const provider = new ethers.BrowserProvider((window as any).ethereum);
  const signer = await provider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

  const tx = await contract.setPubkey(pubkeyJson, { value: 0 });
  console.log('[Registry] on-chain tx sent:', tx.hash, '(value: 0 ETH, gas only)');
  await tx.wait();
  return tx.hash;
}

// ── On-chain read (free — view call, no gas) ─────────────────────

export async function getPubkeyFromChain(address: string): Promise<string | null> {
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  try {
    const pubkey = await contract.getPubkey(address);
    return pubkey || null;
  } catch (err) {
    console.warn('[Registry] getPubkey failed:', err);
    return null;
  }
}

export async function getPubkeysFromChain(addresses: string[]): Promise<(string | null)[]> {
  if (addresses.length === 0) return [];
  const { ethers } = await import('ethers');
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  try {
    const results = await contract.getPubkeys(addresses);
    return results.map((r: string) => r || null);
  } catch (err) {
    console.warn('[Registry] getPubkeys failed:', err);
    return addresses.map(() => null);
  }
}

export async function hasPubkeyOnChain(address: string): Promise<boolean> {
  const pk = await getPubkeyFromChain(address);
  return pk !== null && pk !== '';
}

export function getContractAddress(): string {
  return CONTRACT_ADDRESS;
}
