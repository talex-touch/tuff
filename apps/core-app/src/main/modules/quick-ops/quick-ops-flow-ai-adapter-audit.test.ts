import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA,
  QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS,
  QUICK_OPS_FLOW_AI_EXPECTED_TARGETS,
  createQuickOpsFlowAiAdapterAudit,
  createQuickOpsFlowAiAdapterAuditFromFiles
} from './quick-ops-flow-ai-adapter-audit'

const repoRoot = path.resolve(process.cwd(), '../..')

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.resolve(repoRoot, relativePath), 'utf8')
}

describe('QuickOps Flow and AI adapter audit', () => {
  it('captures current Flow coverage, source adapter, and runtime bridge contract', async () => {
    const audit = await createQuickOpsFlowAiAdapterAuditFromFiles({ repoRoot })

    expect(audit.schema).toBe(QUICK_OPS_FLOW_AI_ADAPTER_AUDIT_SCHEMA)
    expect(audit.flow.registeredTargets).toEqual([...QUICK_OPS_FLOW_AI_EXPECTED_TARGETS])
    expect(audit.flow.requireConfirmTargets).toEqual([
      ...QUICK_OPS_FLOW_AI_EXPECTED_CONFIRM_TARGETS
    ])
    expect(audit.flow.structuredDispatchCoverage).toEqual({
      readOnly: true,
      stateful: true,
      fileWriting: true,
      notification: true,
      clipboard: true,
      folderOpen: true
    })
    expect(audit.flow.coversPolicyBlockedAck).toBe(true)
    expect(audit.flow.recordsAuditWithoutPayloadValues).toBe(true)
    expect(audit.flow.redactsClipboardAck).toBe(true)
    expect(audit.confirmation).toEqual({
      flowBusRequiresOneTimeToken: true,
      flowBusConsumesConfirmationToken: true,
      selectorRequestsConfirmationToken: true,
      selectorSeparatesConfirmationFromConsent: true
    })
    expect(audit.ai).toEqual({
      hasNaturalLanguageAdapter: true,
      adapterSignals: [
        'plugins/touch-quickops/index.js:flow-dispatch-adapter',
        'plugins/touch-quickops/index.test.cjs:contract'
      ],
      linksRequestTargetConfirmationResult: true,
      blocksHighRiskWithoutConfirmation: true,
      hasRuntimeDispatchBridge: true
    })
    expect(audit.gate).toEqual({
      passed: true,
      failures: []
    })
  })

  it('passes when Flow coverage, adapter contract, and runtime bridge signals are present', async () => {
    const [moduleSource, flowBusSource, flowSelectorSource] = await Promise.all([
      readRepoFile('apps/core-app/src/main/modules/quick-ops/index.ts'),
      readRepoFile('apps/core-app/src/main/modules/flow-bus/flow-bus.ts'),
      readRepoFile('apps/core-app/src/renderer/src/components/flow/FlowSelector.vue')
    ])

    const audit = createQuickOpsFlowAiAdapterAudit({
      moduleSource,
      flowBusSource,
      flowSelectorSource,
      aiSources: [
        {
          path: 'plugins/touch-quickops/index.js',
          source: [
            'function resolveSafeFlowAction() {}',
            'function resolveConfirmationFlowAction() {}',
            'function resolveHighRiskFlowAction() {}',
            'function buildFlowActionItem() { return { runtimeDispatchBridge: true } }',
            'function buildConfirmationRequiredItems() { return { runtimeDispatchBridge: false, confirmationToken: true } }',
            'function buildHighRiskBlockedItems() {}',
            'function buildFlowAdapterTrace() {}',
            'const trace = { requestHash: "", targetId, confirmation: "required", result: "dispatch-plan" }',
            "const blocked = { reason: 'high-risk-blocked', confirmation: 'blocked' }",
            'async onItemAction() { await flow.dispatch(payload.payload, payload.options) }'
          ].join('\n')
        },
        {
          path: 'plugins/touch-quickops/index.test.cjs',
          source: [
            'test("buildFlowAdapterTrace redacts request and payload values", () => {})',
            'expect(trace).toMatchObject({ payloadKeys: [], sensitivePayloadRedacted: true })',
            'test("onItemAction dispatches safe QuickOps Flow action", () => {})',
            'assert.equal(items[0].meta.payload, undefined)',
            'assert.equal(resolveHighRiskFlowAction("kill port 3000").targetId, "quickops.port-kill")'
          ].join('\n')
        }
      ],
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    expect(audit.ai).toEqual({
      hasNaturalLanguageAdapter: true,
      adapterSignals: [
        'plugins/touch-quickops/index.js:flow-dispatch-adapter',
        'plugins/touch-quickops/index.test.cjs:contract'
      ],
      linksRequestTargetConfirmationResult: true,
      blocksHighRiskWithoutConfirmation: true,
      hasRuntimeDispatchBridge: true
    })
    expect(audit.gate).toEqual({
      passed: true,
      failures: []
    })
  })

  it('fails when requireConfirm target coverage drifts', async () => {
    const [moduleSource, flowBusSource, flowSelectorSource] = await Promise.all([
      readRepoFile('apps/core-app/src/main/modules/quick-ops/index.ts'),
      readRepoFile('apps/core-app/src/main/modules/flow-bus/flow-bus.ts'),
      readRepoFile('apps/core-app/src/renderer/src/components/flow/FlowSelector.vue')
    ])

    const audit = createQuickOpsFlowAiAdapterAudit({
      moduleSource: moduleSource.replace(
        '  requireConfirm: true,\n  capabilities: {\n    maxPayloadSize: 16 * 1024\n  }\n}\n\nconst QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET',
        '  capabilities: {\n    maxPayloadSize: 16 * 1024\n  }\n}\n\nconst QUICK_OPS_SYSTEM_AWAKE_FLOW_TARGET'
      ),
      flowBusSource,
      flowSelectorSource,
      aiSources: [
        {
          path: 'apps/core-app/src/main/modules/ai/quickops-natural-language-adapter.ts',
          source: 'QuickOps quickops high-risk confirmation'
        }
      ]
    })

    expect(audit.flow.requireConfirmMatchesExpected).toBe(false)
    expect(audit.gate.failures).toContain(
      'QuickOps requireConfirm target set does not match the confirmation model'
    )
  })
})
