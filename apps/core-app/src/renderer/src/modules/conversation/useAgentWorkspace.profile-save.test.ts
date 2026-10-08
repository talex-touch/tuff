import type { AgentWorkspaceSdk } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useAgentWorkspace } from './useAgentWorkspace'

/**
 * The 「管理智能体」 switch saves a row read out of the reactive profile list. The IPC under the
 * save clones its payload, and a proxy anywhere in it fails the clone; `structuredClone` stands in
 * for it here as it does in the submit suite.
 */
const mocks = vi.hoisted(() => ({
  saved: [] as unknown[],
  profile: {
    id: 'default-pi',
    name: 'Tuff Pi Coordinator',
    enabled: true,
    runtimeProvider: 'pi-core',
    allowedToolIds: ['file.read', 'file.list'],
    permissionPolicy: { mode: 'manual' }
  }
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    orchestratorListProfiles: async () => [structuredClone(mocks.profile)],
    orchestratorSaveProfile: async (profile: unknown) => {
      const sent = structuredClone(profile)
      mocks.saved.push(sent)
      return sent
    }
  })
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: () => {}, warn: () => {} })
}))

afterAll(() => {
  vi.doUnmock('@talex-touch/utils/renderer')
  vi.doUnmock('~/utils/renderer-log')
})

describe('useAgentWorkspace profile switch', () => {
  it('saves a row taken from the reactive list as a plain, cloneable record', async () => {
    const failures: string[] = []
    const scope = effectScope()
    const workspace = scope.run(() =>
      useAgentWorkspace({
        conversationId: () => null,
        projectId: () => null,
        title: (text) => text,
        defaults: () => ({ reasoningEffort: 'auto', autoContext: false }),
        leadNote: (lead) => lead,
        onError: (failure) => {
          failures.push(failure.detail || failure.code)
        },
        // No thread on screen: only the subscriptions are touched.
        sdk: {
          onChanged: () => () => {},
          onMessageUpdate: () => () => {}
        } as unknown as AgentWorkspaceSdk
      })
    )!

    await workspace.loadProfiles()
    // What the menu hands back: the row as the list renders it, nested fields and all.
    const row = workspace.profiles.value[0] as AiAgentProfile
    await workspace.setProfileEnabled(row, false)

    expect(failures).toEqual([])
    expect(mocks.saved).toEqual([{ ...mocks.profile, enabled: false }])
    expect(workspace.profiles.value.map((profile) => profile.enabled)).toEqual([false])
    scope.stop()
  })
})
