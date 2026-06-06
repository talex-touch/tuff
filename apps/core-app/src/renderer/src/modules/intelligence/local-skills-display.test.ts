import type { IntelligenceLocalSkillProviderSummary } from '@talex-touch/tuff-intelligence'
import { describe, expect, it } from 'vitest'
import { buildIntelligenceLocalSkillsDisplayModel } from './local-skills-display'

function skill(
  patch: Partial<IntelligenceLocalSkillProviderSummary> &
    Pick<IntelligenceLocalSkillProviderSummary, 'id'>
): IntelligenceLocalSkillProviderSummary {
  const installed = patch.installed ?? true
  const mode = patch.mode ?? 'core'
  const approvalRequired = patch.gate?.approvalRequired ?? mode !== 'core'

  return {
    id: patch.id,
    name: patch.name ?? patch.id,
    description: patch.description ?? '',
    source: patch.source ?? 'codex-local',
    installed,
    enabled: patch.enabled ?? (installed && mode === 'core'),
    mode,
    riskLevel: patch.riskLevel ?? (mode === 'gated' ? 'high' : 'low'),
    capabilities: patch.capabilities ?? [],
    gate: {
      status: patch.gate?.status ?? (installed ? 'ready' : 'unavailable'),
      reason: patch.gate?.reason ?? (installed ? 'trusted_core' : 'not_installed'),
      approvalRequired,
      sceneIds: patch.gate?.sceneIds ?? []
    },
    path: patch.path,
    manifestPath: patch.manifestPath,
    updatedAt: patch.updatedAt
  }
}

describe('local-skills-display', () => {
  it('summarizes installed skills without counting missing gated providers as approval-only', () => {
    const model = buildIntelligenceLocalSkillsDisplayModel([
      skill({
        id: 'openai-docs',
        gate: {
          status: 'ready',
          reason: 'trusted_core',
          approvalRequired: false,
          sceneIds: ['docs.openai.answer']
        }
      }),
      skill({
        id: 'sentry',
        installed: false,
        enabled: false,
        mode: 'gated',
        gate: {
          status: 'unavailable',
          reason: 'not_installed',
          approvalRequired: false,
          sceneIds: []
        }
      }),
      skill({
        id: 'linear',
        enabled: false,
        mode: 'gated',
        gate: {
          status: 'approval_required',
          reason: 'high_risk',
          approvalRequired: true,
          sceneIds: ['project.linear.review']
        }
      }),
      skill({
        id: 'custom-review',
        enabled: false,
        mode: 'external',
        gate: {
          status: 'approval_required',
          reason: 'external_unreviewed',
          approvalRequired: true,
          sceneIds: []
        }
      })
    ])

    expect(model.installedSkills.map((item) => item.id)).toEqual([
      'openai-docs',
      'linear',
      'custom-review'
    ])
    expect(model.readySkills).toHaveLength(1)
    expect(model.approvalRequiredSkills).toHaveLength(2)
    expect(model.unavailableSkills.map((item) => item.id)).toEqual(['sentry'])
    expect(model.installedGatedSkills.map((item) => item.id)).toEqual(['linear'])
    expect(model.sceneIds).toEqual(['docs.openai.answer', 'project.linear.review'])
  })

  it('keeps scene hints visible in chip display data with a bounded preview', () => {
    const model = buildIntelligenceLocalSkillsDisplayModel(
      [
        skill({
          id: 'playwright',
          gate: {
            status: 'ready',
            reason: 'trusted_core',
            approvalRequired: false,
            sceneIds: ['browser.qa.run', 'browser.screenshot.capture', 'browser.qa.run']
          }
        })
      ],
      { scenePreviewLimit: 1 }
    )

    expect(model.visibleSkillChips).toEqual([
      {
        id: 'playwright',
        name: 'playwright',
        status: 'ready',
        sceneIds: ['browser.qa.run', 'browser.screenshot.capture'],
        scenePreview: ['browser.qa.run'],
        sceneOverflow: 1
      }
    ])
  })
})
