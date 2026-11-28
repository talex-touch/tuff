import {
  IntelligenceProviderType,
  normalizeIntelligencePayload,
  toRuntimeCapabilityId,
  type IntelligenceMessage,
  type IntelligenceReasoningEffort,
  type IntelligenceReasoningEffortDecision,
  type IntelligenceUsageInfo,
} from "@talex-touch/tuff-intelligence/light";
import {
  normalizeReasoningEffort,
  planReasoningEffort,
  type ReasoningEffortPlan,
} from "@talex-touch/utils/intelligence/reasoning-effort";
import { buildCapabilityMessages } from "./tuffIntelligenceCapabilityMessages";
import { createError, type H3Event } from "h3";
import { runAfterResponse } from "./afterResponse";
import { resolveProviderBaseUrl } from "./intelligenceModels";
import {
  resolveIntelligenceProviderAdapter,
  resolveIntelligenceProviderStreamAdapter,
  type IntelligenceProviderAdapterStreamChunk,
  type IntelligenceProviderRecord,
} from "./tuffIntelligenceProviderAdapters";
import { invokeIntelligenceVisionOcr } from "./intelligenceVisionOcrProvider";
import { getProviderCredential } from "./providerCredentialStore";
import {
  assertIntelligenceProviderQuota,
  recordIntelligenceProviderRequest,
} from "./providerQuota";
import { recordProviderUsageLedger } from "./providerUsageLedgerStore";
import type {
  SceneRunFallbackTrailItem,
  SceneRunResult,
  SceneRunTraceStep,
} from "./sceneOrchestrator";
import {
  resolveCapabilitySceneId,
  resolveSceneProviderCandidates,
} from "./sceneOrchestrator";
import { createAudit } from "./intelligenceStore";
import {
  listProviderRegistryEntries,
  type ProviderRegistryRecord,
} from "./providerRegistryStore";
import { normalizeNexusIntelligenceTransportError } from "./intelligenceErrorContract";

export interface ResolvedProviderContext {
  provider: IntelligenceProviderRecord;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  auditEnabled: boolean;
}

interface InvokeModelResult {
  content: string;
  model: string;
  traceId: string;
  endpoint: string;
  status?: number;
  latency: number;
  usage?: IntelligenceUsageInfo;
  /** How the requested reasoning effort resolved on this context's upstream. */
  reasoningEffort?: IntelligenceReasoningEffortDecision;
}

interface InvokeModelOptions {
  capabilityId?: string;
  providerId?: string;
  model?: string;
  timeoutMs?: number;
  source?: string;
  stage?: string;
  sessionId?: string;
  modelPreference?: string[];
  allowedProviderIds?: string[];
  /** Output cap handed to the provider, when the caller declared one. */
  maxTokens?: number;
  /**
   * Candidates the caller already resolved. The capability entry points resolve them before taking
   * the credit hold, so a capability with no usable provider is refused without a reserve-and-refund
   * round trip pair.
   */
  resolvedContexts?: ResolvedProviderContext[];
  /**
   * Reasoning depth the client asked for. Resolved per upstream context against the shared table
   * (`@talex-touch/utils/intelligence/reasoning-effort`); absent sends nothing, as before.
   */
  reasoningEffort?: IntelligenceReasoningEffort;
}

interface NexusInvokeOptions extends InvokeModelOptions {
  preferredProviderId?: string;
  allowedProviderIds?: string[];
  modelPreference?: string[];
  metadata?: Record<string, unknown>;
}

interface NexusInvokeAuditContext {
  source: string;
  caller?: string;
  sessionId?: string;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
  workflowStepId?: string;
}

type IntelligenceMeterUnit = "1k_tokens" | "image" | "audio_second" | "transcript_unit";

/** Provider-reported consumption of one capability invoke, in its usage unit. */
interface IntelligenceInvokeMeter {
  unit: IntelligenceMeterUnit;
  /** Native quantity in `unit` that the provider reported. */
  quantity: number;
  billable: boolean;
  /** True when the quantity is our own count rather than provider-reported usage. */
  estimated: boolean;
}

interface InvokeModelAttemptError {
  providerId: string;
  providerName: string;
  message: string;
}

interface InvokeModelWithFallbackResult {
  result: InvokeModelResult;
  context: ResolvedProviderContext;
  fallbackCount: number;
  retryCount: number;
  attemptedProviders: string[];
  errors: InvokeModelAttemptError[];
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_PROVIDER_RETRY_COUNT = 0;
const RETRYABLE_HTTP_STATUS_CODES = new Set([
  408, 409, 425, 429, 500, 502, 503, 504,
]);
const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_RESPONSE_STATUS_CODE",
]);
const RETRYABLE_ERROR_PATTERNS = [
  /timeout/i,
  /timed\s*out/i,
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /temporar/i,
  /service\s*unavailable/i,
  /overloaded/i,
  /connection\s*reset/i,
  /network\s*error/i,
];
const PROVIDER_QUOTA_ERROR_CODES = new Set([
  "INTELLIGENCE_PROVIDER_REQUEST_QUOTA_EXCEEDED",
  "INTELLIGENCE_PROVIDER_TOKEN_QUOTA_EXCEEDED",
]);

function now(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function resolveGovernanceProviderId(
  provider: IntelligenceProviderRecord,
): string {
  return (
    readOptionalString(provider.metadata?.providerRegistryId) ?? provider.id
  );
}

function getErrorCode(error: Error): string | null {
  const detail = error as unknown as Record<string, unknown>;
  const data = asRecord(detail.data);
  const cause = asRecord(detail.cause);
  const code = detail.code ?? data.code ?? cause.code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function resolveInvokeGovernanceChannel(stage?: string): string {
  const normalized = readOptionalString(stage);
  if (!normalized) return "invoke";
  const capabilityPrefix = "capability:";
  return normalized.startsWith(capabilityPrefix)
    ? normalized.slice(capabilityPrefix.length) || "capability"
    : normalized;
}

function sanitizeJsonContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function tryResolveHttpStatus(error: Error): number | null {
  const detail = error as unknown as Record<string, unknown>;
  const directStatus = detail.status;
  if (typeof directStatus === "number" && Number.isFinite(directStatus))
    return directStatus;

  const h3Status = detail.statusCode;
  if (typeof h3Status === "number" && Number.isFinite(h3Status))
    return h3Status;

  const nestedResponse = asRecord(detail.response);
  if (
    typeof nestedResponse.status === "number" &&
    Number.isFinite(nestedResponse.status)
  )
    return nestedResponse.status as number;

  const cause = asRecord(detail.cause);
  if (typeof cause.status === "number" && Number.isFinite(cause.status))
    return cause.status as number;

  return null;
}

export function isRetryableInvokeError(error: Error): boolean {
  if (isProviderQuotaError(error)) return false;

  const status = tryResolveHttpStatus(error);
  if (status !== null && RETRYABLE_HTTP_STATUS_CODES.has(status)) {
    return true;
  }

  const detail = error as unknown as Record<string, unknown>;
  const cause = asRecord(detail.cause);
  const codeValue = String(detail.code ?? cause.code ?? "")
    .trim()
    .toUpperCase();
  if (codeValue && RETRYABLE_ERROR_CODES.has(codeValue)) {
    return true;
  }

  const message = String(error.message || "");
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isProviderQuotaError(error: Error): boolean {
  const code = getErrorCode(error);
  return Boolean(code && PROVIDER_QUOTA_ERROR_CODES.has(code));
}

function isSafeProviderFallbackError(error: Error): boolean {
  if (isProviderQuotaError(error))
    return true;
  const status = tryResolveHttpStatus(error);
  return status !== null && [400, 401, 403, 404, 409, 422, 429].includes(status);
}

async function recordProviderQuotaBlockedEvidence(
  _event: H3Event,
  _input: {
    actorId: string;
    providerId: string;
    channel: string;
    source: string;
    stage: string;
    error: Error;
  },
): Promise<void> {
  // Quota enforcement runs directly against provider_registry.metadata.quota.
}

function readProviderModels(provider: ProviderRegistryRecord): string[] {
  const models = provider.metadata?.models;
  return Array.isArray(models)
    ? models.filter((model): model is string => typeof model === "string" && model.trim().length > 0)
    : [];
}

function toRuntimeProviderRecord(
  provider: ProviderRegistryRecord,
  userId: string,
  priority: number,
): IntelligenceProviderRecord {
  const models = readProviderModels(provider);
  const defaultModel = readOptionalString(provider.metadata?.defaultModel) ?? models[0] ?? null;
  const intelligenceType = readOptionalString(provider.metadata?.intelligenceType)
    ?? (provider.vendor === "deepseek" ? IntelligenceProviderType.DEEPSEEK : IntelligenceProviderType.CUSTOM);
  return {
    id: provider.id,
    userId: provider.ownerId ?? userId,
    type: intelligenceType,
    name: provider.displayName,
    enabled: provider.status === "enabled",
    hasApiKey: provider.authType === "none" || Boolean(provider.authRef),
    baseUrl: provider.endpoint,
    models,
    defaultModel,
    instructions: readOptionalString(provider.metadata?.instructions) ?? null,
    timeout: readOptionalNumber(provider.metadata?.timeout) ?? DEFAULT_TIMEOUT_MS,
    priority,
    rateLimit: null,
    capabilities: provider.capabilities.map(capability => capability.capability),
    metadata: provider.metadata,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

async function resolveRegistryApiKey(event: H3Event, provider: ProviderRegistryRecord): Promise<string | null> {
  if (provider.authType === "none")
    return null;
  if (provider.authType !== "api_key" || !provider.authRef)
    return null;
  const credential = await getProviderCredential(event, provider.authRef);
  return credential && "apiKey" in credential && credential.apiKey ? credential.apiKey : null;
}

async function resolveProviderCandidates(
  event: H3Event,
  userId: string,
  options: {
    capabilityId?: string;
    providerId?: string;
    model?: string;
    timeoutMs?: number;
    modelPreference?: string[];
    allowedProviderIds?: string[];
  } = {},
): Promise<ResolvedProviderContext[]> {
  const capabilityId = options.capabilityId || "text.chat";
  const resolution = await resolveSceneProviderCandidates(event, {
    sceneId: resolveCapabilitySceneId(capabilityId),
    capability: capabilityId,
    ownerId: userId,
  });
  const allowedProviderIds = options.allowedProviderIds ? new Set(options.allowedProviderIds) : null;
  const candidates = resolution.candidates.filter(({ provider }) => {
    if (allowedProviderIds && !allowedProviderIds.has(provider.id))
      return false;
    if (!options.providerId)
      return true;
    return provider.id === options.providerId;
  });

  // Every candidate's credential is read side by side; they were read one after another, a round
  // trip per candidate before the first provider could be called.
  const apiKeys = await Promise.all(candidates.map(candidate => resolveRegistryApiKey(event, candidate.provider)));
  const contexts: ResolvedProviderContext[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const provider = toRuntimeProviderRecord(candidate.provider, userId, candidate.binding.priority);
    const model = candidate.model ?? provider.defaultModel ?? provider.models[0];
    if (!model)
      continue;
    const apiKey = apiKeys[index] ?? null;
    if (candidate.provider.authType !== "none" && !apiKey)
      continue;
    contexts.push({
      provider,
      model,
      apiKey,
      timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, options.timeoutMs ?? provider.timeout),
      auditEnabled: resolution.scene.auditPolicy?.enabled === true
        || resolution.scene.auditPolicy?.persistTrace === true,
    });
  }

  if (contexts.length === 0)
    throw new Error(`No configured provider is available for ${capabilityId}.`);
  return contexts;
}

export async function resolveIntelligenceProviderRuntimeContexts(
  event: H3Event,
  userId: string,
  options: {
    capabilityId: string;
    providerId?: string;
    timeoutMs?: number;
    allowedProviderIds?: string[];
  },
): Promise<ResolvedProviderContext[]> {
  return await resolveProviderCandidates(event, userId, options);
}

async function invokeModel(
  event: H3Event,
  userId: string,
  payload: InvokeModelOptions & {
    messages: IntelligenceMessage[];
  },
): Promise<InvokeModelWithFallbackResult> {
  const contexts = payload.resolvedContexts ?? await resolveProviderCandidates(event, userId, {
    capabilityId: payload.capabilityId,
    providerId: payload.providerId,
    model: payload.model,
    timeoutMs: payload.timeoutMs,
    modelPreference: payload.modelPreference,
    allowedProviderIds: payload.allowedProviderIds,
  });
  const attemptedProviders: string[] = [];
  const errors: InvokeModelAttemptError[] = [];
  let fallbackCount = 0;
  let retryCount = 0;
  let lastError: Error | null = null;

  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index]!;
    attemptedProviders.push(context.provider.id);
    let providerLastError: Error | null = null;
    const maxAttempts = DEFAULT_PROVIDER_RETRY_COUNT + 1;
    const governanceProviderId = resolveGovernanceProviderId(context.provider);
    const governanceChannel = resolveInvokeGovernanceChannel(payload.stage);

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
      const providerAttempt = attemptIndex + 1;
      try {
        await assertIntelligenceProviderQuota(
          event,
          governanceProviderId,
          governanceChannel,
        );
        await recordIntelligenceProviderRequest(
          event,
          governanceProviderId,
          governanceChannel,
        );
        const result = await invokeWithResolvedContext(
          context,
          payload.messages,
          payload.maxTokens,
          payload.reasoningEffort,
        );
        if (context.auditEnabled) {
          // The success audit is a record, not part of the answer: written after the response
          // instead of holding the caller for another round trip.
          const auditMetadata = {
            source: payload.source || "intelligence-agent",
            stage: payload.stage || "invoke",
            sessionId: payload.sessionId,
            attempt: index + 1,
            providerAttempt,
            fallbackCount,
            retryCount,
          };
          runAfterResponse(event, "intelligence invoke audit", () => createAudit(event, {
            userId,
            providerId: context.provider.id,
            providerType: context.provider.type,
            model: result.model,
            endpoint: result.endpoint,
            status: result.status ?? 200,
            latency: result.latency,
            success: true,
            traceId: result.traceId,
            metadata: auditMetadata,
          }));
        }
        return {
          result,
          context,
          fallbackCount,
          retryCount,
          attemptedProviders,
          errors,
        };
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        const errorCode = normalizeNexusIntelligenceTransportError(normalizedError).code;
        const detail = normalizedError as unknown as Record<string, unknown>;
        const retryable = isRetryableInvokeError(normalizedError);
        const hasRetryBudget = attemptIndex < maxAttempts - 1;
        const willRetry = retryable && hasRetryBudget;
        const status =
          tryResolveHttpStatus(normalizedError) ??
          (isProviderQuotaError(normalizedError) ? 429 : 500);

        if (isProviderQuotaError(normalizedError)) {
          await recordProviderQuotaBlockedEvidence(event, {
            actorId: userId,
            providerId: governanceProviderId,
            channel: governanceChannel,
            source: payload.source || "intelligence-agent",
            stage: payload.stage || "invoke",
            error: normalizedError,
          });
        }

        detail.attempt = index + 1;
        detail.providerAttempt = providerAttempt;
        detail.fallbackCandidate = index < contexts.length - 1;
        detail.stage = payload.stage || "invoke";
        detail.retryable = retryable;
        detail.willRetry = willRetry;

        providerLastError = normalizedError;

        if (context.auditEnabled) {
          await createAudit(event, {
            userId,
            providerId: context.provider.id,
            providerType: context.provider.type,
            model: context.model,
            endpoint: null,
            status,
            latency: context.timeoutMs,
            success: false,
            errorMessage: errorCode,
            traceId: createId("trace"),
            metadata: {
              source: payload.source || "intelligence-agent",
              stage: payload.stage || "invoke",
              sessionId: payload.sessionId,
              errorCode,
              attempt: index + 1,
              providerAttempt,
              fallbackCandidate: index < contexts.length - 1,
              retryable,
              willRetry,
            },
          });
        }

        if (willRetry) {
          retryCount += 1;
          continue;
        }
        break;
      }
    }

    if (providerLastError) {
      lastError = providerLastError;
      const errorCode = normalizeNexusIntelligenceTransportError(providerLastError).code;
      errors.push({
        providerId: context.provider.id,
        providerName: context.provider.name,
        message: errorCode,
      });
      if (index < contexts.length - 1 && isSafeProviderFallbackError(providerLastError)) {
        fallbackCount += 1;
        continue;
      }
      break;
    }
  }

  throw (
    lastError ??
    new Error("Failed to call all available intelligence providers.")
  );
}

async function invokeModelStream(
  event: H3Event,
  userId: string,
  payload: InvokeModelOptions & { messages: IntelligenceMessage[] },
  hooks: NexusIntelligenceStreamHooks & { capabilityId: string },
): Promise<InvokeModelWithFallbackResult> {
  const contexts = payload.resolvedContexts ?? await resolveProviderCandidates(event, userId, {
    capabilityId: payload.capabilityId,
    providerId: payload.providerId,
    model: payload.model,
    timeoutMs: payload.timeoutMs,
    modelPreference: payload.modelPreference,
    allowedProviderIds: payload.allowedProviderIds,
  });
  const attemptedProviders: string[] = [];
  const errors: InvokeModelAttemptError[] = [];
  let fallbackCount = 0;
  let retryCount = 0;
  let lastError: Error | null = null;

  for (let index = 0; index < contexts.length; index++) {
    const context = contexts[index]!;
    attemptedProviders.push(context.provider.id);
    let providerLastError: Error | null = null;
    const maxAttempts = DEFAULT_PROVIDER_RETRY_COUNT + 1;
    const governanceProviderId = resolveGovernanceProviderId(context.provider);
    const governanceChannel = resolveInvokeGovernanceChannel(payload.stage);

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex++) {
      const providerAttempt = attemptIndex + 1;
      let emittedDelta = false;
      try {
        if (hooks.signal?.aborted)
          throw hooks.signal.reason instanceof Error
            ? hooks.signal.reason
            : new Error("Stream aborted.");
        await assertIntelligenceProviderQuota(
          event,
          governanceProviderId,
          governanceChannel,
        );
        await recordIntelligenceProviderRequest(
          event,
          governanceProviderId,
          governanceChannel,
        );
        const result = await streamWithResolvedContext(
          context,
          payload.messages,
          payload.maxTokens,
          {
            ...hooks,
            onDelta: async (delta, meta) => {
              emittedDelta = true;
              await hooks.onDelta(delta, meta);
            },
          },
          payload.reasoningEffort,
        );
        if (context.auditEnabled) {
          await createAudit(event, {
            userId,
            providerId: context.provider.id,
            providerType: context.provider.type,
            model: result.model,
            endpoint: result.endpoint,
            status: result.status ?? 200,
            latency: result.latency,
            success: true,
            traceId: result.traceId,
            metadata: {
              source: payload.source || "intelligence-agent",
              stage: payload.stage || "invoke-stream",
              sessionId: payload.sessionId,
              attempt: index + 1,
              providerAttempt,
              fallbackCount,
              retryCount,
              streamed: true,
            },
          });
        }
        return {
          result,
          context,
          fallbackCount,
          retryCount,
          attemptedProviders,
          errors,
        };
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        const errorCode = normalizeNexusIntelligenceTransportError(normalizedError).code;
        const detail = normalizedError as unknown as Record<string, unknown>;
        const retryable =
          !emittedDelta && isRetryableInvokeError(normalizedError);
        const hasRetryBudget = attemptIndex < maxAttempts - 1;
        const willRetry = retryable && hasRetryBudget && !hooks.signal?.aborted;
        const status =
          tryResolveHttpStatus(normalizedError) ??
          (isProviderQuotaError(normalizedError) ? 429 : 500);

        if (isProviderQuotaError(normalizedError)) {
          await recordProviderQuotaBlockedEvidence(event, {
            actorId: userId,
            providerId: governanceProviderId,
            channel: governanceChannel,
            source: payload.source || "intelligence-agent",
            stage: payload.stage || "invoke-stream",
            error: normalizedError,
          });
        }

        detail.attempt = index + 1;
        detail.providerAttempt = providerAttempt;
        detail.fallbackCandidate = !emittedDelta && index < contexts.length - 1;
        detail.stage = payload.stage || "invoke-stream";
        detail.retryable = retryable;
        detail.willRetry = willRetry;
        detail.streamStarted = emittedDelta;
        providerLastError = normalizedError;

        if (context.auditEnabled) {
          await createAudit(event, {
            userId,
            providerId: context.provider.id,
            providerType: context.provider.type,
            model: context.model,
            endpoint: null,
            status,
            latency: context.timeoutMs,
            success: false,
            errorMessage: errorCode,
            traceId: createId("trace"),
            metadata: {
              source: payload.source || "intelligence-agent",
              stage: payload.stage || "invoke-stream",
              sessionId: payload.sessionId,
              errorCode,
              attempt: index + 1,
              providerAttempt,
              fallbackCandidate: !emittedDelta && index < contexts.length - 1,
              retryable,
              willRetry,
              streamed: true,
              streamStarted: emittedDelta,
            },
          });
        }

        if (emittedDelta || hooks.signal?.aborted) throw normalizedError;
        if (willRetry) {
          retryCount += 1;
          continue;
        }
        break;
      }
    }

    if (providerLastError) {
      lastError = providerLastError;
      const errorCode = normalizeNexusIntelligenceTransportError(providerLastError).code;
      errors.push({
        providerId: context.provider.id,
        providerName: context.provider.name,
        message: errorCode,
      });
      if (index < contexts.length - 1 && isSafeProviderFallbackError(providerLastError)) {
        fallbackCount += 1;
        continue;
      }
      break;
    }
  }

  throw (
    lastError ??
    new Error("Failed to stream from all available intelligence providers.")
  );
}

export async function probeIntelligenceLabProvider(
  event: H3Event,
  userId: string,
  payload: {
    providerId: string;
    model?: string;
    prompt?: string;
    timeoutMs?: number;
  },
): Promise<{
  success: boolean;
  providerId: string;
  providerName: string;
  providerType: string;
  model: string;
  output: string;
  latency: number;
  endpoint: string;
  traceId: string;
  fallbackCount: number;
  retryCount: number;
  attemptedProviders: string[];
  message: string;
}> {
  const prompt =
    typeof payload.prompt === "string" && payload.prompt.trim()
      ? payload.prompt.trim()
      : 'Reply with "pong" and one short sentence describing your model capability.';
  const invocation = await invokeModel(event, userId, {
    providerId: payload.providerId,
    model: payload.model?.trim() || undefined,
    timeoutMs: payload.timeoutMs,
    messages: [
      {
        role: "system",
        content:
          "You are a Tuff Intelligence provider probe assistant. Keep the output concise.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    source: "intelligence-provider-probe",
    stage: "provider-probe",
  });

  return {
    success: true,
    providerId: invocation.context.provider.id,
    providerName: invocation.context.provider.name,
    providerType: invocation.context.provider.type,
    model: invocation.result.model,
    output: invocation.result.content,
    latency: invocation.result.latency,
    endpoint: invocation.result.endpoint,
    traceId: invocation.result.traceId,
    fallbackCount: invocation.fallbackCount,
    retryCount: invocation.retryCount,
    attemptedProviders: invocation.attemptedProviders,
    message: "Probe completed.",
  };
}

/**
 * The reasoning plan for one upstream context, from the same table the client plans with. Routed by
 * provider type alone: Nexus's own provider ids are not the client's, and a Nexus upstream is never
 * a local CLI or another Nexus. `undefined` when the caller asked for no effort, so the adapter
 * builds exactly the request it always did.
 */
function planContextReasoning(
  context: ResolvedProviderContext,
  reasoningEffort: IntelligenceReasoningEffort | undefined,
): ReasoningEffortPlan | undefined {
  if (!reasoningEffort) return undefined;
  return planReasoningEffort(reasoningEffort, {
    providerType: context.provider.type,
    model: context.model,
  });
}

async function invokeWithResolvedContext(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
  maxTokens?: number,
  reasoningEffort?: IntelligenceReasoningEffort,
): Promise<InvokeModelResult> {
  try {
    const adapter = resolveIntelligenceProviderAdapter(context.provider.type);
    if (!adapter) {
      throw new Error(`Unsupported provider type: ${context.provider.type}`);
    }
    const reasoning = planContextReasoning(context, reasoningEffort);
    const result = await adapter({
      context,
      messages,
      maxTokens,
      ...(reasoning ? { reasoning } : {}),
    });
    return reasoning ? { ...result, reasoningEffort: reasoning.decision } : result;
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    const detail = normalized as unknown as Record<string, unknown>;
    detail.providerId = context.provider.id;
    detail.providerName = context.provider.name;
    detail.providerType = context.provider.type;
    detail.model = context.model;
    detail.baseUrl = resolveProviderBaseUrl(
      context.provider.type,
      context.provider.baseUrl,
    );
    throw normalized;
  }
}

async function streamWithResolvedContext(
  context: ResolvedProviderContext,
  messages: IntelligenceMessage[],
  maxTokens: number | undefined,
  hooks: NexusIntelligenceStreamHooks & { capabilityId: string },
  reasoningEffort?: IntelligenceReasoningEffort,
): Promise<InvokeModelResult> {
  try {
    const adapter = resolveIntelligenceProviderStreamAdapter(
      context.provider.type,
    );
    if (!adapter)
      throw new Error(
        `Unsupported streaming provider type: ${context.provider.type}`,
      );

    const reasoning = planContextReasoning(context, reasoningEffort);
    let content = "";
    let finalChunk: IntelligenceProviderAdapterStreamChunk | null = null;
    let started = false;
    for await (const chunk of adapter({
      context,
      messages,
      maxTokens,
      signal: hooks.signal,
      ...(reasoning ? { reasoning } : {}),
    })) {
      finalChunk = chunk;
      const meta: NexusIntelligenceStreamMeta = {
        capabilityId: hooks.capabilityId,
        provider: context.provider.id,
        model: chunk.model,
        traceId: chunk.traceId,
        latency: chunk.latency,
      };
      if (chunk.delta) {
        if (!started) {
          started = true;
          // The decision rides `start` once, not every delta.
          await hooks.onStart?.(
            reasoning ? { ...meta, reasoningEffort: reasoning.decision } : meta,
          );
        }
        content += chunk.delta;
        await hooks.onDelta(chunk.delta, meta);
      }
    }

    if (!finalChunk || !content.trim())
      throw new Error("Provider returned empty streamed content.");

    return {
      content,
      model: finalChunk.model,
      traceId: finalChunk.traceId,
      endpoint: finalChunk.endpoint,
      status: finalChunk.status,
      latency: finalChunk.latency,
      usage: finalChunk.usage,
      ...(reasoning ? { reasoningEffort: reasoning.decision } : {}),
    };
  } catch (error) {
    const normalized =
      error instanceof Error ? error : new Error(String(error));
    const detail = normalized as unknown as Record<string, unknown>;
    detail.providerId = context.provider.id;
    detail.providerName = context.provider.name;
    detail.providerType = context.provider.type;
    detail.model = context.model;
    detail.baseUrl = resolveProviderBaseUrl(
      context.provider.type,
      context.provider.baseUrl,
    );
    throw normalized;
  }
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseJsonObject<T extends Record<string, unknown>>(
  raw: string,
  fallback: T,
): T {
  const sanitized = sanitizeJsonContent(raw);
  const candidates = [
    sanitized,
    sanitized.includes("{") && sanitized.includes("}")
      ? sanitized.slice(sanitized.indexOf("{"), sanitized.lastIndexOf("}") + 1)
      : "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return { ...fallback, ...(parsed as Partial<T>) };
    } catch {
      // Try the next candidate.
    }
  }
  return fallback;
}

function normalizeCapabilityId(capabilityId: unknown): string {
  const normalized = toRuntimeCapabilityId(capabilityId);
  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "capabilityId is required.",
    });
  }
  return normalized;
}

function normalizeUsage(usage?: IntelligenceUsageInfo): IntelligenceUsageInfo {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}

function normalizeTextResult(capabilityId: string, content: string): unknown {
  if (capabilityId === "code.explain") {
    return parseJsonObject(content, {
      explanation: content,
      summary: "",
      keyPoints: [],
    });
  }
  if (capabilityId === "code.review") {
    return parseJsonObject(content, {
      summary: content,
      score: 0,
      issues: [],
      improvements: [],
    });
  }
  return content;
}

function resolveInvokeAuditContext(
  options: NexusInvokeOptions,
): NexusInvokeAuditContext {
  const metadata = options.metadata ?? {};
  const source =
    readOptionalString(metadata.source) || options.source || "core-app";
  return {
    source,
    caller: readOptionalString(metadata.caller),
    sessionId: readOptionalString(metadata.sessionId) || options.sessionId,
    workflowId: readOptionalString(metadata.workflowId),
    workflowName: readOptionalString(metadata.workflowName),
    workflowRunId: readOptionalString(metadata.workflowRunId),
    workflowStepId: readOptionalString(metadata.workflowStepId),
  };
}

function resolveInvocationGovernanceProviderId(
  invocation: NexusIntelligenceInvokeResult,
): string {
  return invocation.metadata.providerGovernanceId ?? invocation.provider;
}

function buildInvokeTrace(
  invocation: NexusIntelligenceInvokeResult,
  audit: NexusInvokeAuditContext,
  createdAt: string,
): SceneRunTraceStep[] {
  return [
    {
      phase: "scene.load",
      status: "success",
      at: createdAt,
      message: "Nexus intelligence invoke audit context resolved.",
      metadata: {
        traceId: invocation.traceId,
        source: audit.source,
        caller: audit.caller ?? null,
        sessionId: audit.sessionId ?? null,
        workflowId: audit.workflowId ?? null,
        workflowName: audit.workflowName ?? null,
        workflowRunId: audit.workflowRunId ?? null,
        workflowStepId: audit.workflowStepId ?? null,
      },
    },
    {
      phase: "adapter.dispatch",
      status: "success",
      at: createdAt,
      message: "Nexus intelligence capability invocation completed.",
      metadata: {
        capabilityId: invocation.capabilityId,
        providerId: invocation.provider,
        providerGovernanceId:
          invocation.metadata.providerGovernanceId ?? invocation.provider,
        model: invocation.model,
        traceId: invocation.traceId,
        totalTokens: invocation.usage.totalTokens,
        latency: invocation.latency,
      },
    },
  ];
}

async function recordIntelligenceInvokeUsageLedger(
  event: H3Event,
  invocation: NexusIntelligenceInvokeResult,
  audit: NexusInvokeAuditContext,
  meter: IntelligenceInvokeMeter,
): Promise<string[]> {
  const createdAt = new Date().toISOString();
  const governanceProviderId =
    resolveInvocationGovernanceProviderId(invocation);
  const fallbackTrail: SceneRunFallbackTrailItem[] =
    invocation.metadata.attemptedProviders.map((providerId) => ({
      providerId,
      capability: invocation.capabilityId,
      status: providerId === invocation.provider ? "selected" : "candidate",
    }));
  const run: SceneRunResult = {
    runId: `intelligence_invoke_${invocation.traceId}`,
    sceneId: "nexus.intelligence.invoke",
    status: "completed",
    mode: "execute",
    strategyMode: "priority",
    requestedCapabilities: [invocation.capabilityId],
    selected: [
      {
        providerId: governanceProviderId,
        providerName: invocation.metadata.providerName || invocation.provider,
        vendor: invocation.metadata.providerType || "unknown",
        capability: invocation.capabilityId,
        model: invocation.model ?? null,
        priority: 0,
        weight: null,
        bindingId: `intelligence:${governanceProviderId}`,
        authRef: null,
        endpoint: null,
        region: null,
      },
    ],
    candidates: [],
    fallbackTrail,
    trace: buildInvokeTrace(invocation, audit, createdAt),
    usage: [
      {
        unit: meter.unit,
        quantity: meter.quantity,
        billable: meter.billable,
        providerId: governanceProviderId,
        capability: invocation.capabilityId,
        model: invocation.model,
        providerType: invocation.metadata.providerType,
        estimated: meter.estimated,
        providerUsageRef: invocation.traceId,
      },
    ],
    output: null,
  };

  const entries = await recordProviderUsageLedger(event, run).catch((error) => {
    console.warn(
      "[tuffIntelligenceLabService] Failed to record intelligence invoke usage ledger",
      error,
    );
    return [] as Awaited<ReturnType<typeof recordProviderUsageLedger>>;
  });

  return entries.map((entry) => entry.id);
}

/** Output cap the caller asked for, if it asked for one. */
function readDeclaredOutputTokens(
  options: NexusInvokeOptions,
): number | undefined {
  const declared =
    readOptionalNumber(options.metadata?.maxTokens) ??
    readOptionalNumber(options.metadata?.maxOutputTokens) ??
    readOptionalNumber(options.metadata?.max_tokens);
  return declared !== undefined && declared > 0 ? declared : undefined;
}

async function resolveVisionOcrProvider(
  event: H3Event,
  userId: string,
  providerId?: string,
): Promise<ProviderRegistryRecord> {
  const resolution = await resolveSceneProviderCandidates(event, {
    sceneId: resolveCapabilitySceneId("vision.ocr"),
    capability: "vision.ocr",
    ownerId: userId,
  });
  const selected = providerId
    ? resolution.candidates.find(({ provider }) => provider.id === providerId)
    : resolution.candidates[0];
  if (!selected) {
    throw createError({
      statusCode: 409,
      statusMessage: "Target vision OCR provider not found.",
    });
  }
  return selected.provider;
}

export interface NexusIntelligenceInvokePayload {
  capabilityId: string;
  payload?: unknown;
  options?: NexusInvokeOptions;
}

export interface NexusIntelligenceInvokeResult {
  capabilityId: string;
  result: unknown;
  usage: IntelligenceUsageInfo;
  model: string;
  latency: number;
  traceId: string;
  provider: string;
  metadata: {
    nexus: true;
    providerName?: string;
    providerType?: string;
    fallbackCount: number;
    retryCount: number;
    attemptedProviders: string[];
    source: string;
    caller?: string;
    sessionId?: string;
    workflowId?: string;
    workflowName?: string;
    workflowRunId?: string;
    workflowStepId?: string;
    providerGovernanceId?: string;
    providerUsageLedgerIds?: string[];
    /**
     * How the requested reasoning effort resolved on the upstream that answered — `applied` /
     * `clamped` with the level sent, or an `unsupported-*` status when the upstream takes none and
     * nothing was sent. Absent when the caller asked for no effort.
     */
    reasoningEffort?: IntelligenceReasoningEffortDecision;
  };
}

export interface NexusIntelligenceStreamMeta {
  capabilityId: string;
  provider: string;
  model: string;
  traceId: string;
  latency: number;
  /** On the `start` meta only: the decision for the upstream now streaming. */
  reasoningEffort?: IntelligenceReasoningEffortDecision;
}

export interface NexusIntelligenceStreamHooks {
  signal?: AbortSignal;
  onStart?: (meta: NexusIntelligenceStreamMeta) => void | Promise<void>;
  onDelta: (
    delta: string,
    meta: NexusIntelligenceStreamMeta,
  ) => void | Promise<void>;
}

export async function invokeIntelligenceCapability(
  event: H3Event,
  userId: string,
  request: NexusIntelligenceInvokePayload,
): Promise<NexusIntelligenceInvokeResult> {
  const normalizedRequest = normalizeIntelligencePayload(
    request.capabilityId,
    request.payload,
  );
  const capabilityId = normalizeCapabilityId(normalizedRequest.capabilityId);
  const options = request.options ?? {};
  const audit = resolveInvokeAuditContext(options);
  const timeoutMs =
    options.timeoutMs || readOptionalNumber(options.metadata?.timeout);

  if (capabilityId === "vision.ocr") {
    const provider = await resolveVisionOcrProvider(event, userId);
    const governanceProviderId = provider.id;
    try {
      await assertIntelligenceProviderQuota(
        event,
        governanceProviderId,
        capabilityId,
      );
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      if (isProviderQuotaError(normalizedError)) {
        await recordProviderQuotaBlockedEvidence(event, {
          actorId: userId,
          providerId: governanceProviderId,
          channel: capabilityId,
          source: audit.source,
          stage: `capability:${capabilityId}`,
          error: normalizedError,
        });
      }
      throw error;
    }
    await recordIntelligenceProviderRequest(
      event,
      governanceProviderId,
      capabilityId,
    );
    const startedAt = now();
    const ocr = await invokeIntelligenceVisionOcr(
      event,
      provider,
      normalizedRequest.payload,
    );
    const result: NexusIntelligenceInvokeResult = {
      capabilityId,
      result: ocr.output,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model:
        readOptionalString(provider.metadata?.defaultModel) || "vision-ocr",
      latency: ocr.latencyMs || now() - startedAt,
      traceId: ocr.providerRequestId || createId("trace"),
      provider: provider.id,
      metadata: {
        nexus: true,
        providerName: provider.displayName,
        providerType:
          readOptionalString(provider.metadata?.intelligenceType) ||
          provider.vendor,
        fallbackCount: 0,
        retryCount: 0,
        attemptedProviders: [provider.id],
        source: audit.source,
        caller: audit.caller,
        sessionId: audit.sessionId,
        workflowId: audit.workflowId,
        workflowName: audit.workflowName,
        workflowRunId: audit.workflowRunId,
        workflowStepId: audit.workflowStepId,
        providerGovernanceId: governanceProviderId,
      },
    };
    const meter: IntelligenceInvokeMeter = {
      unit: "image",
      quantity: Number.isFinite(ocr.usage.quantity) && ocr.usage.quantity > 0 ? ocr.usage.quantity : 0,
      billable: ocr.usage.billable,
      estimated: ocr.usage.estimated,
    };
    result.metadata.providerUsageLedgerIds =
      await recordIntelligenceInvokeUsageLedger(
        event,
        result,
        audit,
        meter,
      );
    return result;
  }

  const messages = buildCapabilityMessages(
    capabilityId,
    normalizedRequest.payload,
  );
  const resolvedContexts = await resolveProviderCandidates(event, userId, { capabilityId, timeoutMs });
  const invocation = await invokeModel(event, userId, {
    capabilityId,
    resolvedContexts,
    timeoutMs,
    maxTokens: readDeclaredOutputTokens(options),
    // Chat only: every other capability is sent no reasoning parameter.
    reasoningEffort:
      capabilityId === "text.chat"
        ? normalizeReasoningEffort(options.reasoningEffort)
        : undefined,
    messages,
    source: audit.source,
    stage: `capability:${capabilityId}`,
    sessionId: audit.sessionId,
  });

  const result: NexusIntelligenceInvokeResult = {
    capabilityId,
    result: normalizeTextResult(capabilityId, invocation.result.content),
    usage: normalizeUsage(invocation.result.usage),
    model: invocation.result.model,
    latency: invocation.result.latency,
    traceId: invocation.result.traceId,
    provider: invocation.context.provider.id,
    metadata: {
      nexus: true,
      providerName: invocation.context.provider.name,
      providerType: invocation.context.provider.type,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      attemptedProviders: invocation.attemptedProviders,
      source: audit.source,
      caller: audit.caller,
      sessionId: audit.sessionId,
      workflowId: audit.workflowId,
      workflowName: audit.workflowName,
      workflowRunId: audit.workflowRunId,
      workflowStepId: audit.workflowStepId,
      providerGovernanceId: resolveGovernanceProviderId(
        invocation.context.provider,
      ),
      ...(invocation.result.reasoningEffort
        ? { reasoningEffort: invocation.result.reasoningEffort }
        : {}),
    },
  };
  const meter: IntelligenceInvokeMeter = {
    unit: "1k_tokens",
    quantity: result.usage.totalTokens,
    billable: result.usage.totalTokens > 0,
    estimated: false,
  };
  result.metadata.providerUsageLedgerIds =
    await recordIntelligenceInvokeUsageLedger(
      event,
      result,
      audit,
      meter,
    );
  return result;
}

export async function streamIntelligenceCapability(
  event: H3Event,
  userId: string,
  request: NexusIntelligenceInvokePayload,
  hooks: NexusIntelligenceStreamHooks,
): Promise<NexusIntelligenceInvokeResult> {
  const normalizedRequest = normalizeIntelligencePayload(
    request.capabilityId,
    request.payload,
  );
  const capabilityId = normalizeCapabilityId(normalizedRequest.capabilityId);
  if (capabilityId !== "text.chat") {
    throw createError({
      statusCode: 400,
      statusMessage: "Token streaming currently supports text.chat only.",
    });
  }

  const options = request.options ?? {};
  const audit = resolveInvokeAuditContext(options);
  const timeoutMs =
    options.timeoutMs || readOptionalNumber(options.metadata?.timeout);
  const messages = buildCapabilityMessages(
    capabilityId,
    normalizedRequest.payload,
  );
  const resolvedContexts = await resolveProviderCandidates(event, userId, { capabilityId, timeoutMs });
  const invocation = await invokeModelStream(
    event,
    userId,
    {
      capabilityId,
      resolvedContexts,
      timeoutMs,
      maxTokens: readDeclaredOutputTokens(options),
      reasoningEffort: normalizeReasoningEffort(options.reasoningEffort),
      messages,
      source: audit.source,
      stage: `capability:${capabilityId}`,
      sessionId: audit.sessionId,
    },
    { ...hooks, capabilityId },
  );

  const result: NexusIntelligenceInvokeResult = {
    capabilityId,
    result: invocation.result.content,
    usage: normalizeUsage(invocation.result.usage),
    model: invocation.result.model,
    latency: invocation.result.latency,
    traceId: invocation.result.traceId,
    provider: invocation.context.provider.id,
    metadata: {
      nexus: true,
      providerName: invocation.context.provider.name,
      providerType: invocation.context.provider.type,
      fallbackCount: invocation.fallbackCount,
      retryCount: invocation.retryCount,
      attemptedProviders: invocation.attemptedProviders,
      source: audit.source,
      caller: audit.caller,
      sessionId: audit.sessionId,
      workflowId: audit.workflowId,
      workflowName: audit.workflowName,
      workflowRunId: audit.workflowRunId,
      workflowStepId: audit.workflowStepId,
      providerGovernanceId: resolveGovernanceProviderId(
        invocation.context.provider,
      ),
      ...(invocation.result.reasoningEffort
        ? { reasoningEffort: invocation.result.reasoningEffort }
        : {}),
    },
  };
  const meter: IntelligenceInvokeMeter = {
    unit: "1k_tokens",
    quantity: result.usage.totalTokens,
    billable: result.usage.totalTokens > 0,
    estimated: false,
  };
  result.metadata.providerUsageLedgerIds =
    await recordIntelligenceInvokeUsageLedger(
      event,
      result,
      audit,
      meter,
    );
  return result;
}

export async function listIntelligenceLabProviders(
  event: H3Event,
  userId: string,
): Promise<{
  providers: IntelligenceProviderRecord[];
}> {
  const entries = await listProviderRegistryEntries(event);
  const providers = entries
    .filter(provider => provider.ownerScope === "system" || provider.ownerId === userId)
    .map(provider => toRuntimeProviderRecord(
      provider,
      userId,
      readOptionalNumber(provider.metadata?.priority) ?? 100,
    ));
  return {
    providers,
  };
}
