import { describe, expect, it } from "bun:test";
import type { TrustLevel } from "@safelens/core";
import { trustBadge } from "./formatter";

describe("trustBadge", () => {
  it("renders all known trust levels without fallback glyph", () => {
    const levels: TrustLevel[] = [
      "consensus-verified",
      "consensus-verified-beacon",
      "consensus-verified-opstack",
      "consensus-verified-linea",
      "proof-verified",
      "self-verified",
      "rpc-sourced",
      "api-sourced",
      "user-provided",
    ];

    for (const level of levels) {
      expect(trustBadge(level)).not.toContain("?");
    }
  });
});
