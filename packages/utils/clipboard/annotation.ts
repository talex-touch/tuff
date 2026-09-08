/**
 * 用户给剪贴记录写的备注和标签。
 *
 * 和分类器产出的 `tags` 是两回事：那份每次捕获都会重算，用户写的东西放进去会被下一次
 * 分类静默覆盖。这里的东西只有用户能改。
 *
 * 归一化放在共享包里，是因为写入的一侧（主进程）和显示的一侧（插件）都要知道同一套上限。
 * 只在主进程裁剪的话，插件的输入框会让人写完 300 个字符再默默截掉一半。
 */

/** 备注上限。够写清「哪个项目的 key」，又不至于把剪贴板历史变成笔记应用。 */
export const CLIPBOARD_NOTE_MAX_LENGTH = 200

/** 单个标签上限。 */
export const CLIPBOARD_TAG_MAX_LENGTH = 24

/** 一条记录最多几个标签。 */
export const CLIPBOARD_TAGS_MAX_COUNT = 12

/** metadata JSON 里的键名，与 `image_original_url` 等既有键保持同一套蛇形命名。 */
export const CLIPBOARD_NOTE_METADATA_KEY = 'user_note'
export const CLIPBOARD_TAGS_METADATA_KEY = 'user_tags'

export interface ClipboardAnnotation {
  note: string | null
  tags: string[]
}

/**
 * 备注归一化：去首尾空白、把换行压成空格、截到上限，空串等于没有。
 *
 * 压换行是因为备注在列表和摘要里是单行渲染的，留着换行只会让一条记录在某些位置显示成
 * 半句话。
 */
export function normalizeClipboardNote(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const collapsed = input.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  return collapsed.slice(0, CLIPBOARD_NOTE_MAX_LENGTH)
}

/**
 * 标签归一化：逐个去空白、丢空值、按不区分大小写去重、截断数量。
 *
 * 去重保留先出现的那个写法。用户先打了 `Prod` 再打 `prod`，留下的是他自己第一次写的形态，
 * 而不是被后来的输入改写。
 */
export function normalizeClipboardTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, CLIPBOARD_TAG_MAX_LENGTH)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= CLIPBOARD_TAGS_MAX_COUNT) break
  }
  return tags
}

/** 从一条记录的 metadata 对象里读出用户标注。 */
export function readClipboardAnnotation(
  meta: Record<string, unknown> | null | undefined,
): ClipboardAnnotation {
  return {
    note: normalizeClipboardNote(meta?.[CLIPBOARD_NOTE_METADATA_KEY]),
    tags: normalizeClipboardTags(meta?.[CLIPBOARD_TAGS_METADATA_KEY]),
  }
}
