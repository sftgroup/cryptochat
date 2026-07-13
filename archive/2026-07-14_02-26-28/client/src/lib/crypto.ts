/**
 * ECDH-based end-to-end encryption using MetaMask wallet keys.
 *
 * Flow:
 *   1. On login: generate ephemeral ECDH key pair, store private key in localStorage
 *   2. On friend add: fetch friend's public key, derive shared secret via ECDH
 *   3. Send message: AES-256-GCM encrypt with derived key, send ciphertext via backend
 *   4. Receive message: AES-256-GCM decrypt with derived key
 *   5. Groups: generate symmetric group key, encrypt with each member's ECDH shared secret
 */

// ─── Types ────────────────────────────────────────────────────────

export interface KeyPair {
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}

export interface EncryptedMessage {
  /** base64url encoded ciphertext */
  ciphertext: string;
  /** base64url encoded 12-byte IV/nonce */
  iv: string;
  /** key version tag — increments on key rotation */
  version: number;
}

export interface GroupKeyEnvelope {
  /** Recipient userId */
  userId: string;
  /** AES-GCM encrypted group key (base64url) */
  encryptedKey: string;
  iv: string;
}

// ─── Key Storage ──────────────────────────────────────────────────

const STORAGE_KEY = 'cryptchat_ecdh_key';
const PUBKEY_STORAGE_KEY = 'cryptchat_ecdh_pubkey';

/**
 * Ephemeral ECDH key pair — generates on first use, persists in localStorage.
 * NOT derived from wallet key directly (wallet keys shouldn't leave MetaMask security boundary).
 * Instead: wallet signature proves identity; ECDH keys handle message encryption.
 */
export async function getOrCreateKeyPair(): Promise<KeyPair> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }

  // Generate P-256 key pair (good perf, widely supported in Web Crypto)
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable so we can store/export
    ['deriveBits']
  );

  const privateKey = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const publicKey = await crypto.subtle.exportKey('jwk', kp.publicKey);

  const keyPair: KeyPair = { privateKey, publicKey };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keyPair));
  localStorage.setItem(PUBKEY_STORAGE_KEY, JSON.stringify(publicKey));

  return keyPair;
}

/** Get cached public key JWK (fast, no async needed for registration) */
export function getCachedPublicKey(): JsonWebKey | null {
  const stored = localStorage.getItem(PUBKEY_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

/** Export public key JWK for storage on backend */
export function exportPublicKey(pubKey: JsonWebKey): string {
  return JSON.stringify(pubKey);
}

/** Import peer's public key JWK from backend */
export function importPublicKey(jwkString: string) {
  const jwk = JSON.parse(jwkString);
  return jwk as JsonWebKey;
}

// ─── ECDH Shared Secret ───────────────────────────────────────────

const SHARED_SECRET_CACHE = new Map<string, CryptoKey>();

function cacheKey(myUserId: string, peerUserId: string): string {
  return `${myUserId}:${peerUserId}`;
}

/**
 * Derive shared AES key via ECDH.
 * Result: 256-bit AES-GCM key (only 256 bits of the derived bits are used).
 */
export async function deriveSharedKey(
  myKeyPair: KeyPair,
  peerPublicKeyJwk: JsonWebKey,
  myUserId: string,
  peerUserId: string
): Promise<CryptoKey> {
  const ck = cacheKey(myUserId, peerUserId);
  const cached = SHARED_SECRET_CACHE.get(ck);
  if (cached) return cached;

  // Import our private key
  const myPrivate = await crypto.subtle.importKey(
    'jwk', myKeyPair.privateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, ['deriveBits']
  );

  // Import peer's public key
  const peerPublic = await crypto.subtle.importKey(
    'jwk', peerPublicKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // Derive shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublic },
    myPrivate,
    256 // AES-256-GCM key length
  );

  // Import derived bits as AES-GCM key
  const aesKey = await crypto.subtle.importKey(
    'raw', sharedBits,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );

  SHARED_SECRET_CACHE.set(ck, aesKey);
  return aesKey;
}

// ─── Encrypt / Decrypt ────────────────────────────────────────────

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToArrayBuffer(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Encrypt plaintext with AES-256-GCM using a shared key.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<EncryptedMessage> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoded
  );

  return {
    ciphertext: arrayBufferToBase64url(ciphertext),
    iv: arrayBufferToBase64url(iv.buffer),
    version: 1,
  };
}

/**
 * Decrypt ciphertext with AES-256-GCM using a shared key.
 */
export async function decrypt(
  key: CryptoKey,
  msg: EncryptedMessage
): Promise<string> {
  const ciphertext = base64urlToArrayBuffer(msg.ciphertext);
  const iv = new Uint8Array(base64urlToArrayBuffer(msg.iv));

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * Try to decrypt; if it fails (key mismatch / old format), return the raw content.
 */
export async function tryDecrypt(
  key: CryptoKey | null,
  rawContent: string
): Promise<string> {
  if (!key) return rawContent;

  // Check if it's an encrypted message (looks like JSON with ciphertext/iv fields)
  try {
    const parsed = JSON.parse(rawContent);
    if (parsed.ciphertext && parsed.iv) {
      return await decrypt(key, parsed as EncryptedMessage);
    }
  } catch {
    // Not JSON — plaintext / legacy message
  }

  return rawContent;
}

// ─── Group Key Management ─────────────────────────────────────────

/**
 * Generate a new random 256-bit group key.
 */
export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt the group key for one member using their ECDH shared secret.
 */
export async function encryptGroupKeyForMember(
  groupKey: CryptoKey,
  memberSharedKey: CryptoKey
): Promise<GroupKeyEnvelope> {
  const rawGroupKey = await crypto.subtle.exportKey('raw', groupKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    memberSharedKey,
    rawGroupKey
  );

  return {
    userId: '', // filled in by caller
    encryptedKey: arrayBufferToBase64url(encryptedKey),
    iv: arrayBufferToBase64url(iv.buffer),
  };
}

/**
 * Decrypt a group key envelope using our ECDH shared key with the sender.
 */
export async function decryptGroupKey(
  envelope: GroupKeyEnvelope,
  sharedKey: CryptoKey
): Promise<CryptoKey> {
  const encryptedKey = base64urlToArrayBuffer(envelope.encryptedKey);
  const iv = new Uint8Array(base64urlToArrayBuffer(envelope.iv));

  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    sharedKey,
    encryptedKey
  );

  return crypto.subtle.importKey(
    'raw', rawKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}
