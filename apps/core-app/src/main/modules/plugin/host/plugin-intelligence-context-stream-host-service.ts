import type {
  IntelligenceContextExecutionRequest,
  IntelligenceContextStreamEvent
} from '@talex-touch/utils/types/intelligence'
import { types as utilTypes } from 'node:util'
import type {
  IntelligenceContextActor,
  IntelligenceContextExecutionHostOptions
} from '../../ai/intelligence-context-execution'
import {
  type PluginIntelligenceContextRequest,
  validatePluginIntelligenceContextRequest
} from './plugin-intelligence-context-host-service'
import type { PluginIntelligenceContextStreamHostService } from './plugin-intelligence-context-stream-capabilities'

export interface PluginIntelligenceContextStreamHostServiceDependencies {
  stream(
    request: IntelligenceContextExecutionRequest,
    actor: IntelligenceContextActor,
    options: IntelligenceContextExecutionHostOptions
  ): AsyncIterable<IntelligenceContextStreamEvent<unknown>>
}

function invalid(): never {
  throw new Error('PLUGIN_INTELLIGENCE_CONTEXT_STREAM_INVALID')
}

function snapshotDependencies(
  value: PluginIntelligenceContextStreamHostServiceDependencies
): PluginIntelligenceContextStreamHostServiceDependencies {
  if (!value || typeof value !== 'object' || utilTypes.isProxy(value)) invalid()
  let descriptors: PropertyDescriptorMap
  let prototype: object | null
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
    prototype = Object.getPrototypeOf(value)
  } catch {
    invalid()
  }
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const keys = Reflect.ownKeys(descriptors)
  if (keys.length !== 1 || keys[0] !== 'stream') invalid()
  const descriptor = descriptors.stream
  if (
    !descriptor?.enumerable ||
    !('value' in descriptor) ||
    typeof descriptor.value !== 'function' ||
    utilTypes.isProxy(descriptor.value)
  ) {
    invalid()
  }
  return Object.freeze({ stream: descriptor.value })
}

function assertSignalAndCaller(signal: unknown, caller: unknown): asserts signal is AbortSignal {
  if (
    !(signal instanceof AbortSignal) ||
    typeof caller !== 'string' ||
    !/^plugin:[A-Za-z0-9._-]+$/.test(caller) ||
    Buffer.byteLength(caller, 'utf8') > 256
  ) {
    invalid()
  }
}

export function createPluginIntelligenceContextStreamHostService(
  rawDependencies: PluginIntelligenceContextStreamHostServiceDependencies
): PluginIntelligenceContextStreamHostService {
  const dependencies = snapshotDependencies(rawDependencies)
  return Object.freeze({
    contextStream(request: PluginIntelligenceContextRequest, signal: AbortSignal, caller: string) {
      assertSignalAndCaller(signal, caller)
      if (signal.aborted) invalid()
      const projected = validatePluginIntelligenceContextRequest(request, caller)
      const executionRequest: IntelligenceContextExecutionRequest = Object.freeze({
        capabilityId: projected.capabilityId,
        input: projected.input,
        payload: {
          messages: projected.payload.messages.map((message) => ({ ...message }))
        },
        ...(projected.options === undefined ? {} : { options: projected.options }),
        context: projected.context
      })
      return Reflect.apply(dependencies.stream, undefined, [
        executionRequest,
        Object.freeze({ id: caller, type: 'plugin' as const }),
        Object.freeze({ signal })
      ])
    }
  })
}
