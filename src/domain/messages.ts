import { db, from, insertRow, iso, messages } from "../db/index.ts";
import type { MessageRow } from "../db/schema.ts";
import type { AuthorType, Message, MessageStatus } from "../shared/types.ts";

export const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  channelId: r.channel_id,
  authorType: r.author_type as AuthorType,
  authorId: r.author_id,
  content: r.content,
  image: r.image,
  status: r.status as MessageStatus,
  createdAt: iso(r.created_at),
});

// Ascending id is insertion (chronological) order.
export const listMessageRows = (channelId: number): Promise<MessageRow[]> =>
  db.all(from(messages).where((q) => q("channel_id").equals(channelId)).orderBy("id", "ASC"));

export const listMessages = async (channelId: number): Promise<Message[]> =>
  (await listMessageRows(channelId)).map(toMessage);

export type NewMessage = {
  channelId: number;
  authorType: AuthorType;
  authorId?: number | null;
  content?: string;
  image?: string;
  status?: MessageStatus;
};

export const insertMessage = (m: NewMessage): Promise<MessageRow> =>
  insertRow(messages, {
    channel_id: m.channelId,
    author_type: m.authorType,
    author_id: m.authorId ?? null,
    content: m.content ?? "",
    image: m.image ?? "",
    status: m.status ?? "complete",
  });

// patch keys are DB columns ({ content }, { status }, { image }).
export const updateMessageRow = async (id: number, patch: Record<string, unknown>): Promise<MessageRow | null> => {
  await db.execute(from(messages).where((q) => q("id").equals(id)).update(patch));
  return db.one(from(messages).where((q) => q("id").equals(id)));
};

export const removeMessage = (id: number): Promise<unknown> =>
  db.execute(from(messages).where((q) => q("id").equals(id)).del());
