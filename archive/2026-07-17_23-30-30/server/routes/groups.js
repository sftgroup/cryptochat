// src/routes/groups.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";
var groupRouter = Router();
groupRouter.use(authMiddleware);
groupRouter.post("/:id/keys", async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Not found" });
    if (group.creatorId !== req.user.userId) return res.status(403).json({ error: "Only group creator can set keys" });
    const { envelopes } = req.body;
    if (!envelopes?.length) return res.status(400).json({ error: "envelopes required" });
    let created = 0;
    for (const env of envelopes) {
      const member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: env.userId } }
      });
      if (!member) continue;
      await prisma.groupKeyEnvelope.upsert({
        where: { groupId_userId: { groupId, userId: env.userId } },
        create: { groupId, userId: env.userId, encryptedKey: env.encryptedKey, iv: env.iv, version: 1 },
        update: { encryptedKey: env.encryptedKey, iv: env.iv }
      });
      created++;
    }
    res.json({ ok: true, created, total: envelopes.length });
  } catch (err) {
    console.error("group keys upload:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.get("/:id/keys/my", async (req, res) => {
  try {
    const envelope = await prisma.groupKeyEnvelope.findUnique({
      where: { groupId_userId: { groupId: req.params.id, userId: req.user.userId } }
    });
    if (!envelope) return res.status(404).json({ error: "No key envelope for you in this group" });
    res.json({ envelope: { userId: envelope.userId, encryptedKey: envelope.encryptedKey, iv: envelope.iv, version: envelope.version } });
  } catch (err) {
    console.error("get my group key:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.get("/:id/keys", async (req, res) => {
  try {
    const groupId = req.params.id;
    const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user.userId } } });
    if (!isMember) return res.status(403).json({ error: "Not a member" });
    const envelopes = await prisma.groupKeyEnvelope.findMany({ where: { groupId } });
    res.json({ envelopes: envelopes.map((e) => ({ userId: e.userId, encryptedKey: e.encryptedKey, iv: e.iv, version: e.version })) });
  } catch (err) {
    console.error("list group keys:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.get("/", async (req, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.user.userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: { select: { id: true, address: true, displayName: true, avatarUrl: true } }
              }
            }
          }
        }
      },
      orderBy: { group: { updatedAt: "desc" } }
    });
    res.json({ groups: memberships.map((m) => m.group) });
  } catch (err) {
    console.error("list groups:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/", async (req, res) => {
  try {
    const { name, description, memberAddresses } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Group name required" });
    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        creatorId: req.user.userId,
        members: { create: { userId: req.user.userId, role: "admin" } }
      },
      include: {
        members: {
          include: { user: { select: { id: true, address: true, displayName: true } } }
        }
      }
    });
    if (memberAddresses?.length) {
      const users = await prisma.user.findMany({
        where: { address: { in: memberAddresses.map((a) => a.toLowerCase()) } }
      });
      for (const u of users) {
        try {
          await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: "member" } });
        } catch {
        }
      }
    }
    res.status(201).json({ group });
  } catch (err) {
    console.error("create group:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/join", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Group name required" });
    let group = await prisma.group.findFirst({ where: { name: name.trim() } });
    if (!group) {
      group = await prisma.group.findFirst({ where: { name: { contains: name.trim() } } });
    }
    if (!group) return res.status(404).json({ error: "Group not found" });
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user.userId } }
    });
    if (existing) return res.status(409).json({ error: "Already a member" });
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user.userId, role: "member" }
    });
    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
    });
    res.json({ group: updated });
  } catch (err) {
    console.error("join by name:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/join-by-code", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code?.trim()) return res.status(400).json({ error: "Invite code required" });
    const group = await prisma.group.findUnique({ where: { inviteCode: code.trim().toUpperCase() } });
    if (!group) return res.status(404).json({ error: "Invalid invite code" });
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: req.user.userId } }
    });
    if (existing) return res.status(409).json({ error: "Already a member" });
    await prisma.groupMember.create({
      data: { groupId: group.id, userId: req.user.userId, role: "member" }
    });
    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
    });
    res.json({ group: updated });
  } catch (err) {
    console.error("join by code:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.get("/:id", async (req, res) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        members: {
          include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } }
        }
      }
    });
    if (!group) return res.status(404).json({ error: "Not found" });
    const isMember = group.members.some((m) => m.userId === req.user.userId);
    if (!isMember) return res.status(403).json({ error: "Not a member" });
    res.json({ group });
  } catch (err) {
    console.error("get group:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/join", async (req, res) => {
  try {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: "Not found" });
    try {
      await prisma.groupMember.create({ data: { groupId: group.id, userId: req.user.userId, role: "member" } });
    } catch {
      return res.status(409).json({ error: "Already a member" });
    }
    const updated = await prisma.group.findUnique({
      where: { id: group.id },
      include: { members: { include: { user: { select: { id: true, address: true, displayName: true, avatarUrl: true } } } } }
    });
    res.json({ group: updated });
  } catch (err) {
    console.error("join:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/invite", async (req, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses?.length) return res.status(400).json({ error: "Addresses required" });
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) return res.status(404).json({ error: "Not found" });
    const users = await prisma.user.findMany({ where: { address: { in: addresses.map((a) => a.toLowerCase()) } } });
    let added = 0;
    for (const u of users) {
      try {
        await prisma.groupMember.create({ data: { groupId: group.id, userId: u.id, role: "member" } });
        added++;
      } catch {
      }
    }
    res.json({ invited: added, total: addresses.length });
  } catch (err) {
    console.error("invite:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/invite-code", async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Not found" });
    const isMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.user.userId } }
    });
    if (!isMember || isMember.role !== "admin") return res.status(403).json({ error: "Only group admins can generate invite codes" });
    if (group.inviteCode) return res.json({ inviteCode: group.inviteCode });
    const code = Array.from({ length: 6 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join("");
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { inviteCode: code }
    });
    res.json({ inviteCode: updated.inviteCode });
  } catch (err) {
    console.error("invite code:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.get("/:id/messages", async (req, res) => {
  try {
    const msgs = await prisma.groupMessage.findMany({
      where: { groupId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    res.json({ messages: msgs.reverse() });
  } catch (err) {
    console.error("messages:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/messages", async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: "Not found" });
    const isMember = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: req.user.userId } } });
    if (!isMember) return res.status(403).json({ error: "Not a member" });
    const msg = await prisma.groupMessage.create({
      data: { groupId, senderId: req.user.userId, content: req.body.content, messageType: req.body.messageType || "text", metadata: req.body.metadata || null, keyVersion: req.body.keyVersion || 1 }
    });
    const members = await prisma.groupMember.findMany({ where: { groupId } });
    const { pushEvent } = await import("../index.js");
    const meta = req.body.metadata ? JSON.parse(req.body.metadata) : null;
    const mentionedIds = meta?.mentions || [];
    for (const m of members) {
      if (m.userId !== req.user.userId) {
        pushEvent(m.userId, { type: "new_group_msg", payload: { groupId, mentioned: mentionedIds.includes(m.userId) ? true : false } });
      }
    }
    res.status(201).json({ message: msg });
  } catch (err) {
    console.error("send group msg:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/leave", async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.userId;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } }
    });
    if (!membership) return res.status(404).json({ error: "Not a member of this group" });
    if (membership.role === "admin") {
      const memberCount = await prisma.groupMember.count({ where: { groupId, id: { not: membership.id } } });
      if (memberCount === 0) {
        await prisma.groupMember.deleteMany({ where: { groupId } });
        await prisma.groupKeyEnvelope.deleteMany({ where: { groupId } });
        await prisma.groupMessage.deleteMany({ where: { groupId } });
        await prisma.group.delete({ where: { id: groupId } });
        return res.json({ deleted: true });
      }
    }
    await prisma.groupMember.delete({ where: { id: membership.id } });
    res.json({ success: true });
  } catch (err) {
    console.error("leave group:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.put("/:id", async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user.userId;
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } }
    });
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ error: "Only admin can update group" });
    }
    const { name, description } = req.body;
    const data = {};
    if (name) data.name = name;
    if (description !== void 0) data.description = description;
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    const group = await prisma.group.update({ where: { id: groupId }, data });
    res.json({ group });
  } catch (err) {
    console.error("update group:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/kick/:userId", async (req, res) => {
  try {
    const groupId = req.params.id;
    const adminId = req.user.userId;
    const targetId = req.params.userId;
    const adminMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: adminId } }
    });
    if (!adminMembership || adminMembership.role !== "admin") {
      return res.status(403).json({ error: "Only admin can kick members" });
    }
    if (adminId === targetId) {
      return res.status(400).json({ error: "Cannot kick yourself \u2014 use Leave Group instead" });
    }
    const target = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetId } }
    });
    if (!target) return res.status(404).json({ error: "Member not found in group" });
    await prisma.groupMember.delete({ where: { id: target.id } });
    await prisma.groupKeyEnvelope.deleteMany({ where: { groupId, userId: targetId } });
    const { pushEvent } = await import("../index.js");
    pushEvent(targetId, { type: "kicked_from_group", payload: { groupId } });
    res.json({ success: true });
  } catch (err) {
    console.error("kick member:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
groupRouter.post("/:id/transfer", async (req, res) => {
  try {
    const groupId = req.params.id;
    const adminId = req.user.userId;
    const newAdminId = req.body.userId;
    const adminMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: adminId } }
    });
    if (!adminMembership || adminMembership.role !== "admin") {
      return res.status(403).json({ error: "Only admin can transfer ownership" });
    }
    const target = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: newAdminId } }
    });
    if (!target) return res.status(404).json({ error: "Target member not found in group" });
    await prisma.groupMember.update({
      where: { id: adminMembership.id },
      data: { role: "member" }
    });
    await prisma.groupMember.update({
      where: { id: target.id },
      data: { role: "admin" }
    });
    const { pushEvent } = await import("../index.js");
    pushEvent(newAdminId, { type: "group_admin_changed", payload: { groupId } });
    res.json({ success: true });
  } catch (err) {
    console.error("transfer admin:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
export {
  groupRouter
};
