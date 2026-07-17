var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/routes/ipfs.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
var ipfsRouter = Router();
var PINATA_JWT = process.env.PINATA_JWT || "";
var PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";
var uploadDir = path.join(process.cwd(), "uploads");
fs.promises.mkdir(uploadDir, { recursive: true }).catch(() => {
});
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest();
}
__name(sha256, "sha256");
function toBase58(buf) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + buf.toString("hex"));
  let encoded = "";
  while (num > 0n) {
    encoded = alphabet[Number(num % 58n)] + encoded;
    num /= 58n;
  }
  for (let i = 0; i < buf.length && buf[i] === 0; i++) encoded = "1" + encoded;
  return encoded;
}
__name(toBase58, "toBase58");
function multihash(buf) {
  const len = Buffer.alloc(1);
  len.writeUInt8(buf.length);
  return Buffer.concat([Buffer.from([18]), len, buf]);
}
__name(multihash, "multihash");
function ipfsCidV0(buf) {
  const mh = multihash(sha256(buf));
  return "Qm" + toBase58(Buffer.concat([mh, sha256(buf)]));
}
__name(ipfsCidV0, "ipfsCidV0");
async function pinataUpload(fileName, buffer, mimeType) {
  if (!PINATA_JWT) return null;
  try {
    const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });
    const form = new FormData();
    form.append("file", blob, fileName);
    form.append("pinataMetadata", JSON.stringify({ name: fileName }));
    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      body: form,
      signal: AbortSignal.timeout(3e4)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Pinata] upload failed:", res.status, errText.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.IpfsHash || null;
  } catch (err) {
    console.warn("[Pinata] upload error:", err?.message || err);
    return null;
  }
}
__name(pinataUpload, "pinataUpload");
ipfsRouter.post("/upload", authMiddleware, async (req, res) => {
  const { fileName, data, mimeType } = req.body;
  if (!data || !fileName) return res.status(400).json({ error: "fileName and data (base64) required" });
  try {
    const buffer = Buffer.from(data, "base64");
    const cid = await pinataUpload(fileName, buffer, mimeType || "application/octet-stream");
    if (cid) {
      res.json({
        cid,
        name: fileName,
        size: buffer.length,
        mimeType: mimeType || "application/octet-stream",
        url: `${PINATA_GATEWAY}/${cid}`
      });
      return;
    }
    const localCid = ipfsCidV0(buffer);
    const hashHex = sha256(buffer).toString("hex");
    const filePath = path.join(uploadDir, `${hashHex}_${fileName}`);
    await fs.promises.writeFile(filePath, buffer);
    res.json({
      cid: localCid,
      name: fileName,
      size: buffer.length,
      mimeType: mimeType || "application/octet-stream",
      url: `/api/ipfs/file/${localCid}`
    });
  } catch (err) {
    console.error("ipfs upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});
ipfsRouter.get("/file/:cid", async (req, res) => {
  try {
    const { cid } = req.params;
    if (PINATA_JWT) {
      const targetUrl = `${PINATA_GATEWAY}/${cid}`;
      const upstream = await fetch(targetUrl, {
        signal: AbortSignal.timeout(15e3),
        headers: { Accept: "*/*" }
      });
      if (upstream.ok) {
        const ct = upstream.headers.get("content-type") || "application/octet-stream";
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.setHeader("Content-Type", ct);
        res.setHeader("Content-Length", buf.length);
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        res.end(buf);
        return;
      }
    }
    const files = await fs.promises.readdir(uploadDir);
    let match;
    if (cid.startsWith("Qm")) {
      const cleanHash = cid.replace("Qm", "");
      match = files.find((f) => f.startsWith(cleanHash) || f.includes(cleanHash));
    }
    if (!match) match = files.find((f) => f.startsWith(cid) || f.includes(cid));
    if (!match) {
      const byHashSuffix = files.find((f) => {
        const parts = f.split("_");
        return parts.length > 1 && cid.endsWith(parts[0].slice(0, 8));
      });
      match = byHashSuffix;
    }
    if (!match) return res.status(404).json({ error: "File not found" });
    const filePath = path.join(uploadDir, match);
    const stat = await fs.promises.stat(filePath);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="${match}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error("ipfs get error:", err);
    res.status(500).json({ error: "Retrieval failed" });
  }
});
export {
  ipfsRouter
};
