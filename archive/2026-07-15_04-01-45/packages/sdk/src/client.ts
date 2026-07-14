/**
 * CryptChat SDK Client
 *
 * @example
 * ```ts
 * import { CryptChatClient } from '@cryptchat/sdk';
 *
 * const client = new CryptChatClient({ apiBaseUrl: 'https://chat.example.com' });
 *
 * // Step 1: Get auth challenge
 * const challenge = await client.getNonce('0x...');
 *
 * // Step 2: Sign with wallet (caller handles this)
 * const signature = await wallet.signMessage(challenge.nonce);
 *
 * // Step 3: Login
 * const auth = await client.login('0x...', signature);
 *
 * // Ready to use!
 * const inbox = await client.getInbox();
 * const friends = await client.getFriends();
 * ```
 */

import type {
  CryptChatClientOptions,
  AuthChallenge,
  AuthTokens,
  UserProfile,
  Friend,
  FriendRequest,
  Group,
  Message,
  InboxEntry,
  Moment,
  MomentComment,
  RedPacket,
  RedPacketClaim,
  TxEstimate,
  TxPrepareRequest,
} from './types';

export class CryptChatClient {
  private baseUrl: string;
  private token: string | null;
  private refreshToken: string | null;

  constructor(options: CryptChatClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, '');
    this.token = options.token || null;
    this.refreshToken = null;
  }

  // ── Auth ────────────────────────────────────────────

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

  /**
   * Get a nonce for wallet signing (EIP-712 style).
   * The caller signs the nonce off-chain, then calls login().
   */
  async getNonce(address: string): Promise<AuthChallenge> {
    const data = await this.request<{ nonce: string; timestamp: number }>(
      `/api/auth/nonce?address=${encodeURIComponent(address)}`
    );
    return { nonce: data.nonce, address, timestamp: data.timestamp };
  }

  /**
   * Login with wallet address + signed nonce.
   * Returns JWT tokens + user profile.
   */
  async login(address: string, signature: string): Promise<AuthTokens> {
    const data = await this.request<{ token: string; refreshToken: string; user: UserProfile }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ address, signature }) }
    );
    this.token = data.token;
    this.refreshToken = data.refreshToken;
    return data;
  }

  /**
   * Refresh the access token.
   */
  async refresh(): Promise<{ token: string }> {
    if (!this.refreshToken) throw new Error('No refresh token');
    const data = await this.request<{ token: string }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    this.token = data.token;
    return data;
  }

  /** Set an existing token (e.g. from persisted storage) */
  setToken(token: string): void {
    this.token = token;
  }

  /** Set refresh token */
  setRefreshToken(token: string): void {
    this.refreshToken = token;
  }

  // ── Profile ─────────────────────────────────────────

  /** Get own profile */
  async getProfile(): Promise<UserProfile> {
    const data = await this.request<{ user: UserProfile }>('/api/profile');
    return data.user;
  }

  /** Get profile by address */
  async getProfileByAddress(address: string): Promise<UserProfile | null> {
    const data = await this.request<{ user: UserProfile | null }>(
      `/api/profile/${encodeURIComponent(address)}`
    );
    return data.user;
  }

  /** Update profile */
  async updateProfile(updates: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
  }): Promise<UserProfile> {
    const data = await this.request<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return data.user;
  }

  /** Search users */
  async searchUsers(query: string): Promise<UserProfile[]> {
    const data = await this.request<{ users: UserProfile[] }>(
      `/api/user/search?q=${encodeURIComponent(query)}`
    );
    return data.users;
  }

  // ── Friends ─────────────────────────────────────────

  /** Get friend list */
  async getFriends(): Promise<Friend[]> {
    const data = await this.request<{ friends: Friend[] }>('/api/friends');
    return data.friends;
  }

  /** Get friend requests */
  async getFriendRequests(): Promise<FriendRequest[]> {
    const data = await this.request<{ requests: FriendRequest[] }>(
      '/api/friends/requests'
    );
    return data.requests;
  }

  /** Send friend request */
  async sendFriendRequest(address: string): Promise<{ sent: boolean }> {
    return this.request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  /** Accept friend request */
  async acceptFriendRequest(requestId: string): Promise<{ accepted: boolean }> {
    return this.request('/api/friends/accept', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
  }

  /** Remove friend */
  async removeFriend(address: string): Promise<{ removed: boolean }> {
    return this.request(`/api/friends/${encodeURIComponent(address)}`, {
      method: 'DELETE',
    });
  }

  /** Check friend status */
  async getFriendStatus(
    address: string
  ): Promise<{ status: 'accepted' | 'pending' | 'none' }> {
    return this.request(`/api/friends/status/${encodeURIComponent(address)}`);
  }

  // ── DM ──────────────────────────────────────────────

  /** Get DM inbox */
  async getInbox(): Promise<InboxEntry[]> {
    const data = await this.request<{ inbox: InboxEntry[] }>('/api/dm/inbox');
    return data.inbox;
  }

  /** Get DM messages with a user */
  async getDMMessages(userId: string, options?: { limit?: number; before?: number }): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', String(options.before));
    const qs = params.toString();
    const data = await this.request<{ messages: Message[] }>(
      `/api/dm/${userId}/messages${qs ? `?${qs}` : ''}`
    );
    return data.messages;
  }

  /** Send DM */
  async sendDM(userId: string, content: string): Promise<Message> {
    const data = await this.request<{ message: Message }>(
      `/api/dm/${userId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) }
    );
    return data.message;
  }

  // ── Groups ──────────────────────────────────────────

  /** Get all groups */
  async getGroups(): Promise<Group[]> {
    const data = await this.request<{ groups: Group[] }>('/api/groups');
    return data.groups;
  }

  /** Get group detail */
  async getGroup(groupId: string): Promise<Group> {
    const data = await this.request<{ group: Group }>(`/api/groups/${groupId}`);
    return data.group;
  }

  /** Create group */
  async createGroup(name: string): Promise<Group> {
    const data = await this.request<{ group: Group }>('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    return data.group;
  }

  /** Join group by invite code */
  async joinGroupByCode(code: string): Promise<{ joined: boolean; group: Group }> {
    return this.request('/api/groups/join-by-code', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /** Invite user to group */
  async inviteToGroup(groupId: string, userId: string): Promise<{ invited: boolean }> {
    return this.request(`/api/groups/${groupId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }

  /** Get group invite code */
  async getGroupInviteCode(groupId: string): Promise<{ code: string }> {
    return this.request(`/api/groups/${groupId}/invite-code`, {
      method: 'POST',
    });
  }

  /** Get group messages */
  async getGroupMessages(
    groupId: string,
    options?: { limit?: number; before?: number }
  ): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.before) params.set('before', String(options.before));
    const qs = params.toString();
    const data = await this.request<{ messages: Message[] }>(
      `/api/groups/${groupId}/messages${qs ? `?${qs}` : ''}`
    );
    return data.messages;
  }

  /** Send group message */
  async sendGroupMessage(groupId: string, content: string): Promise<Message> {
    const data = await this.request<{ message: Message }>(
      `/api/groups/${groupId}/messages`,
      { method: 'POST', body: JSON.stringify({ content }) }
    );
    return data.message;
  }

  /** Leave group */
  async leaveGroup(groupId: string): Promise<{ left: boolean }> {
    return this.request(`/api/groups/${groupId}/leave`, { method: 'POST' });
  }

  /** Update group info (owner only) */
  async updateGroup(groupId: string, updates: { name?: string; avatar?: string }): Promise<Group> {
    const data = await this.request<{ group: Group }>(`/api/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return data.group;
  }

  /** Kick member (owner only) */
  async kickMember(groupId: string, userId: string): Promise<{ kicked: boolean }> {
    return this.request(`/api/groups/${groupId}/kick/${userId}`, { method: 'POST' });
  }

  /** Transfer group ownership */
  async transferGroupOwner(groupId: string, newOwnerId: string): Promise<{ transferred: boolean }> {
    return this.request(`/api/groups/${groupId}/transfer`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    });
  }

  // ── Moments ─────────────────────────────────────────

  /** Get moments feed */
  async getMoments(options?: { limit?: number }): Promise<Moment[]> {
    const params = options?.limit ? `?limit=${options.limit}` : '';
    const data = await this.request<{ moments: Moment[] }>(`/api/moments${params}`);
    return data.moments;
  }

  /** Post a moment */
  async postMoment(content: string): Promise<Moment> {
    const data = await this.request<{ moment: Moment }>('/api/moments', {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    return data.moment;
  }

  /** Delete a moment */
  async deleteMoment(momentId: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/moments/${momentId}`, { method: 'DELETE' });
  }

  /** Toggle like on moment */
  async toggleMomentLike(momentId: string): Promise<{ liked: boolean }> {
    return this.request(`/api/moments/${momentId}/like`, { method: 'POST' });
  }

  /** Comment on moment */
  async commentOnMoment(momentId: string, content: string): Promise<MomentComment> {
    const data = await this.request<{ comment: MomentComment }>(
      `/api/moments/${momentId}/comment`,
      { method: 'POST', body: JSON.stringify({ content }) }
    );
    return data.comment;
  }

  // ── Red Packets ─────────────────────────────────────

  /** Get red packets for a chat */
  async getRedPackets(
    scope: 'dm' | 'group',
    scopeId: string
  ): Promise<RedPacket[]> {
    const data = await this.request<{ packets: RedPacket[] }>(
      `/api/redpacket?scope=${scope}&scopeId=${scopeId}`
    );
    return data.packets;
  }

  /** Get red packet detail */
  async getRedPacket(packetId: string): Promise<RedPacket> {
    const data = await this.request<{ packet: RedPacket }>(
      `/api/redpacket/${packetId}`
    );
    return data.packet;
  }

  /** Create a red packet */
  async createRedPacket(params: {
    scope: 'dm' | 'group';
    scopeId: string;
    amount: string;
    token: string;
    count: number;
    message?: string;
  }): Promise<RedPacket> {
    const data = await this.request<{ packet: RedPacket }>('/api/redpacket', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return data.packet;
  }

  /** Claim a red packet */
  async claimRedPacket(packetId: string): Promise<RedPacketClaim> {
    const data = await this.request<{ claim: RedPacketClaim }>(
      `/api/redpacket/${packetId}/claim`,
      { method: 'POST' }
    );
    return data.claim;
  }

  // ── Transactions ────────────────────────────────────

  /** Estimate gas for a transaction */
  async estimateTx(type: string, params: Record<string, unknown>): Promise<TxEstimate> {
    return this.request('/api/tx/estimate', {
      method: 'POST',
      body: JSON.stringify({ type, params }),
    });
  }

  /** Prepare a transaction (returns calldata, caller signs + sends) */
  async prepareTx(request: TxPrepareRequest): Promise<TxEstimate> {
    return this.request('/api/tx/prepare', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /** Get supported chains */
  async getSupportedChains(): Promise<
    Array<{ chainId: number; name: string; rpcUrl: string }>
  > {
    const data = await this.request<{
      chains: Array<{ chainId: number; name: string; rpcUrl: string }>;
    }>('/api/tx/chains');
    return data.chains;
  }

  // ── IPFS ────────────────────────────────────────────

  /** Upload a file to IPFS */
  async uploadFile(file: {
    fileName: string;
    data: string; // base64
    mimeType: string;
  }): Promise<{ cid: string }> {
    return this.request('/api/ipfs/upload', {
      method: 'POST',
      body: JSON.stringify(file),
    });
  }

  /** Get file from IPFS */
  async getFile(cid: string): Promise<Blob> {
    const url = `${this.baseUrl}/api/ipfs/file/${cid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
    return res.blob();
  }

  // ── ECDH Encryption ─────────────────────────────────

  /** Get user's public key for E2E encryption */
  async getUserPubkey(address: string): Promise<{ pubkey: string } | null> {
    const data = await this.request<{ pubkey: string } | null>(
      `/api/user/pubkey/${encodeURIComponent(address)}`
    );
    return data;
  }

  /** Register own ECDH public key */
  async registerPubkey(pubkey: string): Promise<{ registered: boolean }> {
    return this.request('/api/user/pubkey', {
      method: 'POST',
      body: JSON.stringify({ pubkey }),
    });
  }

  // ── Discover ────────────────────────────────────────

  /** Search users by name or address */
  async discoverSearch(query: string): Promise<Array<{ address: string; displayName: string; avatarUrl?: string }>> {
    const data = await this.request<{ results: Array<{ address: string; displayName: string; avatarUrl?: string }> }>(
      `/api/discover/search?q=${encodeURIComponent(query)}`
    );
    return data.results;
  }
}
