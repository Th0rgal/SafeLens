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
  const processedLines: string[] = [];

  // Process each line to handle wrapping and truncation
  for (const line of lines) {
    const stripped = stripAnsi(line);
    const maxLineWidth = contentWidth - 2; // Account for internal padding

    if (stripped.length <= maxLineWidth) {
      processedLines.push(line);
    } else {
      // Truncate long lines while preserving ANSI codes
      const truncated = truncateMiddle(stripped, maxLineWidth);
      processedLines.push(truncated);
    }
  }

  let output = colors.gray("┌" + "─".repeat(width - 2) + "┐") + "\n";

  if (title) {
    const titleStripped = stripAnsi(title);
    if (titleStripped.length > width - 4) {
      const truncated = truncateMiddle(titleStripped, width - 4);
      const padding = width - truncated.length - 4;
      output += colors.gray("│ ") + colors.bold(truncated) + " ".repeat(Math.max(0, padding)) + colors.gray(" │") + "\n";
    } else {
      const padding = width - titleStripped.length - 4;
      output += colors.gray("│ ") + colors.bold(title) + " ".repeat(padding) + colors.gray(" │") + "\n";
    }
    output += colors.gray("├" + "─".repeat(width - 2) + "┤") + "\n";
  }

  for (const line of processedLines) {
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
  const terminalWidth = getTerminalWidth();
  const maxValueWidth = terminalWidth - keyWidth - 10; // Leave room for padding and labels

  return rows.map(([key, value]) => {
    const padding = " ".repeat(Math.max(0, keyWidth - stripAnsi(key).length));
    const valueStripped = stripAnsi(value);

    // Truncate value if it's too long
    let displayValue = value;
    if (valueStripped.length > maxValueWidth && maxValueWidth > 20) {
      const truncated = truncateMiddle(valueStripped, maxValueWidth);
      // Try to preserve color codes from original value
      if (value.includes("\x1b[")) {
        // If value has colors, apply cyan to truncated text
        displayValue = code(truncated);
      } else {
        displayValue = truncated;
      }
    }

    return `${label(key)}${padding} ${displayValue}`;
  }).join("\n");
}

export function divider(char: string = "─"): string {
  return colors.gray(char.repeat(60));
}

/**
 * Format an Ethereum address for display - truncate in middle for narrow terminals
 */
export function formatAddress(address: string): string {
  const terminalWidth = getTerminalWidth();

  // If we have plenty of space, show full address
  if (terminalWidth >= 100) {
    return code(address);
  }

  // For medium terminals, show truncated address
  if (terminalWidth >= 80) {
    if (address.length > 42) {
      return code(address);
    }
    return code(truncateMiddle(address, 42));
  }

  // For narrow terminals, show short form (0x1234...5678)
  if (address.length > 20) {
    return code(address.slice(0, 6) + "..." + address.slice(-4));
  }

  return code(address);
}

/**
 * Format a URL for display - truncate intelligently
 */
export function formatUrl(url: string): string {
  const terminalWidth = getTerminalWidth();
  const maxLength = Math.max(40, terminalWidth - 30);

  if (url.length <= maxLength) {
    return code(url);
  }

  try {
    // Try to keep the domain and end of URL visible
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const path = urlObj.pathname + urlObj.search;

    if (domain.length + 20 < maxLength) {
      const remaining = maxLength - domain.length - 10;
      const pathTruncated = "..." + path.slice(-remaining);
      return code(urlObj.protocol + "//" + domain + pathTruncated);
    }
  } catch {
    // URL parsing failed, fall through to simple truncation
  }

  return code(truncateMiddle(url, maxLength));
}
