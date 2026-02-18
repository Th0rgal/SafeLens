import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
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

function readCapabilityFiles(dir: string): { content: string }[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ content: readFileSync(path.join(dir, f), "utf-8") }));
}

describe("desktop airgap guarantees", () => {
  const appDir = path.resolve(import.meta.dir, "..");
  const tauriConfigPath = path.join(appDir, "src-tauri", "tauri.conf.json");
  const cargoTomlPath = path.join(appDir, "src-tauri", "Cargo.toml");
  const capabilitiesDir = path.join(appDir, "src-tauri", "capabilities");

  it("has a capabilities directory with at least one policy file", () => {
    expect(existsSync(capabilitiesDir)).toBe(true);
    const caps = readCapabilityFiles(capabilitiesDir);
    expect(caps.length).toBeGreaterThanOrEqual(1);
  });

  it("uses a production CSP that disallows network connections", () => {
    const config = readJson(tauriConfigPath);
    const csp: string = config.app.security.csp;

    // Tauri v2 requires ipc: and http://ipc.localhost for IPC communication
    const cspWithoutIpc = csp
      .replace(/ipc:\s*/g, "")
      .replace(/http:\/\/ipc\.localhost\s*/g, "");

    expect(cspWithoutIpc).not.toContain("http://");
    expect(cspWithoutIpc).not.toContain("https://");
    expect(csp).not.toContain("ws://");
    expect(csp).not.toContain("wss://");
  });

  it("does not grant shell or HTTP capabilities", () => {
    const cargoToml = readFileSync(cargoTomlPath, "utf-8");

    expect(cargoToml).not.toContain("shell-open");
    expect(cargoToml).not.toContain("tauri-plugin-http");
    expect(cargoToml).not.toContain("tauri-plugin-shell");

    // Check capabilities files for shell/HTTP permissions
    for (const { content } of readCapabilityFiles(capabilitiesDir)) {
      expect(content).not.toContain("shell:");
      expect(content).not.toContain("http:");
    }
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

  it("only grants scoped filesystem access in capabilities", () => {
    const cargoToml = readFileSync(cargoTomlPath, "utf-8");

    // No remove/rename capabilities should be granted
    expect(cargoToml).not.toContain("fs-remove");

    for (const { content } of readCapabilityFiles(capabilitiesDir)) {
      expect(content).not.toContain("fs:allow-remove");
      expect(content).not.toContain("fs:allow-rename");
    }
  });
});
