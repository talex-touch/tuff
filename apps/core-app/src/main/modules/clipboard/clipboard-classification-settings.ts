export interface ClipboardClassificationSettings {
  verificationCodeRetentionMs: number
  protectSecrets: boolean
  customKeyPrefixes: readonly string[]
}

export const DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS: ClipboardClassificationSettings =
  Object.freeze({
    verificationCodeRetentionMs: 60 * 60 * 1000,
    protectSecrets: true,
    customKeyPrefixes: Object.freeze([]) as readonly string[]
  })

/**
 * 把用户设置里的剪贴板分类块收敛成可用的值。
 *
 * 逐字段校验而不是整块信任：配置文件是用户可编辑的，一个手改坏的
 * `verificationCodeRetentionMs` 不该让分类整个失效，退回默认值即可。
 *
 * 刻意不在这里读存储——采集和 stage-B 都在热路径上，而 storage 那个桶会把整个
 * transport（连同 `ipcMain`）一起拖进来，导致它们的测试连模块都加载不了。
 * 读取由持有 storage 的模块做，结果注入进来。
 */
export function resolveClipboardClassificationSettings(
  raw: unknown
): ClipboardClassificationSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS

  const clipboard = raw as {
    verificationCodeRetentionMs?: unknown
    protectSecrets?: unknown
    customKeyPrefixes?: unknown
  }
  const retentionMs = clipboard.verificationCodeRetentionMs
  const prefixes = clipboard.customKeyPrefixes

  return {
    verificationCodeRetentionMs:
      typeof retentionMs === 'number' && Number.isFinite(retentionMs) && retentionMs > 0
        ? retentionMs
        : DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS.verificationCodeRetentionMs,
    protectSecrets: clipboard.protectSecrets !== false,
    customKeyPrefixes: Array.isArray(prefixes)
      ? prefixes.filter(
          (prefix): prefix is string => typeof prefix === 'string' && prefix.length > 0
        )
      : DEFAULT_CLIPBOARD_CLASSIFICATION_SETTINGS.customKeyPrefixes
  }
}
