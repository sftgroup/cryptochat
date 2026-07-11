import { useState, useEffect } from 'react';
import { authStore } from '../lib/api';

interface DiscoverResult {
  address: string;
  relation: string;
  displayName?: string;
  userId?: string;
}

interface Props {
  onStartChat: (address: string) => void;
  onInviteToGroup: (address: string) => void;
}

export default function DiscoverPanel({ onStartChat, onInviteToGroup }: Props) {
  const [ceresResults, setCeresResults] = useState<DiscoverResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; address: string; displayName: string | null }>>([]);

  useEffect(() => {
    loadCeresConnections();
  }, []);

  async function loadCeresConnections() {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4089/api/discover/ceres', {
        headers: { Authorization: `Bearer ${authStore.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCeresResults(data.results || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => {
    if (!searchQ || searchQ.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`http://localhost:4089/api/discover/search?q=${encodeURIComponent(searchQ)}`, {
          headers: { Authorization: `Bearer ${authStore.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  return (
    <div className="p-3 space-y-4">
      {/* Search bar */}
      <div>
        <input
          type="text"
          placeholder="Search users..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 group">
                <div className="min-w-0 flex-1">
                  <div className="text-white text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                  <div className="text-gray-500 text-xs font-mono truncate">{u.address}</div>
                </div>
                <button onClick={() => onStartChat(u.address)}
                  className="text-xs text-brand hover:text-white opacity-0 group-hover:opacity-100 transition-all ml-2">
                  Chat
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ceres Connections */}
      <div>
        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
          🌐 Ceres Network
          {loading && <span className="text-amber-400 normal-case text-[10px]">loading...</span>}
        </h3>
        {ceresResults.length === 0 && !loading && (
          <p className="text-gray-600 text-xs">No Ceres connections found. Invite friends to build your network!</p>
        )}
        {ceresResults.map((r, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 group">
            <div className="min-w-0 flex-1">
              <div className="text-white text-sm truncate">
                {r.displayName || r.address.slice(0,6)+'...'+r.address.slice(-4)}
              </div>
              <div className="text-gray-500 text-xs">
                {r.relation === 'invited_by' ? '📥 Invited you' : '📤 You invited'}
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => onStartChat(r.address)}
                className="text-xs px-2 py-1 rounded bg-brand/20 text-brand hover:bg-brand/30">
                Chat
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
