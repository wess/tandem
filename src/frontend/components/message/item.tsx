import type { ReactNode } from "react";
import type { Agent, Message } from "../../../shared/types.ts";
import { Avatar, HumanAvatar } from "../agent/avatar.tsx";

const renderInline = (text: string): ReactNode[] => {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(/@([a-z0-9]+)/gi)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    out.push(
      <span className="mention" key={`m${key++}`}>
        @{m[1]}
      </span>,
    );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const renderBody = (text: string): ReactNode[] =>
  text.split("```").map((part, i) =>
    i % 2 === 1 ? (
      <pre className="codeblock" key={`c${i}`}>
        <code>{part.replace(/^[a-z]*\n/i, "")}</code>
      </pre>
    ) : (
      <span key={`t${i}`}>{renderInline(part)}</span>
    ),
  );

const time = (iso: string): string => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const MessageItem = ({
  message,
  author,
  head,
}: {
  message: Message;
  author: Agent | null;
  head: boolean;
}) => {
  if (message.authorType === "system") {
    return (
      <div className="sysmsg">
        <span>{message.content}</span>
      </div>
    );
  }

  const human = message.authorType === "human";
  const name = human ? "You" : (author?.name ?? "Agent");
  const streaming = message.status === "streaming";

  return (
    <div className={`msg${head ? " head" : ""}${message.status === "error" ? " errored" : ""}`}>
      <div className="msggutter">
        {head ? (
          human ? (
            <HumanAvatar />
          ) : author ? (
            <Avatar agent={author} />
          ) : (
            <Avatar agent={{ avatar: "🤖", color: "#6366f1", name }} />
          )
        ) : (
          <span className="hovertime">{time(message.createdAt)}</span>
        )}
      </div>
      <div className="msgmain">
        {head && (
          <div className="msghead">
            <span className="msgname" style={author && !human ? { color: author.color } : undefined}>
              {name}
            </span>
            <span className="msgtime">{time(message.createdAt)}</span>
          </div>
        )}
        {message.image ? (
          <img className="msgimage" src={message.image} alt="generated" />
        ) : (
          <div className="msgbody">
            {message.content ? renderBody(message.content) : streaming ? <span className="thinking">thinking</span> : null}
            {streaming && message.content && <span className="caret" />}
          </div>
        )}
      </div>
    </div>
  );
};
