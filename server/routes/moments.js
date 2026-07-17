// src/routes/moments.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { prisma } from "../utils/prisma.js";
var momentsRouter = Router();
momentsRouter.post("/", authMiddleware, async (req, res) => {
  try {
    const { content, visibility } = req.body;
    if (!content || typeof content !== "string" || content.length > 1e3) {
      return res.status(400).json({ error: "Invalid content" });
    }
    const vis = visibility === "public" ? "public" : "friends";
    const moment = await prisma.moment.create({
      data: { userId: req.user.userId, content, visibility: vis }
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    res.json({
      moment: {
        id: moment.id,
        content: moment.content,
        visibility: moment.visibility,
        time: moment.createdAt,
        authorName: user?.displayName || user?.address?.slice(0, 8),
        authorAddr: user?.address
      }
    });
  } catch (err) {
    console.error("moments create error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
momentsRouter.get("/", authMiddleware, async (req, res) => {
  try {
    const contacts = await prisma.contact.findMany({
      where: { userId: req.user.userId, status: "accepted" },
      select: { contactId: true }
    });
    const friendIds = contacts.map((c) => c.contactId);
    const moments = await prisma.moment.findMany({
      where: {
        OR: [
          { userId: { in: [req.user.userId, ...friendIds] } },
          // own + friends (all visibility)
          { visibility: "public" }
          // public from anyone
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    const authorIds = [...new Set(moments.map((m) => m.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, address: true, displayName: true }
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const momentIds = moments.map((m) => m.id);
    const [allLikes, allComments] = await Promise.all([
      prisma.momentLike.findMany({ where: { momentId: { in: momentIds } } }),
      prisma.momentComment.findMany({ where: { momentId: { in: momentIds } }, orderBy: { createdAt: "asc" } })
    ]);
    const commenterIds = [...new Set(allComments.map((c) => c.userId))];
    const commenters = await prisma.user.findMany({
      where: { id: { in: commenterIds } },
      select: { id: true, address: true, displayName: true }
    });
    const commenterMap = new Map(commenters.map((u) => [u.id, u]));
    res.json({
      moments: moments.map((m) => {
        const u = userMap.get(m.userId);
        const likes = allLikes.filter((l) => l.momentId === m.id);
        const comments = allComments.filter((c) => c.momentId === m.id);
        return {
          id: m.id,
          content: m.content,
          time: new Date(m.createdAt).toLocaleString(),
          authorName: u?.displayName || u?.address?.slice(0, 8),
          authorAddr: u?.address,
          userId: m.userId,
          likes: likes.map((l) => l.userId),
          liked: likes.some((l) => l.userId === req.user.userId),
          comments: comments.map((c) => ({
            id: c.id,
            userId: c.userId,
            content: c.content,
            time: new Date(c.createdAt).toLocaleString(),
            authorName: commenterMap.get(c.userId)?.displayName || commenterMap.get(c.userId)?.address?.slice(0, 8)
          }))
        };
      })
    });
  } catch (err) {
    console.error("moments list error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
momentsRouter.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const momentId = req.params.id;
    const userId = req.user.userId;
    const moment = await prisma.moment.findUnique({ where: { id: momentId } });
    if (!moment) {
      return res.status(404).json({ error: "Moment not found" });
    }
    if (moment.userId !== userId) {
      return res.status(403).json({ error: "Not your moment" });
    }
    await prisma.moment.delete({ where: { id: momentId } });
    res.json({ deleted: true });
  } catch (err) {
    console.error("delete moment error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
momentsRouter.post("/:id/like", authMiddleware, async (req, res) => {
  try {
    const momentId = req.params.id;
    const userId = req.user.userId;
    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId, userId } }
    });
    if (existing) {
      await prisma.momentLike.delete({ where: { id: existing.id } });
      return res.json({ liked: false });
    }
    await prisma.momentLike.create({ data: { momentId, userId } });
    res.json({ liked: true });
  } catch (err) {
    console.error("like error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
momentsRouter.post("/:id/comment", authMiddleware, async (req, res) => {
  try {
    const momentId = req.params.id;
    const { content } = req.body;
    if (!content || typeof content !== "string" || content.length > 500) {
      return res.status(400).json({ error: "Invalid content" });
    }
    const comment = await prisma.momentComment.create({
      data: { momentId, userId: req.user.userId, content }
    });
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    res.json({
      comment: {
        id: comment.id,
        userId: comment.userId,
        content: comment.content,
        time: new Date(comment.createdAt).toLocaleString(),
        authorName: user?.displayName || user?.address?.slice(0, 8)
      }
    });
  } catch (err) {
    console.error("comment error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
export {
  momentsRouter
};
