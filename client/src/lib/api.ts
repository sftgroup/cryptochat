const API = '/api';

export const authStore = {
  token: localStorage.getItem('cryptchat_token') || null,
  refreshToken: localStorage.getItem('cryptchat_refresh') || null,
  user: JSON.parse(localStorage.getItem('cryptchat_user') || 'null') as any,
  setAuth(token: string, refreshToken: string, user: any) {
    this.token = token;
    this.refreshToken = refreshToken;
    this.user = user;
    localStorage.setItem('cryptchat_token', token);
    localStorage.setItem('cryptchat_refresh', refreshToken);
    localStorage.setItem('cryptchat_user', JSON.stringify(user));
  },
  clear() {
    this.token = null;
    this.refreshToken = null;
    this.user = null;
    localStorage.removeItem('cryptchat_token');
    localStorage.removeItem('cryptchat_refresh');
    localStorage.removeItem('cryptchat_user');
  },
  headers() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` };
  },
};

// --- Auth ---
export async function getNonce(address: string): Promise<string> {
  const r = await fetch(`${API}/auth/nonce?address=${address}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d.nonce;
}
export async function login(address: string, signature: string) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  authStore.setAuth(d.token, d.refreshToken, d.user);
  return d.user;
}

// --- Profile ---
export async function getProfile() {
  const r = await fetch(`${API}/profile`, { headers: authStore.headers() });
  return (await r.json()).user;
}
export async function getProfileByAddress(addr: string) {
  const r = await fetch(`${API}/profile/${addr}`);
  return (await r.json()).user;
}
export async function updateProfile(data: { displayName?: string; avatarUrl?: string; bio?: string }) {
  const r = await fetch(`${API}/profile`, {
    method: 'PATCH', headers: authStore.headers(),
    body: JSON.stringify(data),
  });
  const d = await r.json();
  authStore.user = d.user;
  localStorage.setItem('cryptchat_user', JSON.stringify(d.user));
  return d.user;
}

// --- Friends ---
export async function getFriends() {
  const r = await fetch(`${API}/friends`, { headers: authStore.headers() });
  return (await r.json()).friends;
}
export async function getFriendRequests() {
  const r = await fetch(`${API}/friends/requests`, { headers: authStore.headers() });
  return (await r.json()).requests;
}
export async function sendFriendRequest(address: string) {
  const r = await fetch(`${API}/friends/request`, {
    method: 'POST', headers: authStore.headers(),
    body: JSON.stringify({ address }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
export async function acceptFriendRequest(requestId: string) {
  const r = await fetch(`${API}/friends/accept`, {
    method: 'POST', headers: authStore.headers(),
    body: JSON.stringify({ requestId }),
  });
  return r.json();
}
export async function removeFriend(address: string) {
  const r = await fetch(`${API}/friends/${address}`, {
    method: 'DELETE', headers: authStore.headers(),
  });
  return r.json();
}
export async function getFriendStatus(address: string) {
  const r = await fetch(`${API}/friends/status/${address}`, { headers: authStore.headers() });
  return (await r.json()).status;
}

// --- Discovery ---
export async function searchUsers(token: string, q: string) {
  const r = await fetch(`${API}/discover/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.json();
}

// --- Groups ---
export async function getGroups() {
  const r = await fetch(`${API}/groups`, { headers: authStore.headers() });
  return (await r.json()).groups;
}
