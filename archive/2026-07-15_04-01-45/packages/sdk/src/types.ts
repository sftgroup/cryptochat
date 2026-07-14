/**
 * CryptChat SDK Types
 */

/** EIP-712 typed message payload for signing */
export interface SignRequest {
  domain: {
    name: string;
    version: string;
    chainId?: number;
  };
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** Auth flow: get nonce → sign → login */
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

/** User profile */
export interface UserProfile {
  id: string;
  address: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  ensName?: string;
  pubkey?: string;
}

/** Friend */
export interface Friend extends UserProfile {
  status: 'accepted' | 'pending';
}

/** Friend request */
export interface FriendRequest {
  id: string;
  address: string;
  displayName?: string;
}

/** Group chat */
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

/** Message */
export interface Message {
  id: string;
  content: string;
  sender: string;
  senderName?: string;
  time: number;
  read?: boolean;
  encrypted?: boolean;
}

/** DM Inbox */
export interface InboxEntry {
  friend: UserProfile;
  unread: number;
  lastMessage: {
    content: string;
    time: number;
    sender: string;
  } | null;
}

/** Moment */
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

/** Red Packet */
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

/** Red Packet claim result */
export interface RedPacketClaim {
  id: string;
  packetId: string;
  claimerId: string;
  amount: string;
  time: string;
}

/** Transaction types */
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
  /**
   * e.g. "RedPacket" | "Transfer" | "Lock"
   */
  type: string;
  params: Record<string, unknown>;
}

/** Client options */
export interface CryptChatClientOptions {
  apiBaseUrl: string;
  /** Optional: pre-existing JWT for already-auth'd sessions */
  token?: string;
}
