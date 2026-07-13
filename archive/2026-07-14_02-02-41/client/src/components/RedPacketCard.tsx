import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

interface PacketInfo {
  id: string;
  senderId: string;
  scope: string;
  scopeId: string;
  amount: string;
  count: number;
  chainId: number;
  tokenSymbol: string;
  message: string | null;
  remaining: number;
  claimed: number;
  createdAt: string;
  claims?: Array<{ claimerId: string; amount: string; claimedAt: string }>;
}

interface Props {
  packetId: string;
  userId: string; // current user (to determine if sender or receiver)
}

/**
 * RedPacketCard: displays a red packet bubble in the chat.
 * - Unopened: shows shiny red envelope with "Open" button
 * - Opened / Sender: shows details with claim list
 */
export default function RedPacketCard({ packetId, userId }: Props) {
  const [packet, setPacket] = useState<PacketInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');
  const [myClaim, setMyClaim] = useState<{ amount: string } | null>(null);

  useEffect(() => {
    fetch(`/api/redpacket/${packetId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => {
        setPacket(d.packet);
        const mine = d.packet.claims?.find((c: any) => c.claimerId === userId);
        if (mine) setMyClaim({ amount: mine.amount });
      })
      .catch(() => setError('Failed to load red packet'))
      .finally(() => setLoading(false));
  }, [packetId, userId]);

  async function claim() {
    if (!packet || claiming) return;
    setClaiming(true);
    setError('');
    try {
      const r = await fetch(`/api/redpacket/${packetId}/claim`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) {
        if (d.error === 'Already claimed!' && d.claim) {
          setMyClaim({ amount: d.claim.amount });
          return;
        }
        throw new Error(d.error || 'Claim failed');
      }
      setMyClaim({ amount: d.claim.amount });
      // Refresh packet
      const r2 = await fetch(`/api/redpacket/${packetId}`);
      if (r2.ok) { const d2 = await r2.json(); setPacket(d2.packet); }
    } catch (err: any) {
      setError(err?.message || 'Claim failed');
    } finally {
      setClaiming(false);
    }
  }

  if (loading) return <div className="animate-pulse bg-red-100 rounded-xl h-20 w-48" />;
  if (!packet) return <div className="text-sm text-red-400">🧧 Red packet unavailable</div>;

  const isSender = packet.senderId === userId;
  const alreadyClaimed = !!myClaim;
  const totalAmount = ethers.formatUnits(packet.amount, 18);
  const token = packet.tokenSymbol || 'ETH';
  const claimedTotal = (packet.claims || []).reduce((sum: bigint, c) => sum + BigInt(c.amount), 0n);
  const claimedDisplay = ethers.formatUnits(claimedTotal, 18);

  // Unopened by non-sender
  if (!isSender && !alreadyClaimed && packet.remaining > 0) {
    return (
      <div className="bg-gradient-to-r from-[#fef0f0] to-[#fff5f5] border-2 border-[#e63946] rounded-2xl p-3 max-w-[280px] shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">🧧</span>
          <div>
            <div className="text-[#d90429] text-sm font-bold">Red Packet</div>
            <div className="text-xs text-gray-400">{packet.count} packets · {totalAmount} {token}</div>
          </div>
        </div>
        {packet.message && <div className="text-xs text-[#e63946]/70 italic mb-2">"{packet.message}"</div>}
        <button onClick={claim} disabled={claiming}
          className="w-full py-2 bg-[#e63946] text-white text-sm font-bold rounded-xl hover:bg-[#d90429] disabled:opacity-50 transition-all cursor-pointer">
          {claiming ? 'Opening...' : '🧧 Open'}
        </button>
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>
    );
  }

  // Opened or expired or sender view
  return (
    <div className="bg-gradient-to-b from-white to-[#fff5f5] border-2 border-[#e63946]/30 rounded-2xl p-3 max-w-[300px] shadow-md">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">🧧</span>
        <div>
          <div className="text-[#d90429] text-sm font-bold">
            {isSender ? 'Your Red Packet' : 'Red Packet'}
          </div>
          <div className="text-xs text-gray-400">
            {alreadyClaimed ? '✅ Opened' : '🔒 Expired'}
          </div>
        </div>
      </div>

      <div className="space-y-1 mb-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Total</span>
          <span className="text-gray-800 font-semibold">{totalAmount} {token}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Claimed</span>
          <span className="text-gray-800">{claimedDisplay} / {totalAmount} {token}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-400">Remaining</span>
          <span className="text-gray-800">{packet.remaining} / {packet.count} packets</span>
        </div>
        {packet.message && <div className="text-xs text-[#e63946]/70 italic">"{packet.message}"</div>}
      </div>

      {/* My claim */}
      {myClaim && (
        <div className="bg-[#e63946]/10 rounded-lg px-3 py-2 mb-2">
          <div className="text-xs text-gray-500">You received</div>
          <div className="text-sm font-bold text-[#d90429]">{ethers.formatUnits(myClaim.amount, 18)} {token}</div>
        </div>
      )}

      {/* Claim list (for sender) */}
      {(packet.claims || []).length > 0 && (
        <div className="border-t border-[#e63946]/20 pt-2 mt-2">
          <div className="text-xs text-gray-400 mb-1">Claimers ({packet.claimed}/{packet.count})</div>
          {(packet.claims || []).map((c, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="text-gray-500 font-mono">{c.claimerId.slice(0, 6)}...{c.claimerId.slice(-4)}</span>
              <span className="text-gray-700 font-semibold">{ethers.formatUnits(c.amount, 18)} {token}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
