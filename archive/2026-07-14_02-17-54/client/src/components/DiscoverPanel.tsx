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
}

export default function DiscoverPanel({ onStartChat }: Props) {
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
      const res = await fetch('/api/discover/ceres', {
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
        const res = await fetch(`/api/discover/search?q=${encodeURIComponent(searchQ)}`, {
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
          className="w-full bg-[#f7f9f9] border border-[#cfd9de] rounded-lg px-3 py-2 text-sm text-[#0f1419] placeholder-[#536471] focus:outline-none focus:border-[#1d9bf0]"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f7f9f9] group">
                <div className="min-w-0 flex-1">
                  <div className="text-[#0f1419] text-sm truncate">{u.displayName || u.address.slice(0,6)+'...'+u.address.slice(-4)}</div>
                  <div className="text-[#536471] text-xs font-mono truncate">{u.address}</div>
                </div>
                <button onClick={() => onStartChat(u.address)}
                  className="text-xs text-[#1d9bf0] hover:text-[#1a8cd8] opacity-0 group-hover:opacity-100 transition-all ml-2">
                  Chat
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ceres Connections */}
      <div>
        <h3 className="text-[#536471] text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1">
          🌐 Ceres Network
          {loading && <span className="text-[#1d9bf0] normal-case text-[10px]">loading...</span>}
        </h3>
        {ceresResults.length === 0 && !loading && (
          <p className="text-[#536471] text-xs">No Ceres connections found. Invite friends to build your network!</p>
        )}
        {ceresResults.map((r, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-[#f7f9f9] group">
            <div className="min-w-0 flex-1">
              <div className="text-[#0f1419] text-sm truncate">
                {r.displayName || r.address.slice(0,6)+'...'+r.address.slice(-4)}
              </div>
              <div className="text-[#536471] text-xs">
                {r.relation === 'invited_by' ? '📥 Invited you' : '📤 You invited'}
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
              <button onClick={() => onStartChat(r.address)}
                className="text-xs px-2 py-1 rounded bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/20">
                Chat
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
