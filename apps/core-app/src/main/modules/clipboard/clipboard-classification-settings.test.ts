import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS,
  resolveClipboardClassificationSettings
} from './clipboard-classification-settings'

describe('clipboard classification settings', () => {
  it('reads a well-formed settings block', () => {
    expect(
      resolveClipboardClassificationSettings({
        verificationCodeRetentionMs: 15 * 60_000,
        protectSecrets: false,
        customKeyPrefixes: ['cr_', 'zz-']
      })
    ).toEqual({
      verificationCodeRetentionMs: 15 * 60_000,
      protectSecrets: false,
      customKeyPrefixes: ['cr_', 'zz-']
    })
  })

  /**
   * 配置文件是用户可编辑的。一个手改坏的字段不该让分类整个失效——尤其
   * `protectSecrets`：读不出来时必须偏向"保护"，否则一次配置手误就能让密钥开始过期。
   */
  it.each([
    [{ verificationCodeRetentionMs: 'soon' }, 'verificationCodeRetentionMs'],
    [{ verificationCodeRetentionMs: -1 }, 'verificationCodeRetentionMs'],
    [{ verificationCodeRetentionMs: Number.NaN }, 'verificationCodeRetentionMs'],
    [{ customKeyPrefixes: 'cr_' }, 'customKeyPrefixes'],
    [{ customKeyPrefixes: [1, null, ''] }, 'customKeyPrefixes'],
    [{}, 'empty'],
    [null, 'null'],
    ['nonsense', 'string']
  ])('falls back to defaults for a broken %s', (raw) => {
    const resolved = resolveClipboardClassificationSettings(raw)
    expect(resolved.verificationCodeRetentionMs).toBe(
      DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS.verificationCodeRetentionMs
    )
    expect(resolved.customKeyPrefixes).toEqual([])
    expect(resolved.protectSecrets).toBe(true)
  })

  it('only turns secret protection off for an explicit false', () => {
    expect(resolveClipboardClassificationSettings({ protectSecrets: false }).protectSecrets).toBe(
      false
    )
    for (const value of [undefined, null, 0, '', 'false']) {
      expect(
        resolveClipboardClassificationSettings({ protectSecrets: value }).protectSecrets,
        `${String(value)} should not disable protection`
      ).toBe(true)
    }
  })

  it('drops non-string prefixes rather than passing them to the classifier', () => {
    expect(
      resolveClipboardClassificationSettings({ customKeyPrefixes: ['cr_', 42, '', null, 'ok-'] })
        .customKeyPrefixes
    ).toEqual(['cr_', 'ok-'])
  })
})
