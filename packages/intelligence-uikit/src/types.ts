import type { Ref } from 'vue'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'

import type {
  AiAttachment,
  AiChainStep,
  AiMessagePart,
  AiToolCallPart,
} from '@talex-touch/tuffex/ai-elements'
import type {
  ChatComposerAttachment,
  ChatMessageModel,
} from '@talex-touch/tuffex/chat'
import type {
  ConversationStreamItemKey,
  ConversationStreamLoadResult,
} from '@talex-touch/tuffex/conversation-stream'
import type {
  PromptBarCommand,
  PromptBarModel,
  PromptBarSource,
} from '@talex-touch/tuffex/prompt-bar'
import type { MikoState } from '@talex-touch/tuffex/miko'
import type { AiRunStep, AiSendState } from './utils/composer-state'
import type { TxAiRailTurn } from './utils/message-rail'

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

export type TxAiComposerAttachment =
  | TxAiAttachment
  | ChatComposerAttachment
  | AiAttachment;

export type TxAiMessagePart =
  | AiMessagePart
  | {
    type: string;
    text?: string;
    status?: string;
    [key: string]: unknown;
  };

export interface TxAiVoiceClipMeta {
  src?: string;
  durationMs?: number;
  peaks?: readonly number[];
  unavailableLabel?: string;
}

export interface TxAiMessageModel {
  id: string;
  role: TxAiMessageRole;
  content?: string;
  createdAt?: number;
  avatarUrl?: string;
  status?: TxAiMessageStatus;
  attachments?: TxAiComposerAttachment[];
  blocks?: TxAiRichBlockModel[];
  parts?: TxAiMessagePart[];
  segments?: TxAiSegment[];
  voiceClip?: TxAiVoiceClipMeta;
  footer?: TxAiTurnFooterProps;
  error?: TxAiErrorBlockProps;
  waiting?: boolean;
  thinkingVerb?: string;
  thinkingLabel?: string;
  compacting?: boolean;
  compactingLabel?: string;
  meta?: Record<string, unknown>;
}

export interface TxAiMessageLabels {
  generating?: string;
  copy?: string;
  copied?: string;
  regenerate?: string;
  actions?: string;
  speak?: string;
  stopSpeak?: string;
  attachment?: string;
  voicePlay?: string;
  voicePause?: string;
  voiceSeek?: string;
  voiceUnavailable?: string;
  planning?: string;
  thinking?: string;
  reasoning?: string;
  toolCall?: string;
  errorFallback?: string;
  retry?: string;
  payload?: string;
}

export interface TxAiMessageProps {
  message: TxAiMessageModel;
  markdown?: boolean;
  reveal?: boolean;
  showAvatar?: boolean;
  showActions?: boolean;
  copyable?: boolean;
  regenerable?: boolean;
  speakable?: boolean;
  speakState?: TxAiSpeakState;
  showFooter?: boolean;
  /** Latest message in the thread: keeps its turn footer expanded by default. */
  latest?: boolean;
  variant?: 'hybrid' | 'bubble' | 'clean';
  motion?: TxAiMotionPreset;
  openui?: boolean;
  openuiLabels?: Record<string, string>;
  resolveOpenuiImage?: (query: string) => Promise<string | null>;
  widgetSandbox?: TxAiWidgetSandbox;
  hasToolFace?: (part: AiToolCallPart) => boolean;
  submittedForms?: ReadonlySet<string>;
  formDrafts?: ReadonlyMap<string, Record<string, FormFieldValue>>;
  showToolPayload?: boolean;
  labels?: TxAiMessageLabels;
}

export interface TxAiConversationLabels {
  backToBottom?: string;
  stopGenerating?: string;
  loadingOlder?: string;
  loadOlderFailed?: string;
  retry?: string;
  beginning?: string;
  emptyTitle?: string;
  emptySubtitle?: string;
  railTitle?: string;
  railTurnPrefix?: string;
  railImageTag?: string;
  railCodeTag?: string;
  generating?: string;
}

export interface TxAiConversationSuggestion {
  key?: string;
  text: string;
  description?: string;
  icon?: string;
  tone?: TxAiTone;
}

export interface TxAiConversationProps {
  messages: TxAiMessageModel[];
  markdown?: boolean;
  generating?: boolean;
  itemKey?: ConversationStreamItemKey<TxAiMessageModel>;
  estimatedItemHeight?: number;
  overscan?: number;
  loadOlder?: () => Promise<ConversationStreamLoadResult>;
  hasMoreInitial?: boolean;
  blurMasks?: boolean;
  showEmptyState?: boolean;
  showRail?: boolean;
  emptyTitle?: string;
  emptySubtitle?: string;
  suggestions?: Array<string | TxAiConversationSuggestion>;
  composerClearance?: number | string;
  variant?: 'hybrid' | 'bubble' | 'clean';
  showAvatar?: boolean;
  showActions?: boolean;
  showFooter?: boolean;
  openui?: boolean;
  openuiLabels?: Record<string, string>;
  resolveOpenuiImage?: (query: string) => Promise<string | null>;
  widgetSandbox?: TxAiWidgetSandbox;
  hasToolFace?: (part: AiToolCallPart) => boolean;
  submittedForms?: ReadonlySet<string>;
  formDrafts?: ReadonlyMap<string, Record<string, FormFieldValue>>;
  labels?: TxAiConversationLabels;
}

export type TxAiComposerDictationState =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'finishing';

export interface TxAiComposerLabels {
  placeholder?: string;
  ariaLabel?: string;
  send?: string;
  stop?: string;
  queue?: string;
  attach?: string;
  removeAttachment?: string;
  cancelAttachment?: string;
  previewTitle?: string;
  sourcesHint?: string;
  commandsHint?: string;
  noMatches?: string;
  connect?: string;
  connected?: string;
  modelLabel?: string;
  dictateStart?: string;
  dictateStop?: string;
  dictateCancel?: string;
  dictatingStatus?: string;
  dictatingFinisher?: string;
  dictateEscHint?: string;
  queueHint?: string;
  sendHint?: string;
  newLineHint?: string;
  contextLabel?: string;
}

export interface TxAiRunStatusProps {
  /** `pill`: clickable status pill (default); `line`: inline composer-dock status row with TxMiko & rolling clock. */
  variant?: 'pill' | 'line';
  step?: AiRunStep | null;
  steps?: readonly AiRunStep[];
  elapsedMs?: number;
  /** Epoch timestamp (ms) for a live 1s rolling clock in `line` variant. */
  startedAt?: number;
  /** Explicit Miko animation state for `line` variant. */
  mikoState?: MikoState;
  /** Hide the inline TxMiko mark in `line` variant (e.g. when a roaming pet represents live state). */
  hideMiko?: boolean;
  /** Explicit single-line step label for `line` variant. */
  lineLabel?: string;
  /** Semantic tone for the step text in `line` variant (`tool` highlights in accent ink). */
  tone?: 'default' | 'tool';
  queuedCount?: number;
  streaming?: boolean;
  waiting?: boolean;
  compacting?: boolean;
  activeTools?: readonly Pick<AiToolCallPart, 'name' | 'status' | 'summary'>[];
  labels?: Record<string, string>;
}

export interface TxAiContextMeterProps {
  /** `pill`: circular ring badge (default); `bar`: 2px linear composer-edge strip with rolling TxTextMorph percent. */
  variant?: 'pill' | 'bar';
  usedTokens?: number;
  maxTokens?: number;
  /** Direct percentage reading (0–100+, clamped visually) for `bar` variant. */
  percent?: number;
  /** Formatted window ceiling (e.g. `128k`, `1M`) for `bar` variant. */
  windowText?: string;
  /** Accessible `aria-valuetext` override for `bar` variant. */
  valueText?: string;
  label?: string;
  detail?: string;
  compact?: boolean;
  warningThreshold?: number;
  dangerThreshold?: number;
}

export interface TxAiVoiceDraftProps {
  active?: boolean;
  state?: TxAiComposerDictationState;
  elapsedMs?: number;
  statusText?: string;
  escHint?: string;
  cancelLabel?: string;
  level?: number | (() => number);
}

export interface TxAiMessageRailProps {
  /** `popover`: card tooltip rail (default); `minimal`: bare-text floating preview rail with inline `#IMAGE` tags. */
  variant?: 'popover' | 'minimal';
  messages: readonly (TxAiMessageModel & { modelAttachments?: readonly unknown[] })[];
  turns?: readonly TxAiRailTurn[];
  activeIndex?: number;
  ariaLabel?: string;
  imageTag?: string;
  codeTag?: string;
  fallbackLabel?: string;
  maxLength?: number;
  turnPrefix?: string;
  turnAriaLabel?: (turnNumber: number, title: string) => string;
}

export interface TxAiComposerControlProps {
  label?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  circle?: boolean;
  size?: 'sm' | 'md';
}

export interface TxAiComposerChipProps {
  label?: string;
  value?: string;
  active?: boolean;
  disabled?: boolean;
  removable?: boolean;
  tone?: TxAiTone;
  removeLabel?: string;
}

export interface TxAiComposerMicProps {
  state?: TxAiComposerDictationState;
  listening?: boolean;
  blocked?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  startLabel?: string;
  stopLabel?: string;
}

export interface TxAiComposerSendIslandProps {
  state: AiSendState;
  disabled?: boolean;
  queuedCount?: number;
  sendLabel?: string;
  stopLabel?: string;
  queueLabel?: string;
}

export interface TxAiComposerProps {
  modelValue?: string;
  variant?: 'rounded' | 'pill';
  surface?: 'solid' | 'refraction';
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  submitting?: boolean;
  busy?: boolean;
  sendState?: AiSendState;
  queuedCount?: number;
  attachments?: TxAiComposerAttachment[];
  allowAttachmentWhileSubmitting?: boolean;
  minRows?: number;
  maxRows?: number;
  minHeight?: number;
  maxHeight?: number;
  autoResize?: boolean;
  sendOnEnter?: boolean;
  sendOnMetaEnter?: boolean;
  allowEmptySend?: boolean;
  clearOnSend?: boolean;
  sendButtonText?: string;
  stopButtonText?: string;
  queueButtonText?: string;
  showAttachmentButton?: boolean;
  attachmentButtonText?: string;
  sources?: PromptBarSource[];
  commands?: PromptBarCommand[];
  models?: PromptBarModel[];
  model?: string;
  dictatable?: boolean;
  listening?: boolean;
  dictationState?: TxAiComposerDictationState;
  dictationBlocked?: boolean;
  dictationElapsedMs?: number;
  dictationStatusText?: string;
  dictationEscHint?: string;
  listeningPlaceholder?: string;
  voiceLevel?: number | (() => number);
  voiceStream?: MediaStream | null;
  beamActive?: boolean;
  conversing?: boolean;
  alertText?: string;
  alertTone?: TxAiTone;
  runStatus?: TxAiRunStatusProps | null;
  contextMeter?: TxAiContextMeterProps | null;
  labels?: TxAiComposerLabels;
}

export interface TxAiSuggestionProps {
  text: string;
  description?: string;
  icon?: string;
  tone?: TxAiTone;
  variant?: 'chip' | 'card';
  size?: 'sm' | 'md';
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
  copyLabel?: string;
  copiedLabel?: string;
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
  labels?: Pick<
    TxAiMessageLabels,
    'planning' | 'thinking' | 'reasoning' | 'toolCall' | 'errorFallback' | 'copy' | 'copied'
  >;
}

export interface TxAiToolCallProps {
  name?: string;
  status?: TxAiToolStatus;
  description?: string;
  toolCall?: AiToolCallPart;
  defaultExpanded?: boolean;
  userOpen?: boolean;
  showRetry?: boolean;
  labels?: Record<string, string>;
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
  | { kind: "steer"; id: string; text: string; createdAt?: number }
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
  /** Optional display label when distinct from the raw `model` id. */
  modelLabel?: string
  /** Answering provider or endpoint id for full diagnostic tooltips. */
  provider?: string
  /** Short localized reasoning level shown next to the model (e.g. "High" / "极高"). */
  reasoning?: string
  /** Detailed reasoning description for hover tooltip. */
  reasoningTitle?: string
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
  /** Badge label shown next to inline mid-turn steer segments. */
  steerLabel?: string
  footer?: TxAiTurnFooterProps
  error?: TxAiErrorBlockProps
  motion?: TxAiMotionPreset
  /** Render ```openui fences in prose as interactive OpenUI. Off keeps them as plain code. */
  openui?: boolean
  /** Labels for the OpenUI renderer (notices, button text). */
  openuiLabels?: Record<string, string>
  /** Host lookup for OpenUI `SearchImage`; resolve a query to an image URL, or null. */
  resolveOpenuiImage?: (query: string) => Promise<string | null>
}

export function toTuffexChatMessage(
  message: TxAiMessageModel,
): ChatMessageModel {
  const legacyImages = (message.attachments ?? []).flatMap((item) => {
    if ('type' in item && item.type === 'image')
      return [{ type: 'image' as const, url: item.url, name: item.name }]
    if ('kind' in item && item.kind === 'image' && 'url' in item && typeof item.url === 'string')
      return [{ type: 'image' as const, url: item.url, name: item.name }]
    return []
  })

  return {
    id: message.id,
    role: message.role,
    content: message.content ?? '',
    createdAt: message.createdAt,
    avatarUrl: message.avatarUrl,
    attachments: legacyImages.length ? legacyImages : undefined,
  }
}
