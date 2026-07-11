import { useState } from 'react';
import { authStore } from '../lib/api';

interface Props {
  onCreate: (group: any) => void;
  onCancel: () => void;
}

export default function CreateGroup({ onCreate, onCancel }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [addressStr, setAddressStr] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const memberAddresses = addressStr
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('http://localhost:4089/api/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          memberAddresses: memberAddresses.length > 0 ? memberAddresses : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create group');
      }

      const data = await res.json();
      onCreate(data.group);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold flex items-center gap-2">
          👥 Create Group
        </h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
      </div>

      <input
        type="text"
        placeholder="Group name"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700"
        autoFocus
      />

      <input
        type="text"
        placeholder="Description (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700"
      />

      <div>
        <label className="text-gray-500 text-xs">Invite members (addresses, comma-separated)</label>
        <textarea
          placeholder="0xabc..., 0xdef..."
          value={addressStr}
          onChange={e => setAddressStr(e.target.value)}
          className="w-full bg-deep border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-700 font-mono mt-1 resize-none h-16"
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-xl text-sm text-gray-400 border border-white/10 hover:bg-white/5 transition-colors">
          Cancel
        </button>
        <button onClick={handleCreate} disabled={creating || !name.trim()}
          className="flex-1 px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {creating ? 'Creating...' : 'Create Group'}
        </button>
      </div>
    </div>
  );
}
