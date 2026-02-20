import { describe, expect, it } from "bun:test";
import { trustBadge } from "./formatter";

describe("trustBadge", () => {
  it("renders consensus mode-specific trust levels with shield badge", () => {
    expect(trustBadge("consensus-verified")).toContain("🛡");
    expect(trustBadge("consensus-verified-beacon")).toContain("🛡");
    expect(trustBadge("consensus-verified-opstack")).toContain("🛡");
    expect(trustBadge("consensus-verified-linea")).toContain("🛡");
  });

  it("renders unknown trust levels as unknown badge", () => {
    expect(trustBadge("unexpected-level")).toContain("?");
  });
});
