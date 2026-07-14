/** CryptChat MCP — Tool executors */

import { CryptChatClient } from '../sdk-client-full.js';

export interface MCPToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
}

export interface MCPToolDef {
  name: string;
  description: string;
  parameters: Record<string, MCPToolParameter>;
}

export async function executeTool(
  client: CryptChatClient,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    switch (toolName) {
      // ── Profile ──
      case 'cryptchat_get_profile':
        return { ok: true, data: await client.getProfile() };

      case 'cryptchat_search_users':
        return { ok: true, data: await client.searchUsers(args.query as string) };

      // ── Friends ──
      case 'cryptchat_list_friends':
        return { ok: true, data: await client.getFriends() };

      case 'cryptchat_get_friend_requests':
        return { ok: true, data: await client.getFriendRequests() };

      case 'cryptchat_send_friend_request':
        return { ok: true, data: await client.sendFriendRequest(args.address as string) };

      case 'cryptchat_accept_friend_request':
        return { ok: true, data: await client.acceptFriendRequest(args.requestId as string) };

      // ── DM ──
      case 'cryptchat_get_inbox':
        return { ok: true, data: await client.getInbox() };

      case 'cryptchat_get_dm_messages':
        return {
          ok: true,
          data: await client.getDMMessages(args.userId as string, {
            limit: args.limit as number | undefined,
          }),
        };

      case 'cryptchat_send_dm':
        return {
          ok: true,
          data: await client.sendDM(args.userId as string, args.content as string),
        };

      // ── Groups ──
      case 'cryptchat_list_groups':
        return { ok: true, data: await client.getGroups() };

      case 'cryptchat_get_group':
        return { ok: true, data: await client.getGroup(args.groupId as string) };

      case 'cryptchat_create_group':
        return { ok: true, data: await client.createGroup(args.name as string) };

      case 'cryptchat_get_group_messages':
        return {
          ok: true,
          data: await client.getGroupMessages(args.groupId as string, {
            limit: args.limit as number | undefined,
          }),
        };

      case 'cryptchat_send_group_message':
        return {
          ok: true,
          data: await client.sendGroupMessage(args.groupId as string, args.content as string),
        };

      case 'cryptchat_invite_to_group':
        return {
          ok: true,
          data: await client.inviteToGroup(args.groupId as string, args.userId as string),
        };

      case 'cryptchat_leave_group':
        return { ok: true, data: await client.leaveGroup(args.groupId as string) };

      // ── Moments ──
      case 'cryptchat_get_moments':
        return {
          ok: true,
          data: await client.getMoments({ limit: args.limit as number | undefined }),
        };

      case 'cryptchat_post_moment':
        return { ok: true, data: await client.postMoment(args.content as string) };

      case 'cryptchat_delete_moment':
        return { ok: true, data: await client.deleteMoment(args.momentId as string) };

      case 'cryptchat_like_moment':
        return { ok: true, data: await client.toggleMomentLike(args.momentId as string) };

      case 'cryptchat_comment_moment':
        return {
          ok: true,
          data: await client.commentOnMoment(
            args.momentId as string,
            args.content as string
          ),
        };

      // ── Red Packets ──
      case 'cryptchat_get_red_packets':
        return {
          ok: true,
          data: await client.getRedPackets(
            args.scope as 'dm' | 'group',
            args.scopeId as string
          ),
        };

      case 'cryptchat_create_red_packet':
        return {
          ok: true,
          data: await client.createRedPacket({
            scope: args.scope as 'dm' | 'group',
            scopeId: args.scopeId as string,
            amount: args.amount as string,
            token: args.token as string,
            count: args.count as number,
            message: args.message as string | undefined,
          }),
        };

      case 'cryptchat_claim_red_packet':
        return {
          ok: true,
          data: await client.claimRedPacket(args.packetId as string),
        };

      // ── IPFS ──
      case 'cryptchat_upload_file':
        return {
          ok: true,
          data: await client.uploadFile({
            fileName: args.fileName as string,
            data: args.data as string,
            mimeType: args.mimeType as string,
          }),
        };

      default:
        return { ok: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
