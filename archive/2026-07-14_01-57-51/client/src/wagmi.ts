import { createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// OxaChain L1 — Ceres DID 生产链 (Chain ID 19505)
const oxaChain = {
  id: 19505,
  name: 'OxaChain',
  network: 'oxachain',
  nativeCurrency: { name: 'OXA', symbol: 'OXA', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.oxachain.org'] },
    public: { http: ['https://rpc.oxachain.org'] },
  },
  blockExplorers: {
    default: { name: 'OxaScan', url: 'https://scan.oxachain.org' },
  },
  testnet: false,
} as const;

export const config = createConfig({
  chains: [oxaChain, sepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [oxaChain.id]: http(),
    [sepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}
