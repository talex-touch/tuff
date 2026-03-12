import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TuffIconImpl } from './tuff-icon'

const { pathExistsMock } = vi.hoisted(() => ({
  pathExistsMock: vi.fn()
}))

vi.mock('fs-extra', () => ({
  default: {
    pathExists: pathExistsMock
  }
}))

describe('TuffIconImpl dev source behavior', () => {
  beforeEach(() => {
    pathExistsMock.mockReset()
    pathExistsMock.mockResolvedValue(true)
  })

  it('falls back to local file when dev.source is false', async () => {
    const icon = new TuffIconImpl('/tmp/plugin', 'file', 'icons/logo.svg', {
      enable: true,
      source: false,
      address: 'http://localhost:3733'
    })

    await icon.init()

    expect(icon.type).toBe('file')
    expect(icon.value).toBe(path.resolve('/tmp/plugin', 'icons/logo.svg'))
    expect(pathExistsMock).toHaveBeenCalledTimes(1)
  })

  it('uses dev server URL only when dev.source is true', async () => {
    const icon = new TuffIconImpl('/tmp/plugin', 'file', 'icons/logo.svg', {
      enable: true,
      source: true,
      address: 'http://localhost:3733'
    })

    await icon.init()

    expect(icon.type).toBe('url')
    expect(icon.value).toBe('http://localhost:3733/icons/logo.svg')
    expect(pathExistsMock).not.toHaveBeenCalled()
  })
})
