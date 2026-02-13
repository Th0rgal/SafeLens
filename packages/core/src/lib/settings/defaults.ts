import type { SettingsConfig } from "./types";

export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
  version: "1.0",
  chains: {
    "1": { name: "Ethereum" },
    "100": { name: "Gnosis" },
  },
  addressBook: [
    { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "EF#1", chainId: 1 },
    { address: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4", name: "Signer 1", chainId: 1 },
  ],
  contractRegistry: [
    { address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2", name: "MultiSend 1.4.1", chainId: 1 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", chainId: 1 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", name: "DAI", chainId: 1 },
    { address: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110", name: "CoW Vault Relayer", chainId: 1 },
    { address: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74", name: "CoW Composable Order Framework", chainId: 1 },
    { address: "0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5", name: "CoW TWAP Handler", chainId: 1 },
    { address: "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc", name: "CoW Factory", chainId: 1 },
  ],
};
