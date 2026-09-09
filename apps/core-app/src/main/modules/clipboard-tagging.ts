import type { ClipboardTag } from '@talex-touch/utils/clipboard'
import { classifyClipboardContent } from '@talex-touch/utils/clipboard'

export type { ClipboardTag }

/**
 * 内容分类的实现在 `@talex-touch/utils/clipboard`，主进程和剪贴板历史插件共用它。
 *
 * 这里曾经是一张独立的正则表，和插件那张各判各的：主进程在正文里搜子串，插件要求
 * 整条内容就是密钥。于是 `api_key: sk-xxx` 写在句子里时，主进程给它挂「API 密钥」
 * 标签，插件却把 key 明文渲染了出来。两侧现在读同一份判定。
 */
export function detectClipboardTags(payload: {
  type: 'text' | 'image' | 'files'
  content: string
  rawContent?: string | null
  sourceApp?: string | null
}): ClipboardTag[] {
  return classifyClipboardContent(payload).tags
}

/**
 * Search terms persist beside classification tags so a query can match a known software alias
 * even when the copied text used another spelling.
 */
export function getClipboardTagSearchTerms(tags: readonly ClipboardTag[]): string[] {
  const terms = new Set<string>(tags)
  if (tags.includes('wechat')) {
    terms.add('wx')
    terms.add('wechat')
    terms.add('微信')
  }
  return [...terms]
}
