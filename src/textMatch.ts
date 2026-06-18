export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function tokenMatches(term: string, tokens: string[]): boolean {
  return tokens.some((t) => t === term || t.startsWith(term));
}
