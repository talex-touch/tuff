import { describe, expect, it } from 'vitest'

import {
  buildWindowArgs,
  parseWindowArgs,
  resolveRendererWindowMode
} from '../../renderer/window-role'

describe('window-role', () => {
  it('parses known core type from argv', () => {
    const role = parseWindowArgs(['--touch-type=core-box', '--core-type=omni-panel'])
    expect(role).toEqual({
      touchType: 'core-box',
      coreType: 'omni-panel',
      assistantType: undefined,
      metaOverlay: undefined
    })
  })

  it('ignores unknown core type without throwing', () => {
    const role = parseWindowArgs(['--touch-type=core-box', '--core-type=unknown-panel'])
    expect(role.touchType).toBe('core-box')
    expect(role.coreType).toBeUndefined()
  })

  it('builds deterministic window args', () => {
    const args = buildWindowArgs({
      touchType: 'assistant',
      assistantType: 'voice-panel',
      metaOverlay: false
    })
    expect(args).toEqual([
      '--touch-type=assistant',
      '--assistant-type=voice-panel',
      '--meta-overlay=false'
    ])
  })

  it('resolves renderer modes from role', () => {
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        coreType: 'omni-panel'
      })
    ).toBe('OmniPanel')
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        coreType: 'division-box'
      })
    ).toBe('DivisionBox')
    expect(
      resolveRendererWindowMode({
        touchType: 'assistant',
        assistantType: 'voice-panel'
      })
    ).toBe('AssistantVoicePanel')
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        metaOverlay: true
      })
    ).toBe('MetaOverlay')
  })
})
