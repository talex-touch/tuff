import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import {
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS,
  QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS,
  QUICK_OPS_SURFACE_AUDIT_SCHEMA,
  createQuickOpsSurfaceAudit,
  createQuickOpsSurfaceAuditFromFiles
} from './quick-ops-surface-audit'

const repoRoot = path.resolve(process.cwd(), '../..')

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.resolve(repoRoot, relativePath), 'utf8')
}

describe('QuickOps SDK and transport surface audit', () => {
  const rawPortStatusEventName = ['quick-ops', 'port-status', 'get'].join(':')

  it('passes against the current QuickOps typed transport and read-only SDK facade', async () => {
    const audit = await createQuickOpsSurfaceAuditFromFiles({ repoRoot })

    expect(audit.schema).toBe(QUICK_OPS_SURFACE_AUDIT_SCHEMA)
    expect(audit.transport.registeredEvents).toEqual([
      ...QUICK_OPS_SURFACE_AUDIT_EXPECTED_TRANSPORT_EVENTS
    ])
    expect(audit.sdk.transportSdkMethods).toEqual([...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS])
    expect(audit.sdk.pluginSdkMethods).toEqual([...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS])
    expect(audit.sdk.pluginRuntimeMethods).toEqual([
      ...QUICK_OPS_SURFACE_AUDIT_EXPECTED_SDK_METHODS
    ])
    expect(audit.sdk.pluginRuntimeUsesTypedEvents).toBe(true)
    expect(audit.flow).toEqual({
      usesRegistry: true,
      usesQuickOpsPluginId: true,
      deliveryHandlerCount: 1,
      singleDeliveryHandler: true
    })
    expect(audit.forbiddenSurfaceHits).toEqual([])
    expect(audit.gate).toEqual({
      passed: true,
      failures: []
    })
  })

  it('fails when a raw channel path or stateful SDK method appears', async () => {
    const [moduleSource, transportSdkSource, pluginSdkSource, pluginRuntimeSource] =
      await Promise.all([
        readRepoFile('apps/core-app/src/main/modules/quick-ops/index.ts'),
        readRepoFile('packages/utils/transport/sdk/domains/quick-ops.ts'),
        readRepoFile('packages/utils/plugin/sdk/quick-ops.ts'),
        readRepoFile('apps/core-app/src/main/modules/plugin/plugin.ts')
      ])

    const audit = createQuickOpsSurfaceAudit({
      moduleSource: `${moduleSource}\nconst raw = '${rawPortStatusEventName}'\n`,
      transportSdkSource: transportSdkSource.replace(
        'systemProxy: () => Promise<QuickOpsSystemProxyGetResponse>',
        'systemProxy: () => Promise<QuickOpsSystemProxyGetResponse>\n  keepAwake: () => Promise<void>'
      ),
      pluginSdkSource,
      pluginRuntimeSource: pluginRuntimeSource.replace(
        'systemProxy: (): Promise<QuickOpsSystemProxyGetResponse> =>',
        'keepAwake: (): Promise<void> =>\n        transport.invoke(QuickOpsEvents.capabilities.get, undefined, {}),\n      systemProxy: (): Promise<QuickOpsSystemProxyGetResponse> =>'
      ),
      generatedAt: '2026-06-19T00:00:00.000Z'
    })

    expect(audit.gate.passed).toBe(false)
    expect(audit.sdk.forbiddenExecutionMethods).toEqual(['keepAwake'])
    expect(audit.forbiddenSurfaceHits).toEqual([
      {
        file: 'module',
        pattern: rawPortStatusEventName,
        count: 1
      }
    ])
    expect(audit.gate.failures).toEqual(
      expect.arrayContaining([
        'Transport QuickOps SDK methods do not match the read-only facade contract',
        'Plugin runtime QuickOps facade methods do not match the read-only contract',
        'QuickOps SDK facade exposes forbidden execution methods: keepAwake',
        'QuickOps public surface contains forbidden raw channel patterns'
      ])
    )
  })
})
