import { describe, expect, it } from "bun:test";
import { getFlag, getPositionals, hasFlag } from "./args";

describe("CLI args parsing", () => {
  it("returns positionals while skipping flag values", () => {
    const args = [
      "--out",
      "evidence.json",
      "https://app.safe.global/transactions/tx?safe=eth:0xabc&id=multisig_123",
      "--pretty",
    ];

    expect(getPositionals(args)).toEqual([
      "https://app.safe.global/transactions/tx?safe=eth:0xabc&id=multisig_123",
    ]);
  });

  it("handles multiple flags and preserves additional positionals", () => {
    const args = [
      "--file",
      "evidence.json",
      "--format",
      "json",
      "extra",
      "--no-settings",
    ];

    expect(getPositionals(args)).toEqual(["extra"]);
    expect(getFlag(args, "--file")).toBe("evidence.json");
    expect(getFlag(args, "--format")).toBe("json");
    expect(hasFlag(args, "--no-settings")).toBe(true);
  });

  it("ignores unknown flags but keeps their values as positionals", () => {
    const args = ["--unknown", "value", "positional"]; // unknown flags are not in the skip list

    expect(getPositionals(args)).toEqual(["value", "positional"]);
  });
});
