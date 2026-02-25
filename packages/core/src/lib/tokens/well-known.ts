/**
 * Shared well-known token metadata registry.
 *
 * Single source of truth for token symbol/decimals resolution,
 * consumed by both the simulation event decoder and the transaction
 * interpretation module.
 *
 * Key format: `chainId:lowercaseAddress` for chain-specific lookups.
 * Fallback entries (no chain prefix) used when chainId is unavailable.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface TokenMeta {
  symbol: string;
  decimals: number;
}

// ── Chain-scoped registry ────────────────────────────────────────────

/** Key: `chainId:lowercaseAddress` */
const CHAIN_TOKENS: Record<string, TokenMeta> = {
  // Ethereum mainnet
  "1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "1:0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "1:0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "1:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
  "1:0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", decimals: 18 },
  "1:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", decimals: 18 },
  "1:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "1:0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2": { symbol: "MKR", decimals: 18 },
  "1:0xae7ab96520de3a18e5e111b5eaab095312d7fe84": { symbol: "stETH", decimals: 18 },
  "1:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": { symbol: "wstETH", decimals: 18 },
  "1:0xd533a949740bb3306d119cc777fa900ba034cd52": { symbol: "CRV", decimals: 18 },
  "1:0xba100000625a3754423978a60c9317c58a424e3d": { symbol: "BAL", decimals: 18 },
  "1:0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab": { symbol: "COW", decimals: 18 },
  // Gnosis chain
  "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": { symbol: "WXDAI", decimals: 18 },
  "100:0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1": { symbol: "WETH", decimals: 18 },
  "100:0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": { symbol: "USDC", decimals: 6 },
  "100:0x4ecaba5870353805a9f068101a40e0f32ed605c6": { symbol: "USDT", decimals: 6 },
  "100:0x177127622c4a00f3d409b75571e12cb3c8973d3c": { symbol: "COW", decimals: 18 },
  // Polygon
  "137:0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": { symbol: "WPOL", decimals: 18 },
  "137:0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { symbol: "WETH", decimals: 18 },
  "137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6 },
  "137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { symbol: "USDT", decimals: 6 },
  // Arbitrum One
  "42161:0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { symbol: "WETH", decimals: 18 },
  "42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "42161:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  // Optimism
  "10:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "10:0x0b2c639c533813f4aa9d7837caf62653d097ff85": { symbol: "USDC", decimals: 6 },
  "10:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": { symbol: "USDT", decimals: 6 },
  "10:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": { symbol: "DAI", decimals: 18 },
  // Base
  "8453:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  // Linea
  "59144:0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f": { symbol: "WETH", decimals: 18 },
  "59144:0x176211869ca2b568f2a7d4ee941e073a821ee1ff": { symbol: "USDC", decimals: 6 },
  "59144:0xa219439258ca9da29e9cc4ce5596924745e12b93": { symbol: "USDT", decimals: 6 },
  // Sepolia
  "11155111:0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18 },
};

/** Fallback: address-only lookup (no chain). Used when chainId is unavailable. */
const FALLBACK_TOKENS: Record<string, TokenMeta> = {
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
};

// ── Lookup ────────────────────────────────────────────────────────────

/**
 * Resolve token metadata by address and optional chain ID.
 *
 * Tries chain-scoped lookup first, falls back to address-only.
 * Returns null for unknown tokens.
 */
export function resolveTokenMeta(address: string, chainId?: number): TokenMeta | null {
  const lower = address.toLowerCase();
  if (chainId !== undefined) {
    const keyed = CHAIN_TOKENS[`${chainId}:${lower}`];
    if (keyed) return keyed;
  }
  return FALLBACK_TOKENS[lower] ?? null;
}
