import type {
  LocalAiCliProviderId,
  LocalAiCliProviderStatus,
  LocalAiCliStatus
} from '@talex-touch/utils/transport/events/local-ai-cli'
import { describe, expect, it } from 'vitest'
import { isLocalAiCliStatus, localAiAgentBlocker, localAiAgentChoices } from './local-ai-agents'

function provider(
  id: LocalAiCliProviderId,
  overrides: Partial<LocalAiCliProviderStatus> = {}
): LocalAiCliProviderStatus {
  return {
    id,
    label: id,
    enabled: true,
    installed: true,
    capabilities: {
      taskRead: true,
      taskWriteApproval: false,
      terminalRead: true,
      terminalWriteApproval: false,
      taskResume: true,
      terminalResume: true
    },
    ...overrides
  }
}

function status(providers: unknown[], overrides: Partial<LocalAiCliStatus> = {}): LocalAiCliStatus {
  return {
    betaAvailable: true,
    enabled: true,
    defaultProvider: null,
    providers: providers as LocalAiCliProviderStatus[],
    ...overrides
  }
}

describe('localAiAgentBlocker', () => {
  it('lets an agent through only when the panel would keep it selected', () => {
    expect(localAiAgentBlocker(provider('codex'))).toBeNull()
    expect(localAiAgentBlocker(provider('codex', { installed: false }))).toBe('not-installed')
    // Not installed wins: switching it on in Settings would not make it run.
    expect(localAiAgentBlocker(provider('codex', { installed: false, enabled: false }))).toBe(
      'not-installed'
    )
    expect(localAiAgentBlocker(provider('codex', { enabled: false }))).toBe('turned-off')
    expect(
      localAiAgentBlocker(
        provider('codex', { capabilities: { ...provider('codex').capabilities, taskRead: false } })
      )
    ).toBe('unsupported')
  })
})

describe('localAiAgentChoices', () => {
  it("keeps the main process's order, labels and ids", () => {
    expect(
      localAiAgentChoices(
        status([
          provider('pi', { label: 'Pi', installed: false }),
          provider('codex', { label: 'Codex' }),
          provider('claude', { label: 'Claude Code' }),
          provider('oh-my-pi', { label: 'OMP', enabled: false })
        ])
      )
    ).toEqual([
      { id: 'pi', label: 'Pi', blocker: 'not-installed' },
      { id: 'codex', label: 'Codex', blocker: null },
      { id: 'claude', label: 'Claude Code', blocker: null },
      { id: 'oh-my-pi', label: 'OMP', blocker: 'turned-off' }
    ])
  })

  it('offers nothing in a build without local agents', () => {
    expect(
      localAiAgentChoices(
        status([provider('pi', { installed: false })], { betaAvailable: false, enabled: false })
      )
    ).toEqual([])
  })

  it('drops provider entries it cannot read', () => {
    expect(
      localAiAgentChoices(
        status([
          null,
          'codex',
          { id: 'codex', label: 'Codex' },
          provider('claude', { label: 'Claude Code' })
        ])
      )
    ).toEqual([{ id: 'claude', label: 'Claude Code', blocker: null }])
  })
})

describe('isLocalAiCliStatus', () => {
  it('accepts a status and refuses what a failed channel reply looks like', () => {
    expect(isLocalAiCliStatus(status([provider('pi')]))).toBe(true)
    expect(isLocalAiCliStatus(undefined)).toBe(false)
    expect(isLocalAiCliStatus(null)).toBe(false)
    expect(isLocalAiCliStatus([])).toBe(false)
    expect(isLocalAiCliStatus({ betaAvailable: true })).toBe(false)
    expect(isLocalAiCliStatus({ betaAvailable: 'yes', providers: [] })).toBe(false)
  })
})
