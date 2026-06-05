// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { UiPreferenceStorage } from './ui-preference-storage'

describe('UiPreferenceStorage', () => {
  const storage = new UiPreferenceStorage()

  afterEach(() => {
    window.localStorage.clear()
  })

  it('stores non-sensitive UI state as JSON', () => {
    storage.setJson('plugin-widget-preview-size:test', { width: 320, height: 240 })

    expect(storage.getJson('plugin-widget-preview-size:test')).toEqual({
      width: 320,
      height: 240
    })
  })

  it('returns null for invalid JSON and supports removal', () => {
    window.localStorage.setItem('bad-ui-state', '{')

    expect(storage.getJson('bad-ui-state')).toBeNull()

    storage.setJson('tuff-block-storage-demo', { expand: false })
    storage.remove('tuff-block-storage-demo')

    expect(window.localStorage.getItem('tuff-block-storage-demo')).toBeNull()
  })
})
