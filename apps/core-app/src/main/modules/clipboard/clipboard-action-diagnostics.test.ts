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
      message:
        '自动粘贴失败：需要在“系统设置 -> 隐私与安全性 -> 自动化”中允许 Tuff 控制 System Events。',
      originalError: error
    })
  })

  it('preserves raw command errors unless an auto-paste fallback is provided', () => {
    const error = new Error('Command failed: osascript')

    expect(normalizeClipboardActionError(error)).toEqual({
      code: 'AUTO_PASTE_FAILED',
      message: 'Command failed: osascript',
      originalError: error
    })
  })

  it('uses a safe generic auto-paste message when provided by the caller', () => {
    const error = new Error('Command failed: osascript')

    expect(
      normalizeClipboardActionError(
        error,
        '已写入剪贴板，但自动粘贴失败。请确认目标应用仍在前台，或手动按 Cmd/Ctrl+V。'
      )
    ).toEqual({
      code: 'AUTO_PASTE_FAILED',
      message: '已写入剪贴板，但自动粘贴失败。请确认目标应用仍在前台，或手动按 Cmd/Ctrl+V。',
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
