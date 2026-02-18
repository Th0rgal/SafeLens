import type { Deployment, ERC7730Descriptor } from "./types";

export interface BuiltinTokenMetadata {
  symbol: string;
  decimals: number;
}

export interface BuiltinTokenDeployment {
  chainId: number;
  address: string;
  symbol: string;
  decimals: number;
}

const TOKEN_DECIMALS_BY_SYMBOL: Record<string, number> = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  WBTC: 8,
  EURC: 6,
  RLUSD: 18,
  sDAI: 18,
};

const TOKEN_OVERRIDES: BuiltinTokenDeployment[] = [
  {
    // Bridged USDC on Gnosis
    chainId: 100,
    address: "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83",
    symbol: "USDC",
    decimals: 6,
  },
];

function getDeployments(descriptor: ERC7730Descriptor): Deployment[] {
  return [
    ...(descriptor.context.contract?.deployments ?? []),
    ...(descriptor.context.eip712?.deployments ?? []),
  ];
}

function isAddressLike(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function mergeToken(
  tokens: Map<string, BuiltinTokenMetadata>,
  chainId: number,
  address: string,
  symbol: string,
  decimals: number
) {
  const key = `${chainId}:${address.toLowerCase()}`;
  tokens.set(key, { symbol, decimals });
}

export function buildBuiltinTokenMap(descriptors: ERC7730Descriptor[]): Map<string, BuiltinTokenMetadata> {
  const tokens = new Map<string, BuiltinTokenMetadata>();

  for (const descriptor of descriptors) {
    const deployments = getDeployments(descriptor);
    const descriptorSymbol = descriptor.metadata.token?.ticker || descriptor.metadata.token?.name;
    const descriptorDecimals = descriptor.metadata.token?.decimals;

    // Token descriptors where deployment address is the token contract itself.
    if (descriptorSymbol && typeof descriptorDecimals === "number") {
      for (const deployment of deployments) {
        mergeToken(tokens, deployment.chainId, deployment.address, descriptorSymbol, descriptorDecimals);
      }
    }

    // Protocol descriptors that point to token addresses via metadata.constants.
    const constants = descriptor.metadata.constants;
    if (!constants) continue;

    for (const [key, value] of Object.entries(constants)) {
      if (!key.endsWith("Token") || !isAddressLike(value)) continue;

      const symbolKey = `${key.slice(0, -5)}Ticker`;
      const symbolValue = constants[symbolKey];
      const symbol = typeof symbolValue === "string" && symbolValue.length > 0
        ? symbolValue
        : descriptorSymbol;
      if (!symbol) continue;

      const decimals = TOKEN_DECIMALS_BY_SYMBOL[symbol]
        ?? (typeof descriptorDecimals === "number" ? descriptorDecimals : undefined);
      if (typeof decimals !== "number") continue;

      for (const deployment of deployments) {
        mergeToken(tokens, deployment.chainId, value, symbol, decimals);
      }
    }
  }

  for (const token of TOKEN_OVERRIDES) {
    mergeToken(tokens, token.chainId, token.address, token.symbol, token.decimals);
  }

  return tokens;
}
