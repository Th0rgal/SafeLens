const CORE_PREFIX = "/packages/core/src/lib/";
const CORE_FILE_EXTENSION = /\.[cm]?[jt]sx?$/;

function normalizeCoreDomain(segment: string): string {
  const withoutExtension = segment.replace(CORE_FILE_EXTENSION, "");
  const sanitized = withoutExtension.replace(/[^a-zA-Z0-9-]/g, "-");
  return sanitized || "shared";
}

function resolvePackageName(normalizedId: string): string | undefined {
  if (!normalizedId.includes("node_modules")) return;

  const modulePath = normalizedId.split("node_modules/").pop();
  if (!modulePath) return;

  const trimmedPath =
    modulePath.startsWith(".pnpm/") || modulePath.startsWith(".bun/")
      ? modulePath.split("/node_modules/")[1] ?? modulePath
      : modulePath;

  const segments = trimmedPath.split("/");
  if (!segments[0]) return;
  if (!segments[0].startsWith("@")) return segments[0];
  if (!segments[1]) return segments[0];
  return `${segments[0]}/${segments[1]}`;
}

export function manualDesktopChunks(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes(CORE_PREFIX)) {
    const relative = normalizedId.split(CORE_PREFIX)[1];
    const cleanRelative = relative?.split("?")[0];
    const rawDomain = cleanRelative?.split("/")[0];
    const domain = rawDomain ? normalizeCoreDomain(rawDomain) : undefined;
    if (!domain) return;

    if (domain === "verify" || domain === "trust") {
      return "core-trust-verify";
    }

    return `core-${domain}`;
  }

  const packageName = resolvePackageName(normalizedId);
  if (!packageName) return;

  if (packageName === "react" || packageName === "react-dom") {
    return "react-vendor";
  }

  if (packageName.startsWith("@tauri-apps")) {
    return "tauri-vendor";
  }

  if (
    packageName === "viem" ||
    packageName === "abitype" ||
    packageName.startsWith("@noble/") ||
    packageName.startsWith("@scure/")
  ) {
    return "web3-vendor";
  }
}
