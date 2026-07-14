# IdentityRegistry Contract

## Deployer
- Address: `0x584Ebb3e9938109bF5DD3b7eaC3a158530c5240A`
- Private key: `0x8ed72963ee80241809c02549b54dbf992ecb55b0f55f38864f380534d0aa7164`

## Contract
- Contract: `IdentityRegistry.sol` (src/)
- Bytecode size: ~3300 bytes
- Estimated gas: ~65,000 (~0.000065 BNB on BSC testnet)

## Deploy Command (once funded)
```bash
forge create --rpc-url https://bsc-testnet.publicnode.com \
  --private-key 0x8ed72963ee80241809c02549b54dbf992ecb55b0f55f38864f380534d0aa7164 \
  src/IdentityRegistry.sol:IdentityRegistry
```

## Faucet (get 0.3 tBNB)
https://www.bnbchain.org/en/testnet-faucet
Enter deployer address: `0x584Ebb3e9938109bF5DD3b7eaC3a158530c5240A`

## Frontend Integration (ready)
- `setPubkey(pubkey)`: User calls via MetaMask, stores ECDH public key on-chain
- `getPubkey(address)`: Free view call, fetches friend's public key
- ABI in `contracts/out/IdentityRegistry.sol/IdentityRegistry.json`

## Server Endpoint (ready)
- `/api/registry/address` — returns contract address for frontend
