import { describe, expect, it } from "bun:test";
import { buildEvidenceFilename } from "./download";

describe("buildEvidenceFilename", () => {
  it("creates deterministic file names from safe address prefix and nonce", () => {
    const name = buildEvidenceFilename({
      safeAddress: "0x9fC3dc011b461664c835F2527fffb1169b3C213e",
      nonce: 42,
    });

    expect(name).toBe("evidence-0x9fC3dc01-42.json");
  });
});
