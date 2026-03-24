import { describe, expect, it } from 'vitest'
import { resolveUiThreshold } from './perf-monitor-config'

describe('perf-monitor-config', () => {
  it('ui.route.render 使用专用阈值', () => {
    expect(resolveUiThreshold('ui.route.render')).toEqual({ warn: 350, error: 1500 })
  })

  it('未知 ui kind 回退默认阈值', () => {
    expect(resolveUiThreshold('ui.unknown.metric')).toEqual({ warn: 250, error: 1500 })
  })
})
