import { describe, expect, it } from 'vitest'
import {
  normalizeClipboardActionError,
  summarizeClipboardApplyPayload
} from './clipboard-action-diagnostics'

describe('clipboard-action-diagnostics', () => {
  it('maps macOS System Events permission failures to a user-readable action result', () => {
    const error = new Error('Command failed: osascript')
    Object.assign(error, {
      stderr: 'execution error: 未获得授权将Apple事件发送给System Events。 (-1743)'
    })

    expect(normalizeClipboardActionError(error)).toEqual({
      code: 'MACOS_AUTOMATION_PERMISSION_DENIED',
      message: '需要在“系统设置 -> 隐私与安全性 -> 自动化/辅助功能”允许 Tuff 控制 System Events。',
      originalError: error
    })
  })

  it('summarizes text payload diagnostics without raw clipboard content', () => {
    const summary = summarizeClipboardApplyPayload(
      {
        type: 'text',
        text: 'secret text',
        html: '<b>secret html</b>',
        hideCoreBox: true
      },
      'darwin'
    )

    expect(summary).toMatchObject({
      platform: 'darwin',
      type: 'text',
      textLength: 11,
      hasHtml: true,
      hideCoreBox: true
    })
    expect(JSON.stringify(summary)).not.toContain('secret')
  })

  it('summarizes file payload diagnostics with counts only', () => {
    const summary = summarizeClipboardApplyPayload(
      {
        type: 'files',
        files: ['/Users/demo/secret-a.txt', '/Users/demo/secret-b.txt']
      },
      'darwin'
    )

    expect(summary).toMatchObject({
      platform: 'darwin',
      type: 'files',
      fileCount: 2
    })
    expect(JSON.stringify(summary)).not.toContain('/Users/demo')
  })
})
