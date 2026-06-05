import { type ReactNode, useEffect, useRef, useState } from "react";
import type { SearchHit } from "../../../shared/types.ts";
import { closeModal, runSearch, selectChannel } from "../../state/actions.ts";
import { Icon } from "../icon.tsx";

// FTS snippets wrap matches in U+0002…U+0003 (control sentinels that can't occur
// in real text) — render them as <mark> safely (React escapes the text nodes).
const renderSnippet = (s: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of s.matchAll(/\u0002(.*?)\u0003/g)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(s.slice(last, idx));
    out.push(<mark key={`m${key++}`}>{m[1]}</mark>);
    last = idx + m[0].length;
  }
  out.push(s.slice(last));
  return out;
};

export const SearchPalette = () => {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      void runSearch(q).then((r) => {
        if (alive) setHits(r);
      });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const open = (h: SearchHit) => {
    if (h.channelId != null) void selectChannel(h.channelId);
    closeModal();
  };

  return (
    <div className="overlay" onMouseDown={closeModal}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palettesearch">
          <Icon name="search" size={18} />
          <input
            ref={ref}
            value={q}
            placeholder="Search messages and memory…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && closeModal()}
          />
        </div>
        <div className="palettelist">
          {hits.map((h) => (
            <button type="button" key={`${h.kind}${h.id}`} className="palettehit" onClick={() => open(h)}>
              <span className={`hitkind ${h.kind}`}>
                <Icon name={h.kind === "memory" ? "memory" : "message"} size={12} />
              </span>
              <span className="hitmain">
                <span className="hitsnippet">{renderSnippet(h.snippet)}</span>
                <span className="hitmeta">
                  {h.authorName} · {h.channelName}
                </span>
              </span>
            </button>
          ))}
          {q.trim() && hits.length === 0 && <div className="memempty">No matches.</div>}
          {!q.trim() && <div className="memempty">Search across every channel and your collective memory.</div>}
        </div>
      </div>
    </div>
  );
};
