/**
 * Well-known token metadata for common ERC-20 tokens across chains.
 *
 * Used by the ERC-7730 interpreter to format tokenAmount fields when the
 * descriptor specifies a tokenPath (dynamic token address) rather than
 * static metadata.token.
 *
 * Key format: `${chainId}:${lowercaseAddress}`
 */

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

const TOKENS: Record<string, TokenMetadata> = {
  // ── Ethereum Mainnet (1) ──────────────────────────────────────────
  "1:0xdac17f958d2ee523a2206206994597c13d831ec7": { symbol: "USDT", decimals: 6 },
  "1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { symbol: "USDC", decimals: 6 },
  "1:0x6b175474e89094c44da98b954eedeac495271d0f": { symbol: "DAI", decimals: 18 },
  "1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { symbol: "WETH", decimals: 18 },
  "1:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": { symbol: "WBTC", decimals: 8 },
  "1:0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0": { symbol: "wstETH", decimals: 18 },
  "1:0xae7ab96520de3a18e5e111b5eaab095312d7fe84": { symbol: "stETH", decimals: 18 },
  "1:0x514910771af9ca656af840dff83e8264ecf986ca": { symbol: "LINK", decimals: 18 },
  "1:0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "1:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9": { symbol: "AAVE", decimals: 18 },

  // ── Gnosis Chain (100) ────────────────────────────────────────────
  "100:0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": { symbol: "USDC", decimals: 6 },
  "100:0x4ecaba5870353805a9f068101a40e0f32ed605c6": { symbol: "USDT", decimals: 6 },
  "100:0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": { symbol: "WXDAI", decimals: 18 },
  "100:0x6a023ccd1ff6f2045c3309768ead9e68f978f6e1": { symbol: "WETH", decimals: 18 },
  "100:0x8e5bbbb09ed1ebde8674cda39a0c169401db4252": { symbol: "WBTC", decimals: 8 },
  "100:0x6c76971f98945ae98dd7d4dfca8711ebea946ea6": { symbol: "wstETH", decimals: 18 },

  // ── Polygon (137) ─────────────────────────────────────────────────
  "137:0x2791bca1f2de4661ed88a30c99a7a9449aa84174": { symbol: "USDC.e", decimals: 6 },
  "137:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": { symbol: "USDC", decimals: 6 },
  "137:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": { symbol: "USDT", decimals: 6 },
  "137:0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { symbol: "WETH", decimals: 18 },
  "137:0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270": { symbol: "WMATIC", decimals: 18 },
  "137:0x8f3cf7ad23cd3cadbd9735aff958023239c6a063": { symbol: "DAI", decimals: 18 },

  // ── Arbitrum (42161) ──────────────────────────────────────────────
  "42161:0xaf88d065e77c8cc2239327c5edb3a432268e5831": { symbol: "USDC", decimals: 6 },
  "42161:0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": { symbol: "USDC.e", decimals: 6 },
  "42161:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9": { symbol: "USDT", decimals: 6 },
  "42161:0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { symbol: "WETH", decimals: 18 },
  "42161:0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": { symbol: "WBTC", decimals: 8 },
  "42161:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": { symbol: "DAI", decimals: 18 },

  // ── Optimism (10) ─────────────────────────────────────────────────
  "10:0x0b2c639c533813f4aa9d7837caf62653d097ff85": { symbol: "USDC", decimals: 6 },
  "10:0x7f5c764cbc14f9669b88837ca1490cca17c31607": { symbol: "USDC.e", decimals: 6 },
  "10:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58": { symbol: "USDT", decimals: 6 },
  "10:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "10:0xda10009cbd5d07dd0cecc66161fc93d7c9000da1": { symbol: "DAI", decimals: 18 },

  // ── Base (8453) ───────────────────────────────────────────────────
  "8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  "8453:0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
  "8453:0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { symbol: "DAI", decimals: 18 },

  // ── BSC (56) ──────────────────────────────────────────────────────
  "56:0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "56:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { symbol: "USDC", decimals: 18 },
  "56:0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { symbol: "WBNB", decimals: 18 },
  "56:0x2170ed0880ac9a755fd29b2688956bd959f933f8": { symbol: "ETH", decimals: 18 },

  // ── Avalanche (43114) ─────────────────────────────────────────────
  "43114:0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": { symbol: "USDC", decimals: 6 },
  "43114:0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7": { symbol: "USDT", decimals: 6 },
  "43114:0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": { symbol: "WAVAX", decimals: 18 },
  "43114:0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab": { symbol: "WETH.e", decimals: 18 },

  // ── Linea (59144) ─────────────────────────────────────────────────
  "59144:0x176211869ca2b568f2a7d4ee941e073a821ee1ff": { symbol: "USDC", decimals: 6 },
  "59144:0xa219439258ca9da29e9cc4ce5596924745e12b93": { symbol: "USDT", decimals: 6 },
  "59144:0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f": { symbol: "WETH", decimals: 18 },
};

/**
 * Look up token metadata by chain ID and address.
 */
export function lookupToken(chainId: number, address: string): TokenMetadata | null {
  const key = `${chainId}:${address.toLowerCase()}`;
  return TOKENS[key] ?? null;
}
