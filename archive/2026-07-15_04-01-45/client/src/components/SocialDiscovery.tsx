/**
 * SocialDiscovery — "People you may know"
 *
 * Uses Ceres API to find 2nd-degree connections:
 * - Friends of your friends (same inviter)
 * - Descendants of your inviter (your "siblings" in the tree)
 */
import { useState, useEffect } from 'react';
import { checkCeresDID } from '../lib/registry';

interface Props {
  myAddress: string;
  friendAddresses: string[];
  onSendRequest?: (address: string) => void;
}

interface Suggestion {
  address: string;
  displayName?: string;
  reason: string;
  mutualFriends?: number;
}

export default function SocialDiscovery({ myAddress, friendAddresses, onSendRequest }: Props) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const myProfile = await checkCeresDID(myAddress);

        if (!myProfile?.invited) {
          if (active) setLoading(false);
          return;
        }

        const suggested = new Map<string, Suggestion>();

        // Strategy 1: People who share the same inviter (Ceres "siblings")
        if (myProfile.inviter) {
          try {
            const { getCeresGraph } = await import('../lib/registry');
            const graph = await getCeresGraph(myProfile.inviter);
            if (graph?.addresses) {
              const siblings = graph.addresses.filter(
                (a: string) => a.toLowerCase() !== myAddress.toLowerCase()
              );
              // Check which ones aren't already friends
              const alreadyFriends = new Set(friendAddresses.map(a => a.toLowerCase()));
              for (const addr of siblings.slice(0, 15)) {
                if (!alreadyFriends.has(addr.toLowerCase())) {
                  suggested.set(addr.toLowerCase(), {
                    address: addr,
                    reason: 'Ceres sibling — same inviter',
                  });
                }
              }
            }
          } catch {}
        }

        // Strategy 2: Friends' friends (2nd-degree)
        // Check invitees of your friends
        for (const friendAddr of friendAddresses.slice(0, 5)) {
          try {
            const friendProfile = await checkCeresDID(friendAddr);
            if (friendProfile?.invited && friendProfile.inviteeCount > 0) {
              const { getCeresGraph } = await import('../lib/registry');
              const graph = await getCeresGraph(friendAddr);
              if (graph?.addresses) {
                const alreadyFriends = new Set([
                  myAddress.toLowerCase(),
                  ...friendAddresses.map(a => a.toLowerCase()),
                ]);
                let mutualCount = 0;
                // Count mutual friends among invitees
                for (const addr of graph.addresses) {
                  if (alreadyFriends.has(addr.toLowerCase())) {
                    mutualCount++;
                  } else if (!suggested.has(addr.toLowerCase())) {
                    suggested.set(addr.toLowerCase(), {
                      address: addr,
                      reason: 'Friend of a friend',
                      mutualFriends: 1,
                    });
                  }
                }
                // Update mutual count for existing suggestions
                if (mutualCount > 1) {
                  for (const [k, v] of suggested) {
                    if (graph.addresses.some((a: string) => a.toLowerCase() === k)) {
                      v.mutualFriends = mutualCount;
                    }
                  }
                }
              }
            }
          } catch {}
        }

        if (active) {
          setSuggestions(
            Array.from(suggested.values())
              .sort((a, b) => (b.mutualFriends || 0) - (a.mutualFriends || 0))
              .slice(0, 10)
          );
        }
      } catch (err) {
        console.warn('[SocialDiscovery]', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [myAddress, friendAddresses.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="text-center py-3 text-gray-400 text-xs">Discovering...</div>;
  if (suggestions.length === 0) return null;

  const displayCount = expanded ? suggestions.length : Math.min(3, suggestions.length);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔍</span>
        <h3 className="text-gray-800 font-bold text-sm">People You May Know</h3>
      </div>

      <div className="space-y-2">
        {suggestions.slice(0, displayCount).map((s, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {(s.address.slice(2, 4) || '?').toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 font-medium font-mono truncate">
                {s.address.slice(0, 6)}...{s.address.slice(-4)}
              </div>
              <div className="text-[10px] text-gray-400">
                {s.reason}
                {s.mutualFriends && s.mutualFriends > 1 && (
                  <span className="ml-1 text-blue-500">· {s.mutualFriends} mutual</span>
                )}
              </div>
            </div>
            {onSendRequest && (
              <button
                onClick={() => onSendRequest(s.address)}
                className="text-xs bg-blue-500 text-white font-bold px-3 py-1 rounded-full hover:bg-blue-600 transition-colors shrink-0 cursor-pointer"
              >
                + Add
              </button>
            )}
          </div>
        ))}
      </div>

      {suggestions.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs text-blue-500 hover:text-blue-600 mt-2 py-1 font-medium cursor-pointer"
        >
          {expanded ? `Show less` : `Show ${suggestions.length - 3} more`}
        </button>
      )}
    </div>
  );
}
