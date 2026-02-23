import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSafeNonce } from "../api";

describe("fetchSafeNonce", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts nonce as a decimal string from Safe info endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ nonce: "1" }),
    } as Response);

    await expect(
      fetchSafeNonce(100, "0xba260842B007FaB4119C9747D709119DE4257276")
    ).resolves.toBe(1);
  });

  it("accepts nonce as a number from Safe info endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ nonce: 2 }),
    } as Response);

    await expect(
      fetchSafeNonce(100, "0xba260842B007FaB4119C9747D709119DE4257276")
    ).resolves.toBe(2);
  });

  it("rejects null nonce instead of coercing to zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ nonce: null }),
    } as Response);

    await expect(
      fetchSafeNonce(100, "0xba260842B007FaB4119C9747D709119DE4257276")
    ).rejects.toThrow();
  });

  it("rejects empty-string nonce instead of coercing to zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ nonce: "" }),
    } as Response);

    await expect(
      fetchSafeNonce(100, "0xba260842B007FaB4119C9747D709119DE4257276")
    ).rejects.toThrow();
  });
});
