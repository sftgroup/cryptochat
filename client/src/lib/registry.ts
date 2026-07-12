/**
 * Ceres DID Identity Registry integration.
 *
 * CryptChat 使用 Ceres DID (CeresInviteCore) 作为链上身份体系。
 * - 唯一链上操作: CeresInviteCore.bindInviterBySig() — 首次铸造 DID
 * - ECDH 公钥: 存储在后端 `/api/user/pubkey`（关联到 Ceres DID）
 * - 身份查询: 通过 Ceres API (batch-check) 代替链上 RPC
 * - 不再使用独立 IdentityRegistry 合约
 *
 * Ceres 合约（三链）:
 *   ETH:  0x61D6F790409780F165bc2a4Bf6D7C64C29bb6838
 *   BSC:  0x05df0bdF0AAb4AafBBF715fe091293217eA4C19a
 *   BASE: 0x3Bb6f516c0F29dB6A7210cC22d3f2653e964021d
 *
 * Ceres Graph API: http://43.156.99.215:5000/api
 */

const CERES_API = 'http://43.156.99.215:5000/api';

/** Ceres 用户 profile */
export interface CeresProfile {
  address: string;
  invited: boolean;
  inviter: string | null;
  chainId: number | null;
  inviteeCount: number;
  descendantCount: number;
}

/**
 * 批量检查 Ceres DID 状态。
 * 返回每个地址的 profile（invited / inviter / chainId / count）。
 */
export async function checkCeresDIDs(addresses: string[]): Promise<CeresProfile[]> {
  if (!addresses.length) return [];
  try {
    const res = await fetch(`${CERES_API}/v1/batch-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: addresses.slice(0, 200) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Ceres API: ${res.status}`);
    const data = await res.json();
    return (data.profiles || []) as CeresProfile[];
  } catch (err) {
    console.warn('[Ceres] batch-check failed:', err);
    return [];
  }
}

/**
 * 单地址 Ceres DID 查询
 */
export async function checkCeresDID(address: string): Promise<CeresProfile | null> {
  const results = await checkCeresDIDs([address]);
  return results[0] || null;
}

/**
 * 获取地址图谱（inviter chain + invitees）
 */
export async function getCeresGraph(address: string): Promise<any> {
  try {
    const res = await fetch(`${CERES_API}/v1/address-graph/${address}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Ceres Graph: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[Ceres] graph failed:', err);
    return null;
  }
}

/**
 * 检查地址是否已铸造 Ceres DID
 */
export async function hasCeresDID(address: string): Promise<boolean> {
  const profile = await checkCeresDID(address);
  return profile?.invited === true;
}

// ── Pubkey（关联到 Ceres DID，存储在后台） ──

/** @deprecated — pubkey is now stored on CeresDID chain, no backend needed */
export async function registerPubkey(_pubkeyStr: string): Promise<void> {
  // no-op — pubkey is committed to CeresDID.updateProfile during mint
}

/**
 * 从 CeresDID 链上查询用户 ECDH 公钥。
 *
 * 调用链:
 *   CeresRegistry.tokenOf(address) → tokenId
 *   CeresDID.profiles(tokenId) → { name, bio, avatar, updatedAt }
 *   CeresDID.getUrls(tokenId) → urls[] → 筛选 "ceres:pubkey:..." 条目
 */
export async function getPubkeyOnChain(address: string): Promise<string | null> {
  const { readContract } = await import('wagmi/actions');
  const { config } = await import('../wagmi');
  const { sepolia } = await import('wagmi/chains');

  // CeresDID + CeresRegistry (Sepolia)
  const REGISTRY = '0x662774B1206BeB96C4E100C3b72777e77a5Fb83c' as const;
  const CERES_DID = '0xff4a3F031E950e329eF81a30B4D2f37DFef27101' as const;

  try {
    // 1. Get tokenId
    const tokenId = await readContract(config, {
      address: REGISTRY,
      abi: [{ type: 'function', name: 'tokenOf', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
      functionName: 'tokenOf',
      args: [address as `0x${string}`],
      chainId: sepolia.id,
    } as any);

    if (!tokenId || Number(tokenId) === 0) return null;

    // 2. Get URLs from CeresDID
    const urls = await readContract(config, {
      address: CERES_DID,
      abi: [{ type: 'function', name: 'getUrls', inputs: [{ name: '', type: 'uint256' }], outputs: [{ name: '', type: 'string[]' }], stateMutability: 'view' }],
      functionName: 'getUrls',
      args: [tokenId],
      chainId: sepolia.id,
    } as any);

    if (!urls || !Array.isArray(urls)) return null;

    // 3. Parse pubkey from urls
    for (const url of urls) {
      if (url.startsWith('ceres:pubkey:')) {
        return url.slice('ceres:pubkey:'.length);
      }
    }
    return null;
  } catch (err) {
    console.warn('[Ceres] on-chain pubkey lookup failed:', err);
    return null;
  }
}

/**
 * 获取用户公钥 — 纯链上查询 CeresDID。
 * 所有用户加入 CryptChat 必须先铸造 Ceres DID，铸造时 pubkey 已写入链上 urls。
 * 不需要后台 fallback。
 */
export async function getPubkey(address: string): Promise<string | null> {
  return getPubkeyOnChain(address);
}

/**
 * 兼容旧接口 — getPubkeyFromChain 已废弃，用 Ceres 替代
 */
export async function getPubkeyFromChain(
  address: string
): Promise<{ pubkey: string | null; timestamp: number }> {
  const result = await getPubkey(address);
  return { pubkey: result, timestamp: result ? 1 : 0 };
}

/** 兼容旧接口 — 不再走链上 */
export async function hasPubkeyOnChain(address: string): Promise<boolean> {
  const pk = await getPubkey(address);
  return pk !== null && pk !== '';
}

/** 兼容旧接口 — no-op（不再需要链上 setPubkey） */
export async function setPubkeyOnChain(_pubkeyJson: string): Promise<string> {
  console.warn('[Ceres] setPubkeyOnChain is deprecated — use registerPubkey instead');
  return 'deprecated-no-chain';
}

/** @deprecated */
export function getContractAddress(): string {
  return 'Ceres DID (no contract needed)';
}
