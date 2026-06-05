import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { send, stop } from "../state/actions.ts";
import { useStore } from "../state/store.ts";
import { Icon } from "./icon.tsx";

type Menu = { start: number; query: string; index: number };

export const Composer = () => {
  const channelId = useStore((s) => s.activeChannelId);
  const members = useStore((s) => (channelId != null ? s.membersByChannel[channelId] : undefined)) ?? [];
  const typing = useStore((s) => (channelId != null ? s.typingByChannel[channelId] : undefined)) ?? [];
  const channel = useStore((s) => s.channels.find((c) => c.id === channelId));
  const [value, setValue] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the draft when switching channels
  useEffect(() => {
    setValue("");
    setMenu(null);
  }, [channelId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const candidates = menu ? members.filter((m) => m.handle.startsWith(menu.query.toLowerCase())).slice(0, 6) : [];

  const sync = (text: string, caret: number) => {
    setValue(text);
    const before = text.slice(0, caret);
    const m = before.match(/@([a-z0-9]*)$/i);
    setMenu(m ? { start: caret - m[0].length, query: m[1], index: 0 } : null);
  };

  const insertMention = (handle: string) => {
    if (!menu) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, menu.start)}@${handle} ${value.slice(caret)}`;
    setValue(next);
    setMenu(null);
    const pos = menu.start + handle.length + 2;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (!value.trim()) return;
    setValue("");
    setMenu(null);
    void send(value);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menu && candidates.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index + 1) % candidates.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMenu({ ...menu, index: (menu.index - 1 + candidates.length) % candidates.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(candidates[menu.index].handle);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const busy = typing.length > 0;
  const target = channel ? (channel.kind === "dm" ? channel.name : `#${channel.slug}`) : "";

  return (
    <div className="composer">
      {menu && candidates.length > 0 && (
        <div className="mentionmenu">
          {candidates.map((m, i) => (
            <button
              type="button"
              key={m.id}
              className={`mentionopt${i === menu.index ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(m.handle);
              }}
            >
              <span className="mentionemoji" style={{ background: m.color }}>
                {m.avatar}
              </span>
              <span className="mentionname">{m.name}</span>
              <span className="mentionhandle">@{m.handle}</span>
            </button>
          ))}
        </div>
      )}
      <div className="composerbox">
        <textarea
          ref={ref}
          className="composerinput"
          rows={1}
          value={value}
          placeholder={`Message ${target}`}
          onChange={(e) => sync(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={onKey}
        />
        {busy ? (
          <button
            type="button"
            className="iconbtn stop"
            title="Stop"
            onClick={() => channelId != null && void stop(channelId)}
          >
            <Icon name="stop" size={16} />
          </button>
        ) : (
          <button type="button" className="iconbtn send" title="Send" disabled={!value.trim()} onClick={submit}>
            <Icon name="send" size={16} />
          </button>
        )}
      </div>
      <div className="composerhint">
        {busy ? "An agent is responding…" : "Enter to send · Shift+Enter for newline · @ to mention"}
      </div>
    </div>
  );
};
