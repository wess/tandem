import { useEffect, useRef } from "react";
import type { Agent } from "../../../shared/types.ts";
import { useStore } from "../../state/store.ts";
import { MessageItem } from "./item.tsx";

const FIVE_MIN = 5 * 60 * 1000;

export const MessageList = ({ channelId }: { channelId: number }) => {
  const messages = useStore((s) => s.messagesByChannel[channelId]);
  const agents = useStore((s) => s.agents);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastChannel = useRef<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const switched = lastChannel.current !== channelId;
    lastChannel.current = channelId;
    // Jump to the bottom on channel switch; while streaming, only follow if the
    // user is already near the bottom so scrolling up to read isn't fought.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (switched || nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages, channelId]);

  if (!messages) return <div className="thread" ref={scrollRef} />;

  if (messages.length === 0) {
    return (
      <div className="thread" ref={scrollRef}>
        <div className="threadempty">
          <p>This is the beginning of the conversation.</p>
          <p className="dim">Say hello and @mention an agent to get a reply.</p>
        </div>
      </div>
    );
  }

  const byId = new Map(agents.map((a) => [a.id, a]));

  return (
    <div className="thread" ref={scrollRef}>
      <div className="threadinner">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const author: Agent | null =
            m.authorType === "agent" && m.authorId != null ? (byId.get(m.authorId) ?? null) : null;
          const head =
            !prev ||
            m.authorType === "system" ||
            prev.authorType === "system" ||
            prev.authorType !== m.authorType ||
            prev.authorId !== m.authorId ||
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > FIVE_MIN;
          return <MessageItem key={m.id} message={m} author={author} head={head} />;
        })}
      </div>
    </div>
  );
};
