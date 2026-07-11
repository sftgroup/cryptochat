import { useState, useEffect } from 'react';
import { authStore, getProfile, updateProfile } from '../lib/api';

interface Props { onBack: () => void; onLogout: () => void; }

export default function ProfilePage({ onBack, onLogout }: Props) {
  const user = authStore.user!;
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateProfile({ displayName: displayName || undefined, bio: bio || undefined, avatarUrl: avatarUrl || undefined });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-tw-bg">
      {/* Header */}
      <header className="sticky top-0 bg-tw-bg/80 backdrop-blur-md border-b border-tw-border px-4 py-3 flex items-center gap-4 z-10">
        <button onClick={onBack} className="text-tw-text-dim hover:text-white transition-colors text-lg">
          ←
        </button>
        <h2 className="text-white font-bold text-lg flex-1">Profile</h2>
        <button onClick={onLogout} className="text-tw-text-dim hover:text-tw-red text-sm transition-colors">
          Logout
        </button>
      </header>

      <div className="max-w-xl mx-auto p-4 space-y-6">
        {/* Avatar */}
        <div className="tw-card p-6">
          <div className="flex items-center gap-4">
            <div className="tw-avatar tw-avatar-lg text-3xl">
              {(displayName || user.address)[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <input
                type="text" placeholder="Avatar URL (optional)"
                value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)}
                className="tw-input w-full"
              />
            </div>
          </div>
        </div>

        {/* Name */}
        <div className="tw-card p-6">
          <label className="text-tw-text-dim text-xs font-semibold uppercase tracking-wider mb-2 block">Display Name</label>
          <input
            type="text" placeholder="Your name"
            value={displayName} onChange={e => setDisplayName(e.target.value)}
            className="tw-input w-full"
          />
          <label className="text-tw-text-dim text-xs font-semibold uppercase tracking-wider mt-4 mb-2 block">Bio</label>
          <textarea
            placeholder="Tell people about yourself..."
            value={bio} onChange={e => setBio(e.target.value)}
            maxLength={160}
            className="tw-input w-full resize-none h-20"
          />
          <div className="text-tw-text-dim text-xs mt-1">{bio.length}/160</div>
        </div>

        {/* Wallet */}
        <div className="tw-card p-6">
          <label className="text-tw-text-dim text-xs font-semibold uppercase tracking-wider mb-2 block">Wallet Address</label>
          <div className="text-tw-text font-mono text-sm break-all">{user.address}</div>
          {user.ensName && (
            <div className="text-tw-blue text-sm mt-1">{user.ensName}</div>
          )}
        </div>

        {/* Save */}
        {error && <p className="text-tw-red text-sm">{error}</p>}
        <button onClick={handleSave} disabled={saving}
          className="tw-btn w-full">
          {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Profile'}
        </button>

        {/* Logout */}
        <div className="text-center pb-8">
          <button onClick={onLogout} className="text-tw-text-dim hover:text-tw-red text-sm transition-colors">
            Disconnect Wallet
          </button>
        </div>
      </div>
    </div>
  );
}
