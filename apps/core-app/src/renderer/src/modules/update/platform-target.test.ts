import { describe, expect, it } from 'vitest'
import {
  detectUpdateAssetArch,
  detectUpdateAssetPlatform,
  resolveRuntimeUpdateArch,
  resolveRuntimeUpdatePlatform,
  resolveUpdateAssetTarget
} from './platform-target'

describe('update platform target resolver', () => {
  it('detects linux asset from appimage extension', () => {
    expect(detectUpdateAssetPlatform('Tuff-1.0.0-x64.AppImage')).toBe('linux')
  })

  it('returns unsupported for unknown platform text', () => {
    expect(detectUpdateAssetPlatform('Tuff-1.0.0-portable.bin')).toBe('unsupported')
  })

  it('returns unsupported for unknown runtime platform and arch', () => {
    expect(resolveRuntimeUpdatePlatform('freebsd' as NodeJS.Platform)).toBe('unsupported')
    expect(resolveRuntimeUpdateArch('riscv64')).toBe('unsupported')
  })

  it('returns null for unsupported asset target', () => {
    expect(resolveUpdateAssetTarget('Tuff-1.0.0-macos.dmg', { arch: 'riscv64' })).toBeNull()
  })

  it('resolves full supported target', () => {
    expect(resolveUpdateAssetTarget('Tuff-1.0.0-windows-x64.exe')).toEqual({
      platform: 'win32',
      arch: 'x64'
    })
    expect(detectUpdateAssetArch('Tuff-1.0.0-arm64.dmg')).toBe('arm64')
  })
})
