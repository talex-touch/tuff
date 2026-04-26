import { describe, expect, it } from 'vitest'
import { getLiveViewWebContents } from './web-contents-view-guard'

describe('getLiveViewWebContents', () => {
  it('returns null when the view has lost its webContents', () => {
    expect(getLiveViewWebContents({})).toBeNull()
  })

  it('returns null when webContents has already been destroyed', () => {
    const webContents = {
      isDestroyed: () => true
    }

    expect(getLiveViewWebContents({ webContents })).toBeNull()
  })

  it('returns live webContents when it is available', () => {
    const webContents = {
      isDestroyed: () => false
    }

    expect(getLiveViewWebContents({ webContents })).toBe(webContents)
  })
})
