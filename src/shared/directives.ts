// Agents act on themselves and shared state by emitting line-oriented
// directives in their replies. Parsing happens host-side after streaming, so
// the mechanism is identical across Anthropic / OpenAI / Ollama — no native
// tool-calling, preserving provider parity.
//
//   RENAME: <name>              change own display name
//   AVATAR: <emoji>             set own avatar
//   MEMORY: <title> :: <fact>   save to this channel's memory
//   SHARED: <title> :: <fact>   save to the workspace-wide memory
//   SPAWN:  <handle> :: <role>  (head agents only) create a subagent in-channel

export type Directive =
  | { kind: "rename"; value: string }
  | { kind: "avatar"; value: string }
  | { kind: "memory"; scope: "channel" | "global"; title: string; body: string }
  | { kind: "spawn"; handle: string; role: string }
  | { kind: "skill"; name: string; steps: string };

export type ParsedReply = { clean: string; directives: Directive[] };

const LINE = /^(RENAME|AVATAR|MEMORY|SHARED|SPAWN|SKILL):\s*(.+)$/i;

const splitPair = (rest: string): [string, string] => {
  const idx = rest.indexOf("::");
  if (idx === -1) return [rest.trim(), ""];
  return [rest.slice(0, idx).trim(), rest.slice(idx + 2).trim()];
};

export const parseDirectives = (text: string): ParsedReply => {
  const directives: Directive[] = [];
  const kept: string[] = [];

  for (const line of text.split("\n")) {
    const m = line.trim().match(LINE);
    if (!m) {
      kept.push(line);
      continue;
    }
    const kw = m[1].toUpperCase();
    const rest = m[2].trim();
    if (kw === "RENAME") {
      directives.push({ kind: "rename", value: rest.slice(0, 40) });
    } else if (kw === "AVATAR") {
      directives.push({ kind: "avatar", value: [...rest].slice(0, 4).join("") });
    } else if (kw === "MEMORY" || kw === "SHARED") {
      const [title, body] = splitPair(rest);
      directives.push({ kind: "memory", scope: kw === "SHARED" ? "global" : "channel", title: title.slice(0, 120), body });
    } else if (kw === "SPAWN") {
      const [handle, role] = splitPair(rest);
      directives.push({ kind: "spawn", handle, role });
    } else if (kw === "SKILL") {
      const [name, steps] = splitPair(rest);
      directives.push({ kind: "skill", name: name.slice(0, 60), steps });
    }
  }

  return { clean: kept.join("\n").trim(), directives };
};
