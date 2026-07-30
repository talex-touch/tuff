import { describe, expect, it } from 'vitest'

import { buildWindowArgs, parseWindowArgs, resolveRendererWindowMode } from '../../renderer/window-role'

describe('window-role', () => {
  it('parses known core type from argv', () => {
    const role = parseWindowArgs(['--touch-type=core-box', '--core-type=omni-panel'])
    expect(role).toEqual({
      touchType: 'core-box',
      coreType: 'omni-panel',
      assistantType: undefined,
      screenshotType: undefined,
      metaOverlay: undefined,
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
      metaOverlay: false,
    })
    expect(args).toEqual(['--touch-type=assistant', '--assistant-type=voice-panel', '--meta-overlay=false'])
  })

  it('round-trips screenshot overlay and editor roles to dedicated renderer modes', () => {
    const overlayRole = {
      touchType: 'screenshot' as const,
      screenshotType: 'overlay' as const,
    }
    const editorRole = {
      touchType: 'screenshot' as const,
      screenshotType: 'editor' as const,
    }

    expect(parseWindowArgs(buildWindowArgs(overlayRole))).toMatchObject(overlayRole)
    expect(resolveRendererWindowMode(overlayRole)).toBe('ScreenshotOverlay')
    expect(parseWindowArgs(buildWindowArgs(editorRole))).toMatchObject(editorRole)
    expect(resolveRendererWindowMode(editorRole)).toBe('ScreenshotEditor')
  })

  it('does not enter a screenshot surface for an unknown screenshot subtype', () => {
    const role = parseWindowArgs(['--touch-type=screenshot', '--screenshot-type=unknown-surface'])

    expect(role.touchType).toBe('screenshot')
    expect(role.screenshotType).toBeUndefined()
    expect(resolveRendererWindowMode(role)).toBe('MainApp')
  })

  it('resolves renderer modes from role', () => {
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        coreType: 'omni-panel',
      }),
    ).toBe('OmniPanel')
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        coreType: 'division-box',
      }),
    ).toBe('DivisionBox')
    expect(
      resolveRendererWindowMode({
        touchType: 'assistant',
        assistantType: 'voice-panel',
      }),
    ).toBe('AssistantVoicePanel')
    expect(
      resolveRendererWindowMode({
        touchType: 'core-box',
        metaOverlay: true,
      }),
    ).toBe('MetaOverlay')
  })
})
