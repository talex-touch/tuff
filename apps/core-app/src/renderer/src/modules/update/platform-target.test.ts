import { describe, expect, it } from 'vitest'
import {
  compareUpdateAssetTargets,
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
      arch: 'x64',
      sourceArch: 'x64',
      priority: 3
    })
    expect(detectUpdateAssetArch('Tuff-1.0.0-arm64.dmg')).toBe('arm64')
  })

  it('normalizes universal assets to the runtime arch', () => {
    expect(
      resolveUpdateAssetTarget(
        'Tuff-1.0.0-macos-universal.dmg',
        { platform: 'darwin' },
        { platform: 'darwin', arch: 'arm64' }
      )
    ).toEqual({
      platform: 'darwin',
      arch: 'arm64',
      sourceArch: 'universal',
      priority: 2
    })
  })

  it('sorts exact arch before universal before generic', () => {
    const targets = [
      resolveUpdateAssetTarget(
        'Tuff-1.0.0-macos.dmg',
        { platform: 'darwin' },
        { platform: 'darwin', arch: 'x64' }
      ),
      resolveUpdateAssetTarget(
        'Tuff-1.0.0-macos-universal.dmg',
        { platform: 'darwin' },
        { platform: 'darwin', arch: 'x64' }
      ),
      resolveUpdateAssetTarget(
        'Tuff-1.0.0-macos-x64.dmg',
        { platform: 'darwin' },
        { platform: 'darwin', arch: 'x64' }
      )
    ].filter((item): item is NonNullable<typeof item> => item !== null)

    const sorted = targets.sort(compareUpdateAssetTargets).map((item) => item.sourceArch)
    expect(sorted).toEqual(['x64', 'universal', 'generic'])
  })
})
