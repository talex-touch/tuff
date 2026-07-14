import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CAPABILITIES } from '@talex-touch/tuff-intelligence'
import type {
  IntelligenceInvokeResult,
  PromptWorkflowExecution
} from '@talex-touch/tuff-intelligence'
import '../intelligence-test-harness'

const EXPECTED_STABLE_CAPABILITY_IDS = [
  'text.chat',
  'text.translate',
  'text.summarize',
  'text.rewrite',
  'text.grammar',
  'embedding.generate',
  'code.generate',
  'code.explain',
  'code.review',
  'code.refactor',
  'code.debug',
  'intent.detect',
  'sentiment.analyze',
  'content.extract',
  'keywords.extract',
  'text.classify',
  'vision.ocr',
  'image.caption',
  'image.analyze',
  'image.translate.e2e',
  'image.generate',
  'image.edit',
  'audio.tts',
  'audio.stt',
  'audio.transcribe',
  'rag.query',
  'search.semantic',
  'search.rerank',
  'workflow.execute',
  'agent.run'
] as const

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTypeOf('object')
  expect(value).not.toBeNull()
  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true)
  return value as unknown[]
}

interface CapabilityRegistrar {
  registerCapabilities(): void
}

async function registerModuleCapabilities(): Promise<string[]> {
  const { IntelligenceModule } = await import('../intelligence-module')
  const { intelligenceCapabilityRegistry } = await import('../intelligence-capability-registry')

  const module = new IntelligenceModule() as unknown as CapabilityRegistrar
  module.registerCapabilities()

  return intelligenceCapabilityRegistry.getAll().map((capability) => capability.id)
}

describe('AI capability tester registry coverage', () => {
  beforeEach(async () => {
    const { intelligenceCapabilityRegistry } = await import('../intelligence-capability-registry')
    intelligenceCapabilityRegistry.clear()
  })

  it('has a tester for every capability registered by the Intelligence module', async () => {
    const { capabilityTesterRegistry } = await import('./registry')
    const registeredCapabilityIds = await registerModuleCapabilities()

    expect(registeredCapabilityIds).toEqual(expect.arrayContaining([...EXPECTED_STABLE_CAPABILITY_IDS]))

    const missingTesterIds = registeredCapabilityIds.filter(
      (capabilityId) => !capabilityTesterRegistry.has(capabilityId)
    )

    expect(missingTesterIds).toEqual([])
  }, 15_000)

  it('keeps every stable registered capability visible in the default capability config', async () => {
    const registeredCapabilityIds = await registerModuleCapabilities()

    expect(registeredCapabilityIds).toEqual(expect.arrayContaining([...EXPECTED_STABLE_CAPABILITY_IDS]))

    const missingDefaultCapabilityIds = EXPECTED_STABLE_CAPABILITY_IDS.filter(
      (capabilityId) => !Object.prototype.hasOwnProperty.call(DEFAULT_CAPABILITIES, capabilityId)
    )

    expect(missingDefaultCapabilityIds).toEqual([])
  }, 15_000)

  it('formats workflow.execute test payloads and fake results without invoking a provider', async () => {
    const { capabilityTesterRegistry } = await import('./registry')
    const tester = capabilityTesterRegistry.get('workflow.execute')

    expect(tester).toBeDefined()

    const payload = asRecord(
      await tester!.generateTestPayload({
        userInput: 'Summarize release readiness and identify blockers.'
      })
    )
    const steps = asArray(payload.steps)

    expect(steps.length).toBeGreaterThan(0)

    for (const step of steps) {
      const stepRecord = asRecord(step)
      expect(stepRecord.kind).toBeTypeOf('string')
      expect(String(stepRecord.kind).trim()).not.toBe('')
      expect(Object.prototype.hasOwnProperty.call(stepRecord, 'capabilityId')).toBe(false)
    }

    const result: IntelligenceInvokeResult<PromptWorkflowExecution> = {
      result: {
        id: 'execution-1',
        workflowId: 'inline-readiness-check',
        status: 'completed',
        startedAt: 100,
        completedAt: 160,
        inputs: { topic: 'release' },
        outputs: { summary: 'Ready with one follow-up.' },
        steps: [
          {
            stepId: 'summarize',
            status: 'completed',
            startedAt: 100,
            completedAt: 130,
            input: { topic: 'release' },
            output: 'Ready'
          },
          {
            stepId: 'review',
            status: 'failed',
            startedAt: 130,
            completedAt: 160,
            input: { topic: 'release' },
            error: 'Needs approval'
          }
        ]
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'workflow-runtime',
      latency: 60,
      traceId: 'trace-workflow',
      provider: 'intelligence-runtime'
    }

    const formatted = tester!.formatTestResult(result)
    const visibleText = `${formatted.message} ${formatted.textPreview ?? ''}`

    expect(formatted).toMatchObject({
      success: true,
      provider: 'intelligence-runtime',
      model: 'workflow-runtime',
      latency: 60,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    })
    expect(visibleText).toContain('completed')
    expect(visibleText).toContain('2')
    expect(visibleText).toContain('1')
  })
})
