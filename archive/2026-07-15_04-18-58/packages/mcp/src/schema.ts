/** CryptChat MCP — Tool Schema */

import type { MCPSchema } from './types';

export const CHAT_TOOLS: MCPSchema[] = [
  // ── Profile ──
  {
    name: 'cryptchat_get_profile',
    description: 'Get own user profile (display name, address, avatar, bio)',
    parameters: {},
  },
  {
    name: 'cryptchat_search_users',
    description: 'Search users by name or address',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
    },
  },

  // ── Friends ──
  {
    name: 'cryptchat_list_friends',
    description: 'List all friends with their online/offline status',
    parameters: {},
  },
  {
    name: 'cryptchat_get_friend_requests',
    description: 'Get pending friend requests',
    parameters: {},
  },
  {
    name: 'cryptchat_send_friend_request',
    description: 'Send a friend request to an address',
    parameters: {
      address: { type: 'string', description: 'Wallet address', required: true },
    },
  },
  {
    name: 'cryptchat_accept_friend_request',
    description: 'Accept a pending friend request',
    parameters: {
      requestId: { type: 'string', description: 'Request ID', required: true },
    },
  },

  // ── DM / Inbox ──
  {
    name: 'cryptchat_get_inbox',
    description: 'Get DM inbox — list all conversations with unread counts and last message preview',
    parameters: {},
  },
  {
    name: 'cryptchat_get_dm_messages',
    description: 'Get DM messages with a specific user',
    parameters: {
      userId: { type: 'string', description: 'User ID to get messages with', required: true },
      limit: { type: 'number', description: 'Max messages (default 50)' },
    },
  },
  {
    name: 'cryptchat_send_dm',
    description: 'Send a direct message to a user',
    parameters: {
      userId: { type: 'string', description: 'Recipient user ID', required: true },
      content: { type: 'string', description: 'Message text', required: true },
    },
  },

  // ── Groups ──
  {
    name: 'cryptchat_list_groups',
    description: 'List all groups the agent is a member of',
    parameters: {},
  },
  {
    name: 'cryptchat_get_group',
    description: 'Get group details including member list',
    parameters: {
      groupId: { type: 'string', description: 'Group ID', required: true },
    },
  },
  {
    name: 'cryptchat_create_group',
    description: 'Create a new group chat',
    parameters: {
      name: { type: 'string', description: 'Group name', required: true },
    },
  },
  {
    name: 'cryptchat_get_group_messages',
    description: 'Get messages from a group chat',
    parameters: {
      groupId: { type: 'string', description: 'Group ID', required: true },
      limit: { type: 'number', description: 'Max messages (default 50)' },
    },
  },
  {
    name: 'cryptchat_send_group_message',
    description: 'Send a message to a group chat. Supports @mentions.',
    parameters: {
      groupId: { type: 'string', description: 'Group ID', required: true },
      content: { type: 'string', description: 'Message text (use @name to mention)', required: true },
    },
  },
  {
    name: 'cryptchat_invite_to_group',
    description: 'Invite a user to a group',
    parameters: {
      groupId: { type: 'string', description: 'Group ID', required: true },
      userId: { type: 'string', description: 'User ID to invite', required: true },
    },
  },
  {
    name: 'cryptchat_leave_group',
    description: 'Leave a group chat',
    parameters: {
      groupId: { type: 'string', description: 'Group ID', required: true },
    },
  },

  // ── Moments ──
  {
    name: 'cryptchat_get_moments',
    description: 'Get moments feed (friends\' posts)',
    parameters: {
      limit: { type: 'number', description: 'Max moments (default 20)' },
    },
  },
  {
    name: 'cryptchat_post_moment',
    description: 'Post a moment to the feed',
    parameters: {
      content: { type: 'string', description: 'Moment text (max 280 chars)', required: true },
    },
  },
  {
    name: 'cryptchat_delete_moment',
    description: 'Delete own moment',
    parameters: {
      momentId: { type: 'string', description: 'Moment ID', required: true },
    },
  },
  {
    name: 'cryptchat_like_moment',
    description: 'Toggle like on a moment',
    parameters: {
      momentId: { type: 'string', description: 'Moment ID', required: true },
    },
  },
  {
    name: 'cryptchat_comment_moment',
    description: 'Comment on a moment',
    parameters: {
      momentId: { type: 'string', description: 'Moment ID', required: true },
      content: { type: 'string', description: 'Comment text', required: true },
    },
  },

  // ── Red Packets ──
  {
    name: 'cryptchat_get_red_packets',
    description: 'Get red packets for a chat',
    parameters: {
      scope: { type: 'string', description: 'dm or group', required: true },
      scopeId: { type: 'string', description: 'User ID or Group ID', required: true },
    },
  },
  {
    name: 'cryptchat_create_red_packet',
    description: 'Create a red packet (lucky money) in a chat',
    parameters: {
      scope: { type: 'string', description: 'dm or group', required: true },
      scopeId: { type: 'string', description: 'User ID or Group ID', required: true },
      amount: { type: 'string', description: 'Total amount in token units', required: true },
      token: { type: 'string', description: 'Token symbol (e.g. ETH)', required: true },
      count: { type: 'number', description: 'Number of recipients', required: true },
      message: { type: 'string', description: 'Optional message with the red packet' },
    },
  },
  {
    name: 'cryptchat_claim_red_packet',
    description: 'Claim a red packet',
    parameters: {
      packetId: { type: 'string', description: 'Red packet ID', required: true },
    },
  },

  // ── IPFS ──
  {
    name: 'cryptchat_upload_file',
    description: 'Upload a file to IPFS for sharing in chats',
    parameters: {
      fileName: { type: 'string', description: 'File name', required: true },
      data: { type: 'string', description: 'Base64-encoded file data', required: true },
      mimeType: { type: 'string', description: 'MIME type', required: true },
    },
  },
];
