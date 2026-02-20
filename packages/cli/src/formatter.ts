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
    ? colors.green("✓")
    : colors.yellow("⚠");
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

/**
 * Get the terminal width, with fallback to reasonable default
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Get consistent content width for all boxes and sections
 * Uses most of terminal width on wide screens, with reasonable limits
 */
export function getContentWidth(): number {
  const terminalWidth = getTerminalWidth();

  // Use most of terminal width, but cap at reasonable limits
  if (terminalWidth >= 140) {
    return Math.min(terminalWidth - 8, 160); // Wide terminal: use almost full width
  } else if (terminalWidth >= 100) {
    return terminalWidth - 8; // Medium-wide: use most of width
  } else if (terminalWidth >= 80) {
    return 72; // Standard terminal: comfortable width
  } else {
    return Math.max(40, terminalWidth - 8); // Narrow: leave minimal margin
  }
}

/**
 * Truncate a string in the middle with ellipsis if it exceeds maxLength
 */
export function truncateMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength < 10) return text.slice(0, maxLength);

  const ellipsis = "...";
  const charsToShow = maxLength - ellipsis.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return text.slice(0, frontChars) + ellipsis + text.slice(-backChars);
}

/**
 * Wrap text to fit within a maximum width, preserving words where possible
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (text.length <= maxWidth) return [text];

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxWidth) {
      // Word is too long, must break it
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = "";
      }
      // Split long word into chunks
      for (let i = 0; i < word.length; i += maxWidth) {
        lines.push(word.slice(i, i + maxWidth));
      }
    } else if ((currentLine + " " + word).trim().length <= maxWidth) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

export function box(content: string, title?: string): string {
  // Use consistent width for all boxes
  const contentWidth = getContentWidth();
  const width = contentWidth + 4; // Add padding for borders

  const lines = content.split("\n");

  let output = colors.gray("┌" + "─".repeat(width - 2) + "┐") + "\n";

  if (title) {
    const titleStripped = stripAnsi(title);
    const padding = width - titleStripped.length - 4;
    output += colors.gray("│ ") + colors.bold(title) + " ".repeat(Math.max(0, padding)) + colors.gray(" │") + "\n";
    output += colors.gray("├" + "─".repeat(width - 2) + "┤") + "\n";
  }

  for (const line of lines) {
    const stripped = stripAnsi(line);
    const padding = width - stripped.length - 4;
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
  const contentWidth = getContentWidth();
  const maxValueWidth = contentWidth - keyWidth - 3; // Leave room for key, padding, and space

  return rows.map(([key, value]) => {
    const padding = " ".repeat(Math.max(0, keyWidth - stripAnsi(key).length));
    const valueStripped = stripAnsi(value);

    // If value fits on one line, return it as-is
    if (valueStripped.length <= maxValueWidth) {
      return `${label(key)}${padding} ${value}`;
    }

    // Value is too long - need to wrap it
    const firstLine = `${label(key)}${padding}`;
    const indent = " ".repeat(keyWidth + 1);
    const availableWidth = contentWidth - keyWidth - 3; // Width available for wrapped value

    // Check if value has ANSI codes (colors)
    const hasAnsi = value.includes("\x1b[");

    // Split value into chunks that fit within availableWidth
    const lines: string[] = [];
    let remaining = valueStripped;
    let currentPos = 0;

    while (remaining.length > 0) {
      if (remaining.length <= availableWidth) {
        // Last chunk - extract the corresponding part from original value with ANSI codes
        const chunk = hasAnsi
          ? extractAnsiChunk(value, currentPos, remaining.length)
          : remaining;
        lines.push(indent + chunk);
        break;
      }

      // Take a chunk
      const chunkText = remaining.slice(0, availableWidth);
      const chunk = hasAnsi
        ? extractAnsiChunk(value, currentPos, availableWidth)
        : chunkText;
      lines.push(indent + chunk);

      remaining = remaining.slice(availableWidth);
      currentPos += availableWidth;
    }

    return `${firstLine}\n${lines.join("\n")}`;
  }).join("\n");
}

/**
 * Extract a chunk of text with ANSI codes preserved
 */
function extractAnsiChunk(text: string, start: number, length: number): string {
  // For simplicity, we'll strip ANSI codes, extract the chunk, then re-apply color
  const stripped = stripAnsi(text);
  const chunk = stripped.slice(start, start + length);

  // Try to detect what color the original text had
  const cyanMatch = text.match(/\x1b\[36m/);
  const greenMatch = text.match(/\x1b\[32m/);
  const yellowMatch = text.match(/\x1b\[33m/);
  const orangeMatch = text.match(/\x1b\[38;5;214m/);

  // Re-apply the detected color
  if (orangeMatch) {
    return `\x1b[38;5;214m${chunk}\x1b[0m`;
  } else if (cyanMatch) {
    return colors.cyan(chunk);
  } else if (greenMatch) {
    return colors.green(chunk);
  } else if (yellowMatch) {
    return colors.yellow(chunk);
  }

  return chunk;
}

export function divider(char: string = "─"): string {
  return colors.gray(char.repeat(60));
}

/**
 * Print a legend explaining trust indicators
 */
export function legend(): string {
  return colors.dim(
    `Legend: ${colors.green("✓")} = self-verified  ${colors.yellow("⚠")} = api-sourced`
  );
}

/**
 * Format an Ethereum address for display - always shows full address
 */
export function formatAddress(address: string): string {
  return code(address);
}

/**
 * Format an Ethereum address with potential line break for tables
 * Returns the address with a line break marker if it's too long for the available width
 */
export function formatAddressForTable(address: string, availableWidth: number): string {
  // Always show full address, but allow wrapping if needed
  if (address.length <= availableWidth) {
    return code(address);
  }

  // For addresses longer than available width, split at a sensible point
  // Ethereum addresses are 42 chars (0x + 40 hex), split in middle
  if (address.startsWith("0x") && address.length === 42) {
    const firstPart = address.slice(0, 22); // 0x + first 20 hex chars
    const secondPart = address.slice(22);   // remaining 20 hex chars
    return code(firstPart) + "\n                 " + code(secondPart);
  }

  return code(address);
}

/**
 * Format a URL for display — always shows the full URL.
 * The table renderer handles wrapping onto multiple lines.
 */
export function formatUrl(url: string): string {
  return code(url);
}
