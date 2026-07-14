import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxOsIcon from '../src/TxOsIcon.vue'

type OsIconProps = {
  platform?: string
  os?: string
}

function renderedIcon(props: OsIconProps) {
  const wrapper = mount(TxOsIcon, { props })
  const svg = wrapper.find('svg')

  expect(svg.exists()).toBe(true)

  const path = svg.find('path')

  return {
    svg,
    pathD: path.attributes('d') ?? '',
  }
}

function expectWindowsIcon(props: OsIconProps) {
  const { svg, pathD } = renderedIcon(props)

  expect(svg.attributes('viewBox')).toBe('0 0 256 256')
  expect(pathD).toContain('134.67')
}

function expectLinuxIcon(props: OsIconProps) {
  const { svg, pathD } = renderedIcon(props)

  expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  expect(pathD).toContain('M12 2.25c-2.42')
}

function expectMacOsIcon(props: OsIconProps) {
  const { svg, pathD } = renderedIcon(props)

  expect(svg.attributes('viewBox')).toBe('0 0 24 24')
  expect(pathD).toContain('M16.37 1.43')
}

describe('txOsIcon', () => {
  it('detects Windows from platform and os aliases case-insensitively', () => {
    const cases: OsIconProps[] = [
      { platform: 'Windows' },
      { platform: 'electron', os: 'WIN32' },
      { platform: 'desktop', os: 'win64' },
    ]

    for (const props of cases) {
      expectWindowsIcon(props)
    }
  })

  it('detects Linux from platform and distro aliases case-insensitively', () => {
    const cases: OsIconProps[] = [
      { platform: 'LINUX' },
      { platform: 'desktop', os: 'Ubuntu 24.04' },
      { platform: 'server', os: 'Debian' },
      { platform: 'workstation', os: 'Fedora' },
      { platform: 'desktop', os: 'Arch' },
    ]

    for (const props of cases) {
      expectLinuxIcon(props)
    }
  })

  it('detects macOS aliases and falls back to macOS for unsupported sources', () => {
    const cases: OsIconProps[] = [
      { platform: 'DARWIN' },
      { platform: 'desktop', os: 'Mac' },
      { platform: 'OS X' },
      { platform: 'sunos', os: 'solaris' },
    ]

    for (const props of cases) {
      expectMacOsIcon(props)
    }
  })

  it('renders decorative SVGs sized through the stable tx-os-icon class', () => {
    const cases: OsIconProps[] = [
      { platform: 'darwin' },
      { platform: 'windows' },
      { platform: 'linux' },
    ]

    for (const props of cases) {
      const { svg } = renderedIcon(props)

      expect(svg.classes()).toContain('tx-os-icon')
      expect(svg.attributes('aria-hidden')).toBe('true')
      expect(svg.attributes('role')).toBeUndefined()
      expect(svg.attributes('viewBox')).toBeTruthy()
    }
  })
})
