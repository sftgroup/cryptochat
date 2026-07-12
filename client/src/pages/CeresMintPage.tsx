/**
 * Ceres DID Mint Page — built into CryptChat.
 *
 * Flow:
 *   1. User connects wallet → logged in to CryptChat
 *   2. App checks Ceres DID status (via Ceres API)
 *   3. If not cast → show this page
 *   4. User fills name/bio → clicks "铸造 Ceres DID"
 *   5. Wallet: bindInviterBySig (EIP-712) → createProfile (mint DID NFT)
 *   6. On success → redirect to ChatPage
 *
 * Contracts (Sepolia testnet):
 *   CeresInviteCore: 0xCD142BDDaf0fe4509C269CC1A5bbFFB25E33533D
 *   CeresRegistry:   0x662774B1206BeB96C4E100C3b72777e77a5Fb83c
 */

import { useState, useEffect } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { writeContract, waitForTransactionReceipt, readContract } from 'wagmi/actions';
import { config } from '../wagmi';
import { sepolia } from 'wagmi/chains';

// ── Contracts ──

const INVITE_CORE = '0xCD142BDDaf0fe4509C269CC1A5bbFFB25E33533D' as const;
const REGISTRY = '0x662774B1206BeB96C4E100C3b72777e77a5Fb83c' as const;

const INVITE_CORE_ABI = [
  { type: 'function', name: 'hasInviter', inputs: [{ name: 'invitee', type: 'address' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
  { type: 'function', name: 'getNonce', inputs: [{ name: 'signer', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'bindInviterBySig', inputs: [
    { name: 'inviter', type: 'address' },
    { name: 'invitee', type: 'address' },
    { name: 'deadline', type: 'uint256' },
    { name: 'signature', type: 'bytes' },
  ], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'eip712Domain', inputs: [], outputs: [
    { name: 'fields', type: 'bytes1' },
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
    { name: 'extensions', type: 'uint256[]' },
  ], stateMutability: 'view' },
  { type: 'function', name: 'INVITE_TYPEHASH', inputs: [], outputs: [{ name: '', type: 'bytes32' }], stateMutability: 'view' },
] as const;

const REGISTRY_ABI = [
  { type: 'function', name: 'createProfile', inputs: [
    { name: 'name', type: 'string' },
    { name: 'bio', type: 'string' },
    { name: 'avatar', type: 'string' },
    { name: 'urls', type: 'string[]' },
    { name: 'inviterTokenId', type: 'uint256' },
  ], outputs: [{ name: 'tokenId', type: 'uint256' }], stateMutability: 'payable' },
  { type: 'function', name: 'tokenOf', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'mintFee', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'mintFeeEnabled', inputs: [], outputs: [{ name: '', type: 'bool' }], stateMutability: 'view' },
] as const;

// ── Component ──

interface Props {
  myAddress: string;
  inviterAddress?: string; // from Ceres API (the person who invited this user)
  onDone: () => void;
}

export default function CeresMintPage({ myAddress, inviterAddress, onDone }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [step, setStep] = useState<'check' | 'fill' | 'binding' | 'minting' | 'done' | 'error'>('check');
  const [errMsg, setErrMsg] = useState('');
  const [alreadyHasDID, setAlreadyHasDID] = useState(false);

  // Check if user already has Ceres DID via Ceres API + chain
  useEffect(() => {
    if (!myAddress) return;
    let cancelled = false;

    (async () => {
      // 1. Ceres API check
      try {
        const res = await fetch('http://43.156.99.215:5000/api/v1/batch-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addresses: [myAddress] }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profiles?.[0]?.invited) {
            setAlreadyHasDID(true);
            onDone(); // already has DID, skip to chat
            return;
          }
        }
      } catch {}

      // 2. Chain check (tokenOf)
      if (chainId === sepolia.id) {
        try {
          const tokenId = await readContract(config, {
            address: REGISTRY,
            abi: REGISTRY_ABI,
            functionName: 'tokenOf',
            args: [myAddress as `0x${string}`],
            chainId: sepolia.id,
          } as any);
          if (tokenId && Number(tokenId) > 0) {
            setAlreadyHasDID(true);
            onDone();
            return;
          }
        } catch {}
      }

      if (!cancelled) setStep('fill');
    })();

    return () => { cancelled = true; };
  }, [myAddress, chainId]);

  async function handleMint() {
    if (!name.trim()) { setErrMsg('请输入名字'); return; }

    // Must be on Sepolia
    if (chainId !== sepolia.id) {
      try {
        switchChain?.({ chainId: sepolia.id });
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        setErrMsg('请切换到 Sepolia 测试网');
        return;
      }
    }

    try {
      setErrMsg('');
      setStep('binding');

      // Step 1: bindInviterBySig (建立地址级邀请关系)
      const inviter = inviterAddress || '0x8bF0ECB892aB17aEd7D9618aA4570A904244DE09'; // fallback deployer
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1h

      // EIP-712 signature
      const { getAccount, signTypedData } = await import('wagmi/actions');
      const account = getAccount(config);
      if (!account.address) throw new Error('钱包未连接');

      // Get nonce
      const nonce = await readContract(config, {
        address: INVITE_CORE,
        abi: INVITE_CORE_ABI,
        functionName: 'getNonce',
        args: [account.address],
        chainId: sepolia.id,
      } as any);

      const domain = {
        name: 'CeresInviteCore',
        version: '1',
        chainId: BigInt(sepolia.id),
        verifyingContract: INVITE_CORE as `0x${string}`,
      };

      const signature = await signTypedData(config, {
        domain,
        types: {
          Invite: [
            { name: 'inviter', type: 'address' },
            { name: 'invitee', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'Invite',
        message: {
          inviter: inviter as `0x${string}`,
          invitee: account.address as `0x${string}`,
          nonce,
          deadline,
        },
      } as any);

      // Check if already invited
      try {
        const alreadyInvited = await readContract(config, {
          address: INVITE_CORE,
          abi: INVITE_CORE_ABI,
          functionName: 'hasInviter',
          args: [account.address],
          chainId: sepolia.id,
        } as any);
        if (!alreadyInvited) {
          const hash = await writeContract(config, {
            address: INVITE_CORE,
            abi: INVITE_CORE_ABI,
            functionName: 'bindInviterBySig',
            args: [inviter, account.address, deadline, signature],
            chain: sepolia,
          } as any);
          await waitForTransactionReceipt(config, { hash } as any);
          console.log('[Ceres] bindInviterBySig done:', hash);
        }
      } catch (e: any) {
        if (e?.message?.includes('AlreadyInvited')) {
          // Already bound, continue
          console.log('[Ceres] already invited, skipping bind');
        } else {
          throw e;
        }
      }

      // Step 2: createProfile (铸造 DID NFT)
      setStep('minting');

      // Check mint fee
      let value = 0n;
      try {
        const feeEnabled = await readContract(config, {
          address: REGISTRY, abi: REGISTRY_ABI,
          functionName: 'mintFeeEnabled', chainId: sepolia.id,
        } as any);
        if (feeEnabled) {
          const fee = await readContract(config, {
            address: REGISTRY, abi: REGISTRY_ABI,
            functionName: 'mintFee', chainId: sepolia.id,
          } as any);
          value = BigInt(fee as string | number | bigint);
        }
      } catch {}

      const profileHash = await writeContract(config, {
        address: REGISTRY,
        abi: REGISTRY_ABI,
        functionName: 'createProfile',
        args: [name.trim(), bio.trim(), '', [], 0n], // inviterTokenId=0 (genesis — invite relationship is on InviteCore)
        value,
        chain: sepolia,
      } as any);
      await waitForTransactionReceipt(config, { hash: profileHash } as any);
      console.log('[Ceres] createProfile done:', profileHash);

      setStep('done');
      setTimeout(() => onDone(), 1500);
    } catch (e: any) {
      console.error('[Ceres] mint error:', e);
      const msg = e?.message || String(e);
      if (msg.includes('AlreadyHasDID')) {
        setErrMsg('这个地址已经铸造过 Ceres DID');
      } else if (msg.includes('rejected') || msg.includes('denied')) {
        setErrMsg('交易被拒绝');
      } else if (msg.includes('insufficient')) {
        setErrMsg('余额不足');
      } else {
        setErrMsg(msg.slice(0, 200));
      }
      setStep('error');
    }
  }

  if (alreadyHasDID) return null;
  if (!isConnected) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[#12121a] rounded-3xl p-8 border border-white/5">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">铸造 Ceres DID</h1>
          <p className="text-gray-400 text-sm">
            铸造你的去中心化身份 NFT，解锁 CryptChat 全部功能
          </p>
          {inviterAddress && (
            <p className="text-purple-400 text-xs mt-2">
              邀请人: {inviterAddress.slice(0,6)}...{inviterAddress.slice(-4)}
            </p>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(['check', 'fill', 'binding', 'minting'] as const).map((s, i) => {
            const done = (step === 'done') || (['binding','minting','done'].includes(step) && s === 'fill');
            const active = s === step;
            return (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold
                ${done ? 'bg-emerald-500 text-white' :
                  active ? 'bg-purple-500 text-white animate-pulse' :
                  'bg-white/10 text-gray-500'}`}>
                {done ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-4 h-0.5 bg-white/10" />}
            </div>
          )})}
        </div>

        {/* Form */}
        {step === 'fill' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">名字 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="你的 Ceres 名字"
                maxLength={32}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">简介</label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="介绍一下自己..."
                maxLength={200}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition resize-none"
              />
            </div>
            <button
              onClick={handleMint}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50"
              disabled={!name.trim()}
            >
              铸造 Ceres DID
            </button>
            <button
              onClick={onDone}
              className="w-full py-2 text-gray-500 text-sm hover:text-gray-300 transition"
            >
              跳过（稍后铸造）
            </button>
          </div>
        )}

        {/* Binding / Minting progress */}
        {(step === 'binding' || step === 'minting') && (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">
              {step === 'binding' ? '正在建立链上身份...' : '正在铸造 DID NFT...'}
            </p>
            <p className="text-gray-500 text-sm mt-2">请在钱包中确认交易</p>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white font-medium text-lg">Ceres DID 铸造成功!</p>
            <p className="text-gray-400 text-sm mt-1">正在进入 CryptChat...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="text-center py-4">
            <p className="text-red-400 text-sm mb-4">{errMsg}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setStep('fill'); setErrMsg(''); }}
                className="px-4 py-2 bg-white/10 text-white text-sm rounded-xl hover:bg-white/20 transition"
              >
                重试
              </button>
              <button
                onClick={onDone}
                className="px-4 py-2 text-gray-500 text-sm hover:text-gray-300 transition"
              >
                跳过
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
