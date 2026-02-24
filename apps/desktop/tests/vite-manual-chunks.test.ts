import { describe, expect, it } from "bun:test";
import { manualDesktopChunks } from "../vite.manual-chunks";

describe("manualDesktopChunks", () => {
  it("groups trust and verify domains together", () => {
    const trustPath = "/workspaces/repo/packages/core/src/lib/trust/risk.ts";
    const verifyPath = "/workspaces/repo/packages/core/src/lib/verify/index.ts";

    expect(manualDesktopChunks(trustPath)).toBe("core-trust-verify");
    expect(manualDesktopChunks(verifyPath)).toBe("core-trust-verify");
  });

  it("splits other core domains by domain name", () => {
    const simulationPath = "/workspaces/repo/packages/core/src/lib/simulation/fetcher.ts";

    expect(manualDesktopChunks(simulationPath)).toBe("core-simulation");
  });

  it("strips file extensions from top-level core module chunk names", () => {
    const typesPath = "/workspaces/repo/packages/core/src/lib/types.ts";

    expect(manualDesktopChunks(typesPath)).toBe("core-types");
  });

  it("normalizes windows paths before chunk mapping", () => {
    const windowsPath =
      "C:\\repo\\packages\\core\\src\\lib\\simulation\\witness-verifier.ts";

    expect(manualDesktopChunks(windowsPath)).toBe("core-simulation");
  });

  it("maps nested pnpm node_modules packages to vendor chunks", () => {
    const reactPath =
      "/repo/node_modules/.pnpm/react@18.3.0/node_modules/react/index.js";
    const tauriPath =
      "/repo/node_modules/.pnpm/@tauri-apps+api@2.8.0/node_modules/@tauri-apps/api/dist/index.js";
    const viemPath =
      "/repo/node_modules/.pnpm/viem@2.38.5/node_modules/viem/index.js";

    expect(manualDesktopChunks(reactPath)).toBe("react-vendor");
    expect(manualDesktopChunks(tauriPath)).toBe("tauri-vendor");
    expect(manualDesktopChunks(viemPath)).toBe("web3-vendor");
  });

  it("maps bun's node_modules layout to web3 vendor chunk", () => {
    const noblePath =
      "/repo/node_modules/.bun/@noble+curves@1.9.7/node_modules/@noble/curves/esm/index.js";

    expect(manualDesktopChunks(noblePath)).toBe("web3-vendor");
  });

  it("ignores query params when deriving core chunk names", () => {
    const queryPath = "/repo/packages/core/src/lib/networks.ts?v=123";

    expect(manualDesktopChunks(queryPath)).toBe("core-networks");
  });

  it("returns undefined for ungrouped packages", () => {
    const lucidePath =
      "/repo/node_modules/.pnpm/lucide-react@0.454.0/node_modules/lucide-react/dist/lucide-react.js";

    expect(manualDesktopChunks(lucidePath)).toBeUndefined();
  });
});
