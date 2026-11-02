import type { Ref } from 'vue'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'

import type {
  AiChainStep,
  AiToolCallPart,
} from "@talex-touch/tuffex/ai-elements";
import type {
  ChatComposerAttachment,
  ChatMessageModel,
} from "@talex-touch/tuffex/chat";

export type TxAiMotionPreset =
  | "none"
  | "fade"
  | "slide-fade"
  | "rebound"
  | "blur";
export type TxAiTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";
export type TxAiMessageRole = "user" | "assistant" | "system";
export type TxAiMessageStatus =
  | "idle"
  | "waiting"
  | "streaming"
  | "done"
  | "error"
  | "cancelled";
export type TxAiBlockType =
  | "markdown"
  | "text"
  | "code"
  | "image"
  | "file"
  | "card"
  | "tool"
  | "error";
export type TxAiToolStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export interface TxAiRevealProps {
  as?: string;
  motion?: TxAiMotionPreset;
  appear?: boolean;
  duration?: number;
  disabledMotion?: boolean;
}

export interface TxAiStreamTextProps {
  text: string;
  as?: string;
  streaming?: boolean;
  cursor?: boolean;
  motion?: TxAiMotionPreset;
  /** One word is released every this many milliseconds. */
  stagger?: number;
}

export interface TxAiThinkingProps {
  text?: string;
  variant?: "dots" | "ai" | "pure" | "ring" | "circle-dash" | "bars";
  showText?: boolean;
  size?: number;
}

export interface TxAiLoadingHintProps {
  label?: string;
  description?: string;
  status?: TxAiToolStatus;
  tone?: TxAiTone;
}

export interface TxAiAttachment {
  type: "image";
  url: string;
  name?: string;
}

export interface TxAiMessageModel {
  id: string;
  role: TxAiMessageRole;
  content?: string;
  createdAt?: number;
  avatarUrl?: string;
  status?: TxAiMessageStatus;
  attachments?: TxAiAttachment[];
  blocks?: TxAiRichBlockModel[];
  meta?: Record<string, unknown>;
}

export interface TxAiMessageProps {
  message: TxAiMessageModel;
  markdown?: boolean;
  reveal?: boolean;
}

export interface TxAiConversationProps {
  messages: TxAiMessageModel[];
  markdown?: boolean;
  autoFollow?: boolean;
  followGap?: number;
  generating?: boolean;
}

export interface TxAiComposerProps {
  modelValue?: string;
  placeholder?: string;
  disabled?: boolean;
  submitting?: boolean;
  attachments?: ChatComposerAttachment[];
  allowAttachmentWhileSubmitting?: boolean;
  minRows?: number;
  maxRows?: number;
  sendOnEnter?: boolean;
  sendOnMetaEnter?: boolean;
  allowEmptySend?: boolean;
  sendButtonText?: string;
  showAttachmentButton?: boolean;
  attachmentButtonText?: string;
}

export interface TxAiSuggestionProps {
  text: string;
  disabled?: boolean;
  active?: boolean;
}

export interface TxAiMarkdownProps {
  content: string;
  sanitize?: boolean;
  theme?: "auto" | "light" | "dark";
  streaming?: boolean;
  reveal?: boolean;
}

export interface TxAiCodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  copyable?: boolean;
}

export interface TxAiRichBlockModel {
  id?: string;
  type: TxAiBlockType;
  content?: string;
  value?: unknown;
  name?: string;
  status?: TxAiToolStatus | TxAiMessageStatus;
  meta?: Record<string, unknown>;
}

export interface TxAiRichBlockProps {
  block: TxAiRichBlockModel;
}

export interface TxAiToolCallProps {
  name: string;
  status?: TxAiToolStatus;
  description?: string;
}

export interface TxAiResultCardProps {
  title?: string;
  description?: string;
  tone?: TxAiTone;
}

export interface TxAiAgentBadgeProps {
  name: string;
  description?: string;
  avatarUrl?: string;
  tone?: TxAiTone;
}

export interface TxAiCitationProps {
  title: string;
  href?: string;
  index?: number;
  description?: string;
}

/**
 * One ordered piece of an assistant turn: a thought, a tool call, or prose, in the order the model
 * produced them. Structurally the host's `MessageSegment`, so hosts pass theirs unchanged.
 */
export type TxAiSegment =
  | { kind: "reasoning"; id: string; step: AiChainStep }
  | { kind: "tool"; id: string; part: AiToolCallPart }
  | { kind: "text"; id: string; text: string; streaming: boolean };

export interface TxAiToolChartSpec {
  type: string
  title?: string
  labels: string[]
  series: Array<{ name?: string; values: number[] }>
  xLabel?: string
  yLabel?: string
  stacked?: boolean
  showValues?: boolean
}

/** The host owns isolation policy, runtime loading and lifecycle cleanup. */
export type TxAiWidgetSandbox = (
  source: Ref<string>,
  frame: Ref<HTMLIFrameElement | null>,
) => {
  status: Readonly<Ref<'loading' | 'ready' | 'failed'>>
  failure: Readonly<Ref<
    | { reason: 'threw'; message: string }
    | { reason: 'blocked'; directive: string }
    | { reason: 'timedOut' }
    | null
  >>
  height: Readonly<Ref<number>>
  srcdoc: Readonly<Ref<string>>
}

export type TxAiSpeakState = 'idle' | 'loading' | 'speaking'

export interface TxAiTurnMetrics {
  latencyMs?: number
  ttftMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  cacheReadTokens?: number
  model?: string
  coordinator?: string
}

export interface TxAiMetricMessage { meta?: TxAiTurnMetrics }

export interface TxAiTurnFooterProps {
  content?: string
  metrics?: TxAiTurnMetrics
  resting?: boolean
  regenerable?: boolean
  speakState?: TxAiSpeakState
  branchable?: boolean
  branching?: boolean
  showMetrics?: boolean
  labels?: Record<string, string>
  motion?: TxAiMotionPreset
}

export interface TxAiErrorBlockProps {
  title: string
  detail?: string
  reportCode?: string
  reportDetail?: string
  codeLabel?: string
  tone?: 'danger' | 'warning'
  actionLabel?: string
  retryable?: boolean
  retryLabel?: string
}

export interface TxAiAssistantTurnProps {
  segments: TxAiSegment[]
  streaming?: boolean
  elementProps?: Record<string, unknown>
  toolCallProps?: Record<string, unknown>
  /** Optional predicate limiting which calls are handled by the host tool slot. */
  hasToolFace?: (part: AiToolCallPart) => boolean
  chartProps?: Record<string, unknown>
  formProps?: Record<string, unknown>
  widgetProps?: Record<string, unknown>
  widgetSandbox?: TxAiWidgetSandbox
  submittedForms?: ReadonlySet<string>
  formDrafts?: ReadonlyMap<string, Record<string, FormFieldValue>>
  showToolPayload?: boolean
  payloadLabel?: string
  waiting?: boolean
  thinkingVerb?: string
  thinkingLabel?: string
  compacting?: boolean
  compactingLabel?: string
  footer?: TxAiTurnFooterProps
  error?: TxAiErrorBlockProps
  motion?: TxAiMotionPreset
}

export function toTuffexChatMessage(
  message: TxAiMessageModel,
): ChatMessageModel {
  return {
    id: message.id,
    role: message.role,
    content: message.content ?? "",
    createdAt: message.createdAt,
    avatarUrl: message.avatarUrl,
    attachments: message.attachments,
  };
}
