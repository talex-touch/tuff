import { describe, expect, it } from 'vitest'
import { buildPhaseDiagnostics, toPerfSeverity } from './clipboard-phase-diagnostics'

describe('clipboard-phase-diagnostics', () => {
  it('识别 gate.waitForIdle 为 gate_wait 并给出高等级告警', () => {
    const diagnostics = buildPhaseDiagnostics(
      {
        'gate.waitForIdle': 1950,
        'db.persistInsert': 260,
        'meta.stringify': 120
      },
      1950
    )

    expect(diagnostics.slowestPhase).toBe('gate.waitForIdle')
    expect(diagnostics.phaseAlertCode).toBe('gate_wait')
    expect(diagnostics.phaseAlertLevel).toBe('high')
    expect(diagnostics.phaseTop2).toBe('db.persistInsert')
    expect(diagnostics.phaseTop3).toBe('meta.stringify')
  })

  it('识别 image pipeline 并映射 warn 严重级别', () => {
    const diagnostics = buildPhaseDiagnostics(
      {
        'image.encodePng': 260,
        'signature.hashBuild': 80
      },
      260
    )

    expect(diagnostics.phaseAlertCode).toBe('image_pipeline')
    expect(diagnostics.phaseAlertLevel).toBe('low')
    expect(toPerfSeverity(diagnostics.phaseAlertLevel)).toBe('warn')
    expect(diagnostics.phaseAdvice).toContain('image encode')
  })

  it('severity 映射保持稳定', () => {
    expect(toPerfSeverity('normal')).toBeNull()
    expect(toPerfSeverity('low')).toBe('warn')
    expect(toPerfSeverity('medium')).toBe('warn')
    expect(toPerfSeverity('high')).toBe('error')
    expect(toPerfSeverity('critical')).toBe('error')
  })
})
