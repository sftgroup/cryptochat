const API_BASE = '/api';

interface NonceResponse { nonce: string }
interface LoginResponse {
  token: string;
  refreshToken: string;
  user: { id: string; address: string; ensName: string | null; avatarUrl: string | null; displayName: string };
}

interface SearchResult { users: Array<{ id: string; address: string; ensName: string | null; avatarUrl: string | null; displayName: string }> }

export async function getNonce(address: string): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/nonce?address=${address}`);
  if (!res.ok) throw new Error('Failed to get nonce');
  const data: NonceResponse = await res.json();
  return data.nonce;
}

export async function login(address: string, signature: string): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

export async function refreshToken(token: string): Promise<{ token: string; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  return res.json();
}

export async function getProfile(token: string) {
  const res = await fetch(`${API_BASE}/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to get profile');
  return res.json();
}

export async function searchUsers(token: string, query: string): Promise<SearchResult> {
  const res = await fetch(`${API_BASE}/user/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

class AuthStore {
  private _token: string | null = null;
  private _refreshToken: string | null = null;
  private _user: LoginResponse['user'] | null = null;

  get token() { return this._token; }
  get user() { return this._user; }
  get isLoggedIn() { return !!this._token; }

  setSession(res: LoginResponse) {
    this._token = res.token;
    this._refreshToken = res.refreshToken;
    this._user = res.user;
    localStorage.setItem('cc_token', res.token);
    localStorage.setItem('cc_refresh', res.refreshToken);
    localStorage.setItem('cc_user', JSON.stringify(res.user));
  }

  loadSession(): boolean {
    const t = localStorage.getItem('cc_token');
    const r = localStorage.getItem('cc_refresh');
    const u = localStorage.getItem('cc_user');
    if (t && u) {
      this._token = t;
      this._refreshToken = r;
      try { this._user = JSON.parse(u); } catch { return false; }
      return true;
    }
    return false;
  }

  clear() {
    this._token = null;
    this._refreshToken = null;
    this._user = null;
    localStorage.removeItem('cc_token');
    localStorage.removeItem('cc_refresh');
    localStorage.removeItem('cc_user');
  }
}

export const authStore = new AuthStore();
