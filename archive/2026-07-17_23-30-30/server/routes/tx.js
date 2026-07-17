var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/routes/tx.ts
import { Router } from "express";
import { ethers } from "ethers";
import { authMiddleware } from "../middleware/auth.js";
var txRouter = Router();
txRouter.use(authMiddleware);
var RPC_MAP = {
  1: "https://eth.llamarpc.com",
  56: "https://bsc-dataseed.binance.org",
  137: "https://polygon.llamarpc.com",
  8453: "https://base.llamarpc.com",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  43114: "https://api.avax.network/ext/bc/C/rpc"
};
function getProvider(chainId) {
  const rpc = RPC_MAP[chainId];
  if (!rpc) return null;
  return new ethers.JsonRpcProvider(rpc);
}
__name(getProvider, "getProvider");
txRouter.post("/estimate", async (req, res) => {
  try {
    const { to, value, chainId, tokenAddress, from } = req.body;
    if (!to || !value || !chainId) {
      return res.status(400).json({ error: "Missing to, value, or chainId" });
    }
    const provider = getProvider(chainId);
    const isToken = !!tokenAddress;
    let gasEstimate;
    let gasPrice;
    if (provider) {
      try {
        const tx = {
          to,
          value: ethers.parseEther(String(value)),
          chainId
        };
        if (from) tx.from = from;
        if (tokenAddress) {
          const iface = new ethers.Interface(["function transfer(address to, uint256 amount)"]);
          tx.to = tokenAddress;
          tx.data = iface.encodeFunctionData("transfer", [to, value]);
          tx.value = void 0;
        }
        const [gas, price] = await Promise.all([
          provider.estimateGas(tx).catch(() => null),
          provider.getFeeData().catch(() => null)
        ]);
        gasEstimate = gas !== null ? gas : isToken ? 65000n : 21000n;
        gasPrice = price?.gasPrice || 5000000000n;
      } catch {
        gasEstimate = isToken ? 65000n : 21000n;
        gasPrice = 5000000000n;
      }
    } else {
      gasEstimate = isToken ? 65000n : 21000n;
      gasPrice = 5000000000n;
    }
    res.json({
      gasEstimate: gasEstimate.toString(),
      gasPriceWei: gasPrice.toString(),
      gasTotalWei: (gasEstimate * gasPrice).toString(),
      gasTotalEth: ethers.formatEther(gasEstimate * gasPrice),
      isToken
    });
  } catch (err) {
    console.error("[tx] estimate error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
txRouter.get("/chains", (_req, res) => {
  res.json({
    chains: Object.entries(RPC_MAP).map(([id, rpc]) => {
      const names = {
        "1": ["Ethereum", "ETH"],
        "56": ["BNB Chain", "BNB"],
        "137": ["Polygon", "POL"],
        "8453": ["Base", "ETH"],
        "42161": ["Arbitrum", "ETH"],
        "10": ["Optimism", "ETH"],
        "43114": ["Avalanche", "AVAX"]
      };
      const [name, symbol] = names[id] || ["Unknown", "ETH"];
      return { id: Number(id), name, symbol, rpc };
    })
  });
});
txRouter.post("/prepare", async (req, res) => {
  try {
    const { to, value, chainId, tokenAddress } = req.body;
    if (!to || !value || !chainId) {
      return res.status(400).json({ error: "Missing to, value, or chainId" });
    }
    const chainIdNum = parseInt(chainId, 10);
    res.json({
      to,
      value,
      chainId: chainIdNum,
      tokenAddress: tokenAddress || null,
      data: tokenAddress ? new ethers.Interface(["function transfer(address to, uint256 amount)"]).encodeFunctionData("transfer", [to, value]) : "0x"
    });
  } catch (err) {
    console.error("[tx] prepare error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});
export {
  txRouter
};
