const SENSITIVE_KEY_MARKERS = [
  "api-key",
  "apikey",
  "key",
  "token",
  "auth",
  "access_token",
] as const;
const SENSITIVE_QUERY_KEYS: ReadonlySet<string> = new Set(SENSITIVE_KEY_MARKERS);
const SENSITIVE_PATH_MARKERS: ReadonlySet<string> = new Set(SENSITIVE_KEY_MARKERS);
const INVALID_URL_REDACTED_PLACEHOLDER = "[invalid URL redacted]";

function redactPathSecrets(parsed: URL): void {
  const segments = parsed.pathname.split("/");
  if (segments.length <= 1) {
    return;
  }

  const host = parsed.hostname.toLowerCase();
  const markForRedaction = new Set<number>();

  for (let idx = 1; idx < segments.length - 1; idx += 1) {
    const segment = segments[idx].toLowerCase();
    if (SENSITIVE_PATH_MARKERS.has(segment)) {
      markForRedaction.add(idx + 1);
    }
  }

  if (host.endsWith("infura.io")) {
    for (let idx = 1; idx < segments.length - 1; idx += 1) {
      if (segments[idx].toLowerCase() === "v3") {
        markForRedaction.add(idx + 1);
      }
    }
  }

  if (host.includes("alchemy.com") || host.includes("alchemyapi.io")) {
    for (let idx = 1; idx < segments.length - 1; idx += 1) {
      if (segments[idx].toLowerCase() === "v2") {
        markForRedaction.add(idx + 1);
      }
    }
  }

  if (markForRedaction.size === 0) {
    return;
  }

  for (const idx of markForRedaction) {
    if (segments[idx]) {
      segments[idx] = "***";
    }
  }
  parsed.pathname = segments.join("/");
}

export function redactRpcUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    const allowedProtocol = parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "ws:" ||
      parsed.protocol === "wss:";
    if (!allowedProtocol) {
      return value.includes("@") ? INVALID_URL_REDACTED_PLACEHOLDER : value;
    }

    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "***" : "";
      parsed.password = parsed.password ? "***" : "";
    }

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, "***");
      }
    }

    redactPathSecrets(parsed);
    return parsed.toString();
  } catch {
    const credentialLikeInvalidUrl = /^[^/@:\s?#]+:[^/@\s?#]+@/.test(value) || value.includes("@");
    return credentialLikeInvalidUrl ? INVALID_URL_REDACTED_PLACEHOLDER : value;
  }
}
