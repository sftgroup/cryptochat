/**
 * Group Key Management for CryptChat E2EE.
 *
 * Flow:
 *   1. Group creator generates a random AES-256-GCM group key
 *   2. For each member, encrypts the group key with their ECDH shared secret
 *   3. Uploads encrypted envelopes to backend (POST /api/groups/:id/keys)
 *   4. Members fetch their envelope, decrypt with ECDH shared key → get group key
 *   5. All group messages encrypted/decrypted with the group key
 */

import {
  deriveSharedKey,
  generateGroupKey,
  encryptGroupKeyForMember,
  decryptGroupKey,
  encrypt,
  tryDecrypt,
  type KeyPair,
  type EncryptedMessage,
  type GroupKeyEnvelope,
} from './crypto';
import { importPublicKey } from './crypto';
import { authStore } from './api';
import { getPubkeyFromChain } from './registry';

// ── Types ─────────────────────────────────────────────────────────

export interface GroupKeyInfo {
  groupId: string;
  groupKey: CryptoKey;
  version: number;
}

// ── Cache ─────────────────────────────────────────────────────────

/** in-memory cache: groupId → GroupKeyInfo */
const groupKeyCache = new Map<string, GroupKeyInfo>();

// ── Peer pubkey helpers ───────────────────────────────────────────

async function getPeerPubkey(address: string): Promise<JsonWebKey | null> {
  try {
    const result = await getPubkeyFromChain(address);
    if (result.pubkey) return importPublicKey(result.pubkey);
  } catch {}

  try {
    const r = await fetch(`/api/user/pubkey/${address}`, { headers: authStore.headers() });
    if (r.ok) {
      const d = await r.json();
      return importPublicKey(d.publicKey);
    }
  } catch {}

  return null;
}

// ── Group Key Operations ──────────────────────────────────────────

/** Generate a new group key and encrypt it for all members */
export async function setupGroupKeys(
  groupId: string,
  members: { userId: string; address: string }[],
  myKeyPair: KeyPair,
  myUserId: string,
): Promise<GroupKeyInfo> {
  // 1. Generate fresh AES-256-GCM key for the group
  const groupKey = await generateGroupKey();

  // 2. Export raw key for storage
  const rawGroupKey = new Uint8Array(await crypto.subtle.exportKey('raw', groupKey));

  // 3. Encrypt for each member using their ECDH shared key
  const envelopes: Array<{ userId: string; encryptedKey: string; iv: string }> = [];

  for (const member of members) {
    // Skip myself — store raw key locally
    if (member.userId === myUserId) continue;

    const peerPubkey = await getPeerPubkey(member.address);
    if (!peerPubkey) {
      console.warn(`[GroupKeys] Cannot encrypt for ${member.userId} — no pubkey`);
      continue;
    }

    const sharedKey = await deriveSharedKey(myKeyPair, peerPubkey, myUserId, member.address);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      sharedKey,
      rawGroupKey,
    );

    envelopes.push({
      userId: member.userId,
      encryptedKey: arrayBufferToBase64url(encrypted),
      iv: arrayBufferToBase64url(iv.buffer),
    });
  }

  // 4. Upload envelopes to backend
  if (envelopes.length > 0) {
    try {
      await fetch(`/api/groups/${groupId}/keys`, {
        method: 'POST',
        headers: authStore.headers(),
        body: JSON.stringify({ envelopes }),
      });
    } catch (err) {
      console.error('[GroupKeys] Upload envelopes failed:', err);
    }
  }

  // 5. Cache locally
  const info: GroupKeyInfo = { groupId, groupKey, version: 1 };
  groupKeyCache.set(groupId, info);

  return info;
}

/** Fetch my group key envelope from backend and decrypt it */
export async function fetchMyGroupKey(
  groupId: string,
  creatorAddress: string,
  myKeyPair: KeyPair,
  myUserId: string,
): Promise<GroupKeyInfo | null> {
  // Check cache first
  const cached = groupKeyCache.get(groupId);
  if (cached) return cached;

  try {
    const peerPubkey = await getPeerPubkey(creatorAddress);
    if (!peerPubkey) {
      console.warn('[GroupKeys] No creator pubkey, cannot decrypt group key');
      return null;
    }

    const r = await fetch(`/api/groups/${groupId}/keys/my`, { headers: authStore.headers() });
    if (!r.ok) return null;

    const d = await r.json();
    const envelope: GroupKeyEnvelope = d.envelope;

    const sharedKey = await deriveSharedKey(myKeyPair, peerPubkey, myUserId, creatorAddress);
    const groupKey = await decryptGroupKey(envelope, sharedKey);

    const info: GroupKeyInfo = { groupId, groupKey, version: envelope.version || 1 };
    groupKeyCache.set(groupId, info);

    return info;
  } catch (err) {
    console.error('[GroupKeys] Fetch my key failed:', err);
    return null;
  }
}

/** Get group key from cache (if already fetched) */
export function getCachedGroupKey(groupId: string): GroupKeyInfo | undefined {
  return groupKeyCache.get(groupId);
}

/** Encrypt a message with the group key */
export async function encryptGroupMessage(content: string, groupId: string): Promise<{ content: string; keyVersion: number }> {
  const info = groupKeyCache.get(groupId);
  if (!info) {
    // No key — send plaintext (graceful fallback)
    return { content, keyVersion: 0 };
  }

  const encrypted = await encrypt(info.groupKey, content);
  return {
    content: JSON.stringify(encrypted),
    keyVersion: info.version,
  };
}

/** Decrypt a group message */
export async function decryptGroupMessage(
  encryptedContent: string,
  groupId: string,
): Promise<string> {
  const info = groupKeyCache.get(groupId);
  if (!info) return encryptedContent; // No key — show as plaintext

  return tryDecrypt(info.groupKey, encryptedContent);
}

/** Clear group key cache */
export function clearGroupKeyCache(groupId?: string) {
  if (groupId) {
    groupKeyCache.delete(groupId);
  } else {
    groupKeyCache.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
