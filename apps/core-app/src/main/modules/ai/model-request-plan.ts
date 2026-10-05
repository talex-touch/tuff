import type {
  IntelligenceChatPayload,
  IntelligenceEffectiveModel,
  IntelligenceInvokeOptions,
  IntelligenceProviderConfig
} from '@talex-touch/tuff-intelligence'
import type { IntelligenceModelCatalogEntry } from '@talex-touch/utils/intelligence/model-binding'
import { resolveEffectiveModel } from '@talex-touch/utils/intelligence/model-binding'
import { estimateContextTokens } from './intelligence-token-estimate'
import { readOmpCliModelCatalog, readPiCliModelCatalog } from './providers/pi-model-catalog'
import {
  isPiCliProviderConfig,
  OMP_CLI_ORIGIN,
  OMP_CLI_PROVIDER_ID
} from './providers/pi-cli-runtime'

/**
 * Main's resolved model for one provider attempt. Keyed by a module-private symbol: IPC and plugin
 * payloads cannot carry one, so a provider only ever reads a plan this module attached.
 */
const MODEL_PLAN = Symbol('tuff.intelligence.modelPlan')

type ModelPlannedOptions = IntelligenceInvokeOptions & {
  [MODEL_PLAN]?: IntelligenceEffectiveModel
}

/** The record a catalog Main reads publishes for this model; `null` when none does. */
function readModelCatalogEntry(
  provider: IntelligenceProviderConfig,
  modelId: string
): IntelligenceModelCatalogEntry | null {
  if (provider.id === OMP_CLI_PROVIDER_ID || provider.metadata?.origin === OMP_CLI_ORIGIN) {
    return readOmpCliModelCatalog().get(modelId) ?? null
  }
  if (isPiCliProviderConfig(provider)) return readPiCliModelCatalog().get(modelId) ?? null
  return null
}

/**
 * The effective configuration of `(provider, modelId)` with the catalog Main reads applied — the
 * same answer `getProviderModelOptions` hands Settings and Home.
 */
export function resolveProviderEffectiveModel(
  provider: IntelligenceProviderConfig,
  modelId: string
): IntelligenceEffectiveModel {
  return resolveEffectiveModel(provider, modelId, readModelCatalogEntry(provider, modelId))
}

/** The plan Main attached for this attempt, if any. Providers read nothing else. */
export function readModelPlan(
  options: IntelligenceInvokeOptions | undefined
): IntelligenceEffectiveModel | undefined {
  return (options as ModelPlannedOptions | undefined)?.[MODEL_PLAN]
}

function modelRequestError(code: string, detail: string): Error {
  // `MODEL_UNSUPPORTED` is the stable transport code; the message keeps the specific reason.
  return Object.assign(new Error(`${code}: ${detail}`), { code: 'MODEL_UNSUPPORTED', reason: code })
}

/**
 * Applies a model's effective binding to one chat attempt, before anything is sent:
 *
 * - images: refused unless Main's gate accepts them for this model on this adapter, so a model
 *   with no image input never answers a question about a picture it did not see;
 * - context window: a known window that the host's own conservative estimate of the input already
 *   exceeds refuses the turn rather than sending a request that cannot fit;
 * - output cap: a known cap clamps the caller's `maxTokens` (or becomes it) on adapters that send
 *   one; CLI adapters apply their own model's cap.
 *
 * An unknown model changes nothing: no window or cap is invented, and an adapter that checks image
 * input itself still receives the attachments it always did.
 */
export function planChatModelRequest<O extends IntelligenceInvokeOptions>(
  payload: IntelligenceChatPayload,
  options: O,
  provider: IntelligenceProviderConfig
): { payload: IntelligenceChatPayload; options: O } {
  const modelId = options.modelPreference?.[0] || provider.defaultModel
  if (!modelId) return { payload, options }
  const effective = resolveProviderEffectiveModel(provider, modelId)

  const hasImages = payload.messages.some((message) => (message.attachments?.length ?? 0) > 0)
  if (hasImages && !effective.imageInput.accepted) {
    throw modelRequestError(
      'MODEL_IMAGE_INPUT_UNSUPPORTED',
      `${effective.label} on ${provider.id} does not accept image input (${effective.imageInput.state})`
    )
  }

  const window = effective.contextWindow.value
  if (window !== undefined) {
    const estimate = payload.messages.reduce(
      (total, message) => total + estimateContextTokens(message.content),
      0
    )
    if (estimate > window) {
      throw modelRequestError(
        'MODEL_CONTEXT_WINDOW_EXCEEDED',
        `estimated ${estimate} input tokens exceed the ${window}-token window of ${effective.label}`
      )
    }
  }

  const cap = effective.maxOutputTokens.value
  const nextPayload =
    cap !== undefined && effective.maxOutputTokens.enforced
      ? { ...payload, maxTokens: Math.min(payload.maxTokens ?? cap, cap) }
      : payload

  return { payload: nextPayload, options: { ...options, [MODEL_PLAN]: effective } }
}
