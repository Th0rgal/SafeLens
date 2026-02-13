const FLAGS_WITH_VALUES = new Set(["--out", "--json", "--file", "--settings", "--path", "--format"]);

export function getFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function getPositionals(args: string[]): string[] {
  const positionals: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (FLAGS_WITH_VALUES.has(arg)) {
        i += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

export function isFlagWithValue(flag: string): boolean {
  return FLAGS_WITH_VALUES.has(flag);
}
