import type { SettingsConfig } from "./types";
import { bundledDescriptors } from "../erc7730/descriptors/index";

/**
 * Default settings including the built-in contract registry.
 *
 * The contract registry maps known contract addresses to human-readable names.
 * When SafeLens sees a transaction targeting one of these addresses, it displays
 * the name instead of raw hex. Addresses are sourced from:
 *   - ERC-7730 clear signing registry (LedgerHQ)
 *   - Uniswap V3 deployment docs
 *   - Aave address book
 *
 * For contracts deployed at the same address across many chains (CREATE2),
 * a single entry with chainId: 1 is sufficient — the lookup is address-only.
 * Chain-specific entries are added when addresses differ per chain.
 */
export const DEFAULT_SETTINGS_CONFIG: SettingsConfig = {
  version: "1.0",
  erc7730Descriptors: bundledDescriptors as SettingsConfig["erc7730Descriptors"],
  disabledInterpreters: [],
  chains: {
    "1": { name: "Ethereum" },
    "10": { name: "Optimism" },
    "56": { name: "BNB Chain" },
    "100": { name: "Gnosis" },
    "137": { name: "Polygon" },
    "8453": { name: "Base" },
    "42161": { name: "Arbitrum One" },
    "43114": { name: "Avalanche" },
  },
  addressBook: [
    { address: "0x9fC3dc011b461664c835F2527fffb1169b3C213e", name: "EF#1", chainId: 1 },
    { address: "0xd779332c5A52566Dada11A075a735b18DAa6c1f4", name: "Signer 1", chainId: 1 },
  ],
  contractRegistry: [
    // ── Safe / CoW Protocol ───────────────────────────────────────────
    { address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2", name: "MultiSend 1.4.1", chainId: 1 },
    { address: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110", name: "CoW Vault Relayer", chainId: 1 },
    { address: "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74", name: "CoW Composable Order Framework", chainId: 1 },
    { address: "0x6cF1e9cA41f7611dEf408122793c358a3d11E5a5", name: "CoW TWAP Handler", chainId: 1 },
    { address: "0x52eD56Da04309Aca4c3FECC595298d80C2f16BAc", name: "CoW Factory", chainId: 1 },

    // ── Tokens ────────────────────────────────────────────────────────
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "WETH", chainId: 1 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", name: "DAI", chainId: 1 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USDC", chainId: 1 },
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USDC", chainId: 8453 },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", name: "USDC", chainId: 42161 },
    { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", name: "USDC", chainId: 10 },
    { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", name: "USDC", chainId: 137 },
    { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", name: "USDC", chainId: 43114 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "USDT", chainId: 1 },
    { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", name: "USDT", chainId: 137 },

    // ── 1inch ─────────────────────────────────────────────────────────
    // Same address on 13 chains (Ethereum, Optimism, BSC, Gnosis, Polygon,
    // Sonic, Fantom, Klaytn, Base, Arbitrum, Avalanche, Linea, Aurora)
    { address: "0x111111125421cA6dc452d289314280a0f8842A65", name: "1inch AggregationRouter V6", chainId: 1 },

    // ── Aave V3 ───────────────────────────────────────────────────────
    { address: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", name: "Aave V3 Pool", chainId: 1 },
    // Polygon, Arbitrum, Optimism, Avalanche share this address
    { address: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", name: "Aave V3 Pool", chainId: 137 },
    { address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", name: "Aave V3 Pool", chainId: 8453 },
    { address: "0xb50201558B00496A145fE76f7424749556E326D8", name: "Aave V3 Pool", chainId: 100 },

    // ── Ethena ────────────────────────────────────────────────────────
    { address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", name: "Ethena: Staked USDe", chainId: 1 },

    // ── Lido ──────────────────────────────────────────────────────────
    { address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", name: "Lido: stETH", chainId: 1 },
    { address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", name: "Lido: wstETH", chainId: 1 },
    { address: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", name: "Lido: Withdrawal Queue", chainId: 1 },

    // ── LI.FI ─────────────────────────────────────────────────────────
    // Same address on 25+ chains; notable exceptions: zkSync, Linea, Metis
    { address: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", name: "LI.FI Diamond", chainId: 1 },

    // ── Morpho ────────────────────────────────────────────────────────
    // Same address on Ethereum and Base
    { address: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", name: "Morpho Blue", chainId: 1 },

    // ── OpenSea ───────────────────────────────────────────────────────
    { address: "0x7f268357a8c2552623316e2562d90e642bb538e5", name: "OpenSea: Wyvern Exchange", chainId: 1 },

    // ── ParaSwap ──────────────────────────────────────────────────────
    // V6.2: same address on Ethereum, Optimism, BSC, Polygon, Base, Arbitrum, Avalanche
    { address: "0x6a000f20005980200259b80c5102003040001068", name: "ParaSwap AugustusSwapper V6.2", chainId: 1 },
    // V5: same address on Ethereum, BSC, Polygon
    { address: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57", name: "ParaSwap AugustusSwapper V5", chainId: 1 },

    // ── Swell ─────────────────────────────────────────────────────────
    { address: "0x4796d939b22027c2876d5ce9fde52da9ec4e2362", name: "Swell: rswETH", chainId: 1 },

    // ── Uniswap V3 ────────────────────────────────────────────────────
    // Factory, SwapRouter, SwapRouter02, PositionManager, Permit2 share
    // addresses across all deployed chains (CREATE2).
    { address: "0x1F98431c8aD98523631AE4a59f267346ea31F984", name: "Uniswap V3 Factory", chainId: 1 },
    { address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", name: "Uniswap V3 SwapRouter", chainId: 1 },
    { address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", name: "Uniswap SwapRouter02", chainId: 1 },
    { address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", name: "Uniswap V3 PositionManager", chainId: 1 },
    { address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", name: "Permit2", chainId: 1 },
    // UniversalRouter has different addresses per chain
    { address: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af", name: "Uniswap UniversalRouter", chainId: 1 },
    { address: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3", name: "Uniswap UniversalRouter", chainId: 42161 },
    { address: "0x851116d9223fabed8e56c0e6b8ad0c31d98b3507", name: "Uniswap UniversalRouter", chainId: 10 },
  ],
};
