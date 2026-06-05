// @mention parsing, shared by the composer (autocomplete) and the runtime
// (trigger resolution). Handles are lowercase alphanumerics.

export const MENTION_RE = /@([a-z0-9]+)/gi;

export const parseMentions = (text: string): string[] => {
  const out = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) out.add(match[1].toLowerCase());
  return [...out];
};

export const slugifyHandle = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
