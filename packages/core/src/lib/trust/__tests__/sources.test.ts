import { describe, expect, it } from "vitest";
import { buildGenerationSources, buildVerificationSources } from "../sources";

describe("buildVerificationSources", () => {
  it("documents generation assumptions with explicit trust levels", () => {
    const sources = buildGenerationSources();

    expect(sources.map((s) => s.id)).toEqual([
      "safe-url-input",
      "safe-api-response",
      "packaged-at-timestamp",
      "exported-json",
    ]);
    expect(sources.find((s) => s.id === "safe-api-response")?.trust).toBe(
      "api-sourced"
    );
  });

  it("describes all core verification sources when settings are enabled", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
    });

    expect(sources).toHaveLength(7);
    expect(sources.map((s) => s.id)).toEqual([
      "evidence-package",
      "hash-recompute",
      "signatures",
      "signature-scheme-coverage",
      "safe-owners-threshold",
      "decoded-calldata",
      "settings",
    ]);
    expect(sources.find((s) => s.id === "settings")?.status).toBe("enabled");
    expect(sources.find((s) => s.id === "settings")?.trust).toBe("user-provided");
    expect(sources.find((s) => s.id === "hash-recompute")?.summary).toContain("Recomputed");
    expect(sources.find((s) => s.id === "signature-scheme-coverage")?.status).toBe("disabled");
  });

  it("marks settings source disabled when no settings are available", () => {
    const sources = buildVerificationSources({
      hasSettings: false,
      hasUnsupportedSignatures: false,
      hasDecodedData: false,
    });

    const settingsSource = sources.find((s) => s.id === "settings");
    expect(settingsSource).toBeDefined();
    expect(settingsSource?.status).toBe("disabled");
    expect(settingsSource?.trust).toBe("api-sourced");
    expect(settingsSource?.summary).toContain("No local settings file");
  });

  it("uses self-verified sources for cryptographic checks", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: false,
      hasDecodedData: true,
    });

    const cryptoSource = sources.find((s) => s.id === "signatures");
    expect(cryptoSource?.trust).toBe("self-verified");
    expect(cryptoSource?.detail).toMatch(/signature/i);

    const hashSource = sources.find((s) => s.id === "hash-recompute");
    expect(hashSource?.trust).toBe("self-verified");
    expect(hashSource?.detail).toMatch(/safeTxHash/i);
  });

  it("flags unsupported signature schemes as an explicit api-sourced assumption", () => {
    const sources = buildVerificationSources({
      hasSettings: true,
      hasUnsupportedSignatures: true,
      hasDecodedData: true,
    });

    const coverage = sources.find((s) => s.id === "signature-scheme-coverage");
    expect(coverage).toBeDefined();
    expect(coverage?.trust).toBe("api-sourced");
    expect(coverage?.status).toBe("enabled");
    expect(coverage?.summary).toMatch(/unsupported signature scheme/i);
  });
});
