import type { ITuffTransport } from "../../types";
import { defineEvent } from "../../event/builder";

export type ConversationRole = "user" | "assistant";
export type ConversationMessageStatus = "complete" | "streaming" | "failed";

export interface ConversationMessageRecord {
  id: string;
  role: ConversationRole;
  content: string;
  status: ConversationMessageStatus;
  meta?: Record<string, unknown>;
  seq: number;
  createdAt: number;
}

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationDetail extends ConversationRecord {
  messages: ConversationMessageRecord[];
}

export interface ConversationSaveRequest {
  id: string;
  title: string;
  messages: Array<{
    id: string;
    role: ConversationRole;
    content: string;
    status: ConversationMessageStatus;
    meta?: Record<string, unknown>;
    createdAt?: number;
  }>;
}

export const ConversationEvents = {
  list: defineEvent("conversation")
    .module("api")
    .event("list")
    .define<{ limit?: number } | undefined, ConversationRecord[]>(),
  get: defineEvent("conversation")
    .module("api")
    .event("get")
    .define<{ id: string }, ConversationDetail | null>(),
  save: defineEvent("conversation")
    .module("api")
    .event("save")
    .define<ConversationSaveRequest, ConversationRecord>(),
  remove: defineEvent("conversation")
    .module("api")
    .event("delete")
    .define<{ id: string }, { deleted: boolean }>(),
  rename: defineEvent("conversation")
    .module("api")
    .event("rename")
    .define<{ id: string; title: string }, { renamed: boolean }>(),
} as const;

export interface ConversationSdk {
  list: (limit?: number) => Promise<ConversationRecord[]>;
  get: (id: string) => Promise<ConversationDetail | null>;
  save: (request: ConversationSaveRequest) => Promise<ConversationRecord>;
  remove: (id: string) => Promise<{ deleted: boolean }>;
  rename: (id: string, title: string) => Promise<{ renamed: boolean }>;
}

export function createConversationSdk(
  transport: Pick<ITuffTransport, "send">,
): ConversationSdk {
  return {
    list: (limit) => transport.send(ConversationEvents.list, { limit }),
    get: (id) => transport.send(ConversationEvents.get, { id }),
    save: (request) => transport.send(ConversationEvents.save, request),
    remove: (id) => transport.send(ConversationEvents.remove, { id }),
    rename: (id, title) =>
      transport.send(ConversationEvents.rename, { id, title }),
  };
}
