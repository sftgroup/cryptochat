/**
 * CryptChat SDK Types (inlined for MCP)
 */

export interface CryptChatClientOptions {
  apiBaseUrl: string;
  token?: string;
}

export interface AuthChallenge {
  nonce: string;
  address: string;
  timestamp: number;
}

export interface AuthTokens {
  token: string;
  refreshToken: string;
  user: UserProfile;
}

export interface UserProfile {
  id: string;
  address: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  ensName?: string;
  pubkey?: string;
}

export interface Friend extends UserProfile {
  status: 'accepted' | 'pending';
}

export interface FriendRequest {
  id: string;
  address: string;
  displayName?: string;
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  ownerId: string;
  inviteCode?: string;
  members: GroupMember[];
}

export interface GroupMember {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: UserProfile;
  keyVersion?: number;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  senderName?: string;
  time: number;
  read?: boolean;
  encrypted?: boolean;
}

export interface InboxEntry {
  friend: UserProfile;
  unread: number;
  lastMessage: { content: string; time: number; sender: string } | null;
}

export interface Moment {
  id: string;
  content: string;
  time: string;
  authorName: string;
  authorAddr: string;
  userId: string;
  likes: string[];
  liked: boolean;
  comments: MomentComment[];
}

export interface MomentComment {
  id: string;
  userId: string;
  content: string;
  time: string;
  authorName: string;
}

export interface RedPacket {
  id: string;
  senderId: string;
  senderName?: string;
  scope: 'dm' | 'group';
  scopeId: string;
  amount: string;
  token: string;
  count: number;
  claimed: number;
  status: 'active' | 'completed' | 'expired';
  createdAt: string;
}

export interface RedPacketClaim {
  id: string;
  packetId: string;
  claimerId: string;
  amount: string;
  time: string;
}

export interface TxEstimate {
  chainId: number;
  from: string;
  to: string;
  value: string;
  data: string;
  gasEstimate: string;
}

export interface TxPrepareRequest {
  chainId: number;
  type: string;
  params: Record<string, unknown>;
}

// ─── CryptChat Client (inlined from SDK) ─────────────────

export class CryptChatClient {
  private baseUrl: string;
  private token: string | null;
  private refreshToken: string | null;

  constructor(options: CryptChatClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.token = options.token || null;
    this.refreshToken = null;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const res = await fetch(url, { ...init, headers: { ...this.headers(), ...init?.headers } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
  }

  async getNonce(address: string): Promise<AuthChallenge> {
    const data = await this.request<{ nonce: string; timestamp: number }>(
      `/api/auth/nonce?address=${encodeURIComponent(address)}`
    );
    return { nonce: data.nonce, address, timestamp: data.timestamp };
  }

  async login(address: string, signature: string): Promise<AuthTokens> {
    const data = await this.request<{ token: string; refreshToken: string; user: UserProfile }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ address, signature }) }
    );
    this.token = data.token;
    this.refreshToken = data.refreshToken;
    return data;
  }

  async refresh(): Promise<{ token: string }> {
    if (!this.refreshToken) throw new Error('No refresh token');
    const data = await this.request<{ token: string }>('/api/auth/refresh', {
      method: 'POST', body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    this.token = data.token;
    return data;
  }

  setToken(token: string): void { this.token = token; }
  setRefreshToken(token: string): void { this.refreshToken = token; }

  async getProfile(): Promise<UserProfile> {
    const data = await this.request<{ user: UserProfile }>('/api/profile');
    return data.user;
  }

  async getProfileByAddress(address: string): Promise<UserProfile | null> {
    const data = await this.request<{ user: UserProfile | null }>(`/api/profile/${encodeURIComponent(address)}`);
    return data.user;
  }

  async updateProfile(updates: { displayName?: string; avatarUrl?: string; bio?: string }): Promise<UserProfile> {
    const data = await this.request<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH', body: JSON.stringify(updates),
    });
    return data.user;
  }

  async searchUsers(query: string): Promise<UserProfile[]> {
    const data = await this.request<{ users: UserProfile[] }>(`/api/user/search?q=${encodeURIComponent(query)}`);
    return data.users;
  }

  async getFriends(): Promise<Friend[]> {
    const data = await this.request<{ friends: Friend[] }>('/api/friends');
    return data.friends;
  }

  async getFriendRequests(): Promise<FriendRequest[]> {
    const data = await this.request<{ requests: FriendRequest[] }>('/api/friends/requests');
    return data.requests;
  }

  async sendFriendRequest(address: string): Promise<{ sent: boolean }> {
    return this.request('/api/friends/request', { method: 'POST', body: JSON.stringify({ address }) });
  }

  async acceptFriendRequest(requestId: string): Promise<{ accepted: boolean }> {
    return this.request('/api/friends/accept', { method: 'POST', body: JSON.stringify({ requestId }) });
  }

  async removeFriend(address: string): Promise<{ removed: boolean }> {
    return this.request(`/api/friends/${encodeURIComponent(address)}`, { method: 'DELETE' });
  }

  async getFriendStatus(address: string): Promise<{ status: 'accepted' | 'pending' | 'none' }> {
    return this.request(`/api/friends/status/${encodeURIComponent(address)}`);
  }

  async getInbox(): Promise<InboxEntry[]> {
    const data = await this.request<{ inbox: InboxEntry[] }>('/api/dm/inbox');
    return data.inbox;
  }

  async getDMMessages(userId: string, options?: { limit?: number; before?: number }): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', String(options.before));
    const qs = params.toString();
    const data = await this.request<{ messages: Message[] }>(`/api/dm/${userId}/messages${qs ? `?${qs}` : ''}`);
    return data.messages;
  }

  async sendDM(userId: string, content: string): Promise<Message> {
    const data = await this.request<{ message: Message }>(`/api/dm/${userId}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    });
    return data.message;
  }

  async getGroups(): Promise<Group[]> {
    const data = await this.request<{ groups: Group[] }>('/api/groups');
    return data.groups;
  }

  async getGroup(groupId: string): Promise<Group> {
    const data = await this.request<{ group: Group }>(`/api/groups/${groupId}`);
    return data.group;
  }

  async createGroup(name: string): Promise<Group> {
    const data = await this.request<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) });
    return data.group;
  }

  async joinGroupByCode(code: string): Promise<{ joined: boolean; group: Group }> {
    return this.request('/api/groups/join-by-code', { method: 'POST', body: JSON.stringify({ code }) });
  }

  async inviteToGroup(groupId: string, userId: string): Promise<{ invited: boolean }> {
    return this.request(`/api/groups/${groupId}/invite`, { method: 'POST', body: JSON.stringify({ userId }) });
  }

  async getGroupInviteCode(groupId: string): Promise<{ code: string }> {
    return this.request(`/api/groups/${groupId}/invite-code`, { method: 'POST' });
  }

  async getGroupMessages(groupId: string, options?: { limit?: number; before?: number }): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', String(options.before));
    const qs = params.toString();
    const data = await this.request<{ messages: Message[] }>(`/api/groups/${groupId}/messages${qs ? `?${qs}` : ''}`);
    return data.messages;
  }

  async sendGroupMessage(groupId: string, content: string): Promise<Message> {
    const data = await this.request<{ message: Message }>(`/api/groups/${groupId}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    });
    return data.message;
  }

  async leaveGroup(groupId: string): Promise<{ left: boolean }> {
    return this.request(`/api/groups/${groupId}/leave`, { method: 'POST' });
  }

  async updateGroup(groupId: string, updates: { name?: string; avatar?: string }): Promise<Group> {
    const data = await this.request<{ group: Group }>(`/api/groups/${groupId}`, {
      method: 'PUT', body: JSON.stringify(updates),
    });
    return data.group;
  }

  async kickMember(groupId: string, userId: string): Promise<{ kicked: boolean }> {
    return this.request(`/api/groups/${groupId}/kick/${userId}`, { method: 'POST' });
  }

  async transferGroupOwner(groupId: string, newOwnerId: string): Promise<{ transferred: boolean }> {
    return this.request(`/api/groups/${groupId}/transfer`, { method: 'POST', body: JSON.stringify({ newOwnerId }) });
  }

  async getMoments(options?: { limit?: number }): Promise<Moment[]> {
    const params = options?.limit ? `?limit=${options.limit}` : '';
    const data = await this.request<{ moments: Moment[] }>(`/api/moments${params}`);
    return data.moments;
  }

  async postMoment(content: string): Promise<Moment> {
    const data = await this.request<{ moment: Moment }>('/api/moments', { method: 'POST', body: JSON.stringify({ content }) });
    return data.moment;
  }

  async deleteMoment(momentId: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/moments/${momentId}`, { method: 'DELETE' });
  }

  async toggleMomentLike(momentId: string): Promise<{ liked: boolean }> {
    return this.request(`/api/moments/${momentId}/like`, { method: 'POST' });
  }

  async commentOnMoment(momentId: string, content: string): Promise<MomentComment> {
    const data = await this.request<{ comment: MomentComment }>(`/api/moments/${momentId}/comment`, {
      method: 'POST', body: JSON.stringify({ content }),
    });
    return data.comment;
  }

  async getRedPackets(scope: 'dm' | 'group', scopeId: string): Promise<RedPacket[]> {
    const data = await this.request<{ packets: RedPacket[] }>(`/api/redpacket?scope=${scope}&scopeId=${scopeId}`);
    return data.packets;
  }

  async getRedPacket(packetId: string): Promise<RedPacket> {
    const data = await this.request<{ packet: RedPacket }>(`/api/redpacket/${packetId}`);
    return data.packet;
  }

  async createRedPacket(params: { scope: 'dm' | 'group'; scopeId: string; amount: string; token: string; count: number; message?: string }): Promise<RedPacket> {
    const data = await this.request<{ packet: RedPacket }>('/api/redpacket', { method: 'POST', body: JSON.stringify(params) });
    return data.packet;
  }

  async claimRedPacket(packetId: string): Promise<RedPacketClaim> {
    const data = await this.request<{ claim: RedPacketClaim }>(`/api/redpacket/${packetId}/claim`, { method: 'POST' });
    return data.claim;
  }

  async estimateTx(type: string, params: Record<string, unknown>): Promise<TxEstimate> {
    return this.request('/api/tx/estimate', { method: 'POST', body: JSON.stringify({ type, params }) });
  }

  async prepareTx(request: TxPrepareRequest): Promise<TxEstimate> {
    return this.request('/api/tx/prepare', { method: 'POST', body: JSON.stringify(request) });
  }

  async getSupportedChains(): Promise<Array<{ chainId: number; name: string; rpcUrl: string }>> {
    const data = await this.request<{ chains: Array<{ chainId: number; name: string; rpcUrl: string }> }>('/api/tx/chains');
    return data.chains;
  }

  async uploadFile(file: { fileName: string; data: string; mimeType: string }): Promise<{ cid: string }> {
    return this.request('/api/ipfs/upload', { method: 'POST', body: JSON.stringify(file) });
  }

  async getFile(cid: string): Promise<Blob> {
    const url = `${this.baseUrl}/api/ipfs/file/${cid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
    return res.blob();
  }

  async getUserPubkey(address: string): Promise<{ pubkey: string } | null> {
    const data = await this.request<{ pubkey: string } | null>(`/api/user/pubkey/${encodeURIComponent(address)}`);
    return data;
  }

  async registerPubkey(pubkey: string): Promise<{ registered: boolean }> {
    return this.request('/api/user/pubkey', { method: 'POST', body: JSON.stringify({ pubkey }) });
  }

  async discoverSearch(query: string): Promise<Array<{ address: string; displayName: string; avatarUrl?: string }>> {
    const data = await this.request<{ results: Array<{ address: string; displayName: string; avatarUrl?: string }> }>(
      `/api/discover/search?q=${encodeURIComponent(query)}`
    );
    return data.results;
  }
}
