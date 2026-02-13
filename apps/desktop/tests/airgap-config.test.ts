import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(fullPath));
      continue;
    }
    if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("desktop airgap guarantees", () => {
  const appDir = path.resolve(import.meta.dir, "..");
  const tauriConfigPath = path.join(appDir, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = path.join(appDir, "src-tauri", "Cargo.toml");

  it("uses a production CSP that disallows network connections", () => {
    const config = readJson(tauriConfigPath);
    const csp: string = config.tauri.security.csp;

    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain("http://");
    expect(csp).not.toContain("https://");
    expect(csp).not.toContain("ws://");
    expect(csp).not.toContain("wss://");
  });

  it("does not grant shell-open capability in tauri allowlist or rust features", () => {
    const config = readJson(tauriConfigPath);
    const cargoToml = readFileSync(cargoTomlPath, "utf-8");

    expect(config.tauri.allowlist.shell).toBeUndefined();
    expect(cargoToml).not.toContain("shell-open");
  });

  it("does not call network APIs in desktop frontend source code", () => {
    const sourceFiles = listSourceFiles(path.join(appDir, "src"));
    const forbiddenPatterns = [
      "@tauri-apps/api/http",
      "@tauri-apps/plugin-http",
      "fetch(",
      "XMLHttpRequest",
      "WebSocket(",
      "http://",
      "https://",
    ];

    const violations: string[] = [];
    for (const filePath of sourceFiles) {
      const source = readFileSync(filePath, "utf-8");
      for (const pattern of forbiddenPatterns) {
        if (source.includes(pattern)) {
          violations.push(`${path.relative(appDir, filePath)} -> ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not allow destructive filesystem operations outside app data", () => {
    const config = readJson(tauriConfigPath);
    const fsAllowlist = config.tauri.allowlist.fs;

    expect(fsAllowlist.createDir).toBe(false);
    expect(fsAllowlist.removeFile).toBe(false);
  });
});
