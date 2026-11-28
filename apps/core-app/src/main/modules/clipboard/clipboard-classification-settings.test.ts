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
        protectSecrets: true,
        customKeyPrefixes: ['cr_', 'zz-']
      })
    ).toEqual({
      verificationCodeRetentionMs: 15 * 60_000,
      protectSecrets: true,
      customKeyPrefixes: ['cr_', 'zz-']
    })
  })

  /**
   * 配置文件是用户可编辑的。未显式开启 `protectSecrets: true` 时默认不永久保留明文密钥，
   * 避免凭据在未加密 SQLite 中无限期滞留。
   */
  it.each<[unknown, string]>([
    [{ verificationCodeRetentionMs: 'soon' }, 'verificationCodeRetentionMs'],
    [{ verificationCodeRetentionMs: -1 }, 'verificationCodeRetentionMs'],
    [{ verificationCodeRetentionMs: Number.NaN }, 'verificationCodeRetentionMs'],
    [{ customKeyPrefixes: 'cr_' }, 'customKeyPrefixes'],
    [{ customKeyPrefixes: [1, null, ''] }, 'customKeyPrefixes'],
    [{}, 'empty'],
    [null, 'null'],
    ['nonsense', 'string']
  ])('falls back to safe defaults for a broken %s', (raw) => {
    const resolved = resolveClipboardClassificationSettings(raw)
    expect(resolved.verificationCodeRetentionMs).toBe(
      DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS.verificationCodeRetentionMs
    )
    expect(resolved.customKeyPrefixes).toEqual([])
    expect(resolved.protectSecrets).toBe(false)
  })

  it('only enables secret retention protection for an explicit true', () => {
    expect(resolveClipboardClassificationSettings({ protectSecrets: true }).protectSecrets).toBe(
      true
    )
    for (const value of [undefined, null, 0, 1, '', 'true', false]) {
      expect(
        resolveClipboardClassificationSettings({ protectSecrets: value }).protectSecrets,
        `${String(value)} should not enable permanent plaintext secret retention`
      ).toBe(false)
    }
  })

  it('drops non-string prefixes rather than passing them to the classifier', () => {
    expect(
      resolveClipboardClassificationSettings({ customKeyPrefixes: ['cr_', 42, '', null, 'ok-'] })
        .customKeyPrefixes
    ).toEqual(['cr_', 'ok-'])
  })
})
