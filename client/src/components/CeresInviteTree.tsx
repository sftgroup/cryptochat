/**
 * CeresInviteTree — invite tree visualization
 *
 * Uses Ceres API /v1/address-graph to display inviter → user → invitees chain.
 * Shows up to 3 levels: inviter's inviter → inviter → me → my invitees.
 */
import { useState, useEffect } from 'react';
import { getCeresGraph } from '../lib/registry';

interface Props {
  address: string;
}

interface GraphNode {
  address: string;
  relation: 'self' | 'inviter' | 'inviterOfInviter' | 'invitee';
  label?: string;
  inviteeCount?: number;
  descendantCount?: number;
}

export default function CeresInviteTree({ address }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [stats, setStats] = useState<{ totalInvitees: number; totalDescendants: number } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Get ceres profiles: batch-check my address + get graph
        const { checkCeresDID } = await import('../lib/registry');
        const profile = await checkCeresDID(address);

        const all: GraphNode[] = [];

        if (profile?.invited && profile.inviter) {
          // Check inviter's inviter (grandparent)
          const inviterProfile = await checkCeresDID(profile.inviter);
          if (inviterProfile?.invited && inviterProfile.inviter) {
            all.push({
              address: inviterProfile.inviter,
              relation: 'inviterOfInviter',
              label: shortAddr(inviterProfile.inviter),
            });
          }
          all.push({
            address: profile.inviter,
            relation: 'inviter',
            label: shortAddr(profile.inviter),
            inviteeCount: profile.inviteeCount, // actually this is inviter's count, approximate
          });
        }

        // Self
        all.push({
          address,
          relation: 'self',
          label: 'YOU',
          inviteeCount: profile?.inviteeCount || 0,
          descendantCount: profile?.descendantCount || 0,
        });

        // Get my invitees from graph
        try {
          const graph = await getCeresGraph(address);
          if (graph?.addresses) {
            const invitees = (graph.addresses || []).slice(0, 10);
            for (const addr of invitees) {
              if (addr.toLowerCase() !== address.toLowerCase()) {
                all.push({ address: addr, relation: 'invitee', label: shortAddr(addr) });
              }
            }
          }
        } catch {}

        if (active) {
          setNodes(all);
          setStats({
            totalInvitees: profile?.inviteeCount || 0,
            totalDescendants: profile?.descendantCount || 0,
          });
        }
      } catch (err: any) {
        if (active) setError(err.message || 'Failed to load graph');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [address]);

  if (loading) return <div className="text-center py-4 text-gray-400 text-sm">Loading graph...</div>;
  if (error) return <div className="text-center py-4 text-red-400 text-sm">{error}</div>;

  // Color by relation
  const getColors = (relation: string) => {
    switch (relation) {
      case 'inviterOfInviter': return { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' };
      case 'inviter': return { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' };
      case 'self': return { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-400 ring-2 ring-emerald-300' };
      case 'invitee': return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🌳</span>
        <h3 className="text-gray-800 font-bold text-sm">Ceres Invite Tree</h3>
      </div>

      {stats && (
        <div className="flex gap-3 mb-4 text-xs">
          <div className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
            👥 {stats.totalInvitees} invitees
          </div>
          <div className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-semibold">
            🌐 {stats.totalDescendants} descendants
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-0">
        {nodes.map((node, i) => {
          const colors = getColors(node.relation);
          const isSelf = node.relation === 'self';
          return (
            <div key={i} className="flex flex-col items-center">
              {i > 0 && (
                <div className="w-px h-6 bg-gradient-to-b from-gray-300 to-transparent" />
              )}
              <div className={`px-3 py-2 rounded-lg border text-xs font-semibold ${colors.bg} ${colors.text} ${colors.border} ${isSelf ? 'scale-110' : ''} transition-transform min-w-[140px] text-center`}>
                <div className="text-[10px] opacity-60 uppercase tracking-wider">{node.relation}</div>
                <div className="font-mono text-[11px]">{node.label}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortAddr(a: string): string {
  return a.slice(0, 6) + '...' + a.slice(-4);
}
