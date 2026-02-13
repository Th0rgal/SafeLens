/**
 * CLI output formatting utilities with ANSI colors
 * No external dependencies - uses built-in Node.js ANSI escape codes
 */

// ── ANSI Color Codes ────────────────────────────────────────────────

const RESET = "\x1b[0m";

export const colors = {
  // Base colors
  dim: (text: string) => `\x1b[2m${text}${RESET}`,
  bold: (text: string) => `\x1b[1m${text}${RESET}`,

  // Semantic colors
  gray: (text: string) => `\x1b[90m${text}${RESET}`,
  white: (text: string) => `\x1b[37m${text}${RESET}`,

  // State colors
  green: (text: string) => `\x1b[32m${text}${RESET}`,
  yellow: (text: string) => `\x1b[33m${text}${RESET}`,
  red: (text: string) => `\x1b[31m${text}${RESET}`,
  blue: (text: string) => `\x1b[34m${text}${RESET}`,
  cyan: (text: string) => `\x1b[36m${text}${RESET}`,
  magenta: (text: string) => `\x1b[35m${text}${RESET}`,

  // Backgrounds
  bgGreen: (text: string) => `\x1b[42m\x1b[30m${text}${RESET}`,
  bgYellow: (text: string) => `\x1b[43m\x1b[30m${text}${RESET}`,
  bgRed: (text: string) => `\x1b[41m\x1b[97m${text}${RESET}`,
  bgBlue: (text: string) => `\x1b[44m\x1b[97m${text}${RESET}`,
  bgCyan: (text: string) => `\x1b[46m\x1b[30m${text}${RESET}`,
  bgMagenta: (text: string) => `\x1b[45m\x1b[97m${text}${RESET}`,
};

// ── Formatting Helpers ──────────────────────────────────────────────

export function heading(text: string): string {
  return colors.bold(colors.white(text));
}

export function section(text: string): string {
  return `\n${colors.bold(text)}`;
}

export function label(text: string): string {
  return colors.gray(text);
}

export function code(text: string): string {
  return colors.cyan(text);
}

export function badge(text: string, variant: "info" | "warning" | "critical" | "success" = "info"): string {
  const padded = ` ${text} `;
  switch (variant) {
    case "success":
      return colors.bgGreen(padded);
    case "info":
      return colors.bgBlue(padded);
    case "warning":
      return colors.bgYellow(padded);
    case "critical":
      return colors.bgRed(padded);
  }
}

export function trustBadge(level: "self-verified" | "api-sourced"): string {
  return level === "self-verified"
    ? colors.bgGreen(" ✓ self-verified ")
    : colors.bgYellow(" ⚠ api-sourced ");
}

export function severityBadge(severity: "info" | "warning" | "critical"): string {
  switch (severity) {
    case "info":
      return colors.bgBlue(" INFO ");
    case "warning":
      return colors.bgYellow(" WARN ");
    case "critical":
      return colors.bgRed(" CRIT ");
  }
}

// ── Box Drawing ─────────────────────────────────────────────────────

export function box(content: string, title?: string): string {
  const lines = content.split("\n");
  const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length), title ? stripAnsi(title).length : 0);
  const width = Math.min(maxWidth + 4, 80);

  let output = colors.gray("┌" + "─".repeat(width - 2) + "┐") + "\n";

  if (title) {
    const padding = width - stripAnsi(title).length - 4;
    output += colors.gray("│ ") + colors.bold(title) + " ".repeat(padding) + colors.gray(" │") + "\n";
    output += colors.gray("├" + "─".repeat(width - 2) + "┤") + "\n";
  }

  for (const line of lines) {
    const padding = width - stripAnsi(line).length - 4;
    output += colors.gray("│ ") + line + " ".repeat(Math.max(0, padding)) + colors.gray(" │") + "\n";
  }

  output += colors.gray("└" + "─".repeat(width - 2) + "┘");

  return output;
}

export function indent(text: string, spaces: number = 2): string {
  const prefix = " ".repeat(spaces);
  return text.split("\n").map(line => prefix + line).join("\n");
}

export function bullet(text: string): string {
  return `${colors.gray("•")} ${text}`;
}

// ── Utilities ───────────────────────────────────────────────────────

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function table(rows: Array<[string, string]>, keyWidth: number = 20): string {
  return rows.map(([key, value]) => {
    const padding = " ".repeat(Math.max(0, keyWidth - stripAnsi(key).length));
    return `${label(key)}${padding} ${value}`;
  }).join("\n");
}

export function divider(char: string = "─"): string {
  return colors.gray(char.repeat(60));
}
