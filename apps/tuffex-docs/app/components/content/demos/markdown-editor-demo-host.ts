import type { MarkdownEditorAi, MarkdownEditorAiAction, MarkdownEditorAiRequest, MarkdownEditorUploadImage } from '@talex-touch/tuffex/markdown-editor'

/**
 * What a host gives the editor, simulated so the demo runs offline and costs
 * nothing: an image CDN, and an AI that rewrites the selection. A real host
 * sends the file to its storage, or the request to its model, where these wait.
 */

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/** The picture as a data URL at most 640 px wide, so the demo document stays small. */
async function shrink(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 640 / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/webp', 0.82)
  }
  catch {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }
}

// A real host sends `file` to its storage here and resolves to the CDN address.
export const demoUploadImage: MarkdownEditorUploadImage = async (file, { onProgress, signal }) => {
  const url = await shrink(file)
  for (let percent = 0; percent < 100;) {
    await wait(120 + Math.random() * 180, signal)
    percent = Math.min(100, percent + 10 + Math.random() * 20)
    onProgress(Math.round(percent))
  }
  return { url, alt: file.name.replace(/\.[^.]+$/, '') }
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

type Rewrite = Exclude<MarkdownEditorAiAction, 'custom'> | 'list' | 'bold'

/** Answers written for the sample's paragraphs, by their Markdown. */
const WRITTEN: Record<string, Partial<Record<Rewrite, string>>> = {
  '这一版重写了 CoreBox 的搜索管线：==冷启动快了 38%==，索引的内存峰值降到<mark data-color="green">原来的一半</mark>。': {
    improve: '这一版彻底重写了 CoreBox 的搜索管线：==冷启动提速 38%==，建索引时的内存峰值也降到了<mark data-color="green">原来的一半</mark>。',
    shorten: '搜索管线重写后，CoreBox ==冷启动快了 38%==，索引内存减半。',
    expand: '这一版重写了 CoreBox 的搜索管线：==冷启动快了 38%==，索引的内存峰值降到<mark data-color="green">原来的一半</mark>。即使机器上有几十万个文件，CoreBox 也几乎一按就开；后台建索引时，其他应用也不再被拖慢。',
  },
  'This release rewrites the CoreBox search pipeline: ==cold start is 38% faster==, and indexing peaks at <mark data-color="green">half the memory</mark>.': {
    improve: 'This release rebuilds the CoreBox search pipeline from the ground up: ==cold start is 38% faster==, and indexing now peaks at <mark data-color="green">half the memory</mark>.',
    shorten: 'A rewritten search pipeline makes CoreBox ==38% faster to start== and halves its indexing memory.',
    expand: 'This release rewrites the CoreBox search pipeline: ==cold start is 38% faster==, and indexing peaks at <mark data-color="green">half the memory</mark>. Even with hundreds of thousands of files, CoreBox opens almost the moment you ask, and building the index in the background no longer slows other apps down.',
  },
  '感谢所有参与测试版的朋友，你们反馈的问题我们都认真的看过了，也让我们改的更快': {
    improve: '感谢每一位参与测试版的朋友：你们反馈的每个问题我们都认真看过，也正是这些反馈让我们改得更快。',
    shorten: '感谢测试版的朋友，你们的反馈让我们改得更快。',
  },
  'Thanks to everyone who tryed the beta — your feedback realy helped us ship this faster then we planned': {
    improve: 'Thank you to everyone who tried the beta: your feedback helped us ship this sooner than we planned.',
    shorten: 'Thanks, beta testers: you helped us ship early.',
  },
}

const HAN = /\p{Script=Han}/u

/** Slips of spelling and grammar, and their corrections. */
const SLIPS: [RegExp, string][] = [
  [/认真的(?=[看读听想对])/g, '认真地'],
  [/(?<=[改跑做写变])的(?=[更很太])/g, '得'],
  [/\btryed\b/g, 'tried'],
  [/\brealy\b/g, 'really'],
  [/\bteh\b/g, 'the'],
  [/\brecieve/g, 'receive'],
  [/\bseperate/g, 'separate'],
  [/\boccured\b/g, 'occurred'],
  [/\bwich\b/g, 'which'],
  [/\b(\w+er) then\b/g, '$1 than'],
  [/(?<=\S) {2,}(?=\S)/g, ' '],
  [/ +(?=[,.;:!?](?:\s|$))/g, ''],
]

/** Wordy phrases and filler, and what reads plainer. */
const PLAIN: [RegExp, string][] = [
  [/\bin order to\b/g, 'to'],
  [/\ba lot of\b/g, 'many'],
  [/\bis able to\b/g, 'can'],
  [/\bmake use of\b/g, 'use'],
  [/\b(?:really|very|just|quite|actually|basically) /gi, ''],
  [/(?:非常|真的|其实|基本上)(?=\p{Script=Han})/gu, ''],
]

/** What a custom instruction asks for, by its words; anything else is a polish. */
const ROUTES: [RegExp, Rewrite][] = [
  [/翻译|英文|中文|translate|english|chinese/i, 'translate'],
  [/错别字|拼写|语法|typo|spell|grammar/i, 'fix'],
  [/短|精简|简洁|short|concise|brief/i, 'shorten'],
  [/长|扩|详细|展开|long|expand|detail|elaborate/i, 'expand'],
  [/列表|要点|list|bullet/i, 'list'],
  [/加粗|粗体|强调|bold|emphasi/i, 'bold'],
]

/** Heading, quote, list and task markers at the start of a line. */
const MARKER = /^(?:\s*(?:#{1,6}|>|[-*+]|\d+\.)\s+)*(?:\[[ x]\]\s+)?/

function apply(text: string, rules: [RegExp, string][]): string {
  return rules.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text)
}

function closed(text: string): boolean {
  return /[。！？.!?]$/.test(text)
}

/** A whole plain paragraph left open at the end gets its full stop. */
function fix(text: string, { before, after }: MarkdownEditorAiRequest): string {
  const fixed = apply(text, SLIPS)
  const paragraph = /(?:^|\n\n)$/.test(before) && /^(?:\n|$)/.test(after) && !text.includes('\n')
  if (!paragraph || closed(fixed) || !/[\p{L}\p{N}]$/u.test(fixed))
    return fixed
  return fixed + (HAN.test(fixed) ? '。' : '.')
}

/** Filler out; when that is not enough, the first clause. */
function shorten(text: string): string {
  const plain = apply(text, [...SLIPS, ...PLAIN])
  if (plain.length < text.length * 0.9)
    return plain
  const clauses = plain.split(/(?<=[，,；;：:])\s*/)
  if (clauses.length < 2)
    return plain
  const first = clauses[0]!.replace(/[，,；;：:]$/, '')
  return first + (HAN.test(first) ? '。' : '.')
}

function expand(text: string): string {
  if (HAN.test(text))
    return closed(text) ? `${text}这样一来，日常使用时等待更少，操作也更顺手。` : `${text}，这样一来，日常使用时等待更少，操作也更顺手。`
  return closed(text) ? `${text} In everyday use, that means less waiting and a smoother flow.` : `${text}, so there is less waiting and everyday use feels smoother.`
}

/** `line` of the selection as the same line of the other sample: whole, or the text after its marker. */
function mapLine(line: string, source: string, target: string): string | null {
  if (line.trim() === source.trim())
    return target
  return line.trim() === source.replace(MARKER, '').trim() ? target.replace(MARKER, '') : null
}

/** The samples say the same thing line for line: a selection of whole lines, or of a line's text, translates to the other's. */
function translate(text: string, [zh, en]: readonly [string, string]): string {
  const toEnglish = HAN.test(text)
  const from = (toEnglish ? zh : en).split('\n')
  const to = (toEnglish ? en : zh).split('\n')
  const lines = text.split('\n')
  for (let start = 0; start + lines.length <= from.length; start++) {
    const mapped = lines.map((line, index) => mapLine(line, from[start + index]!, to[start + index]!))
    if (mapped.every(line => line !== null))
      return apply(mapped.join('\n'), SLIPS)
  }
  return text
}

function list(text: string): string {
  return text
    .split(HAN.test(text) ? /[，。；！？]/ : /(?<=[.!?;])\s+|,\s+/)
    .map(item => item.trim().replace(/[.;]$/, ''))
    .filter(Boolean)
    .map(item => `- ${item}`)
    .join('\n')
}

function answer(request: MarkdownEditorAiRequest, samples: readonly [string, string]): string {
  const { text } = request
  const action: Rewrite = request.action === 'custom'
    ? ROUTES.find(([pattern]) => pattern.test(request.instruction))?.[1] ?? 'improve'
    : request.action
  const written = WRITTEN[text.replace(/\s+/g, ' ').trim()]?.[action]
  if (written)
    return written
  switch (action) {
    case 'translate':
      return translate(text, samples)
    case 'fix':
      return fix(text, request)
    case 'shorten':
      return shorten(text)
    case 'expand':
      return expand(text)
    case 'list':
      return list(text)
    case 'bold':
      return `**${text.replace(/\*\*/g, '')}**`
    default:
      return apply(text, [...SLIPS, ...PLAIN])
  }
}

/** A word or two at a time, the way a model's tokens arrive. */
function pieces(text: string): string[] {
  const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map(part => part.segment)
  const out: string[] = []
  for (let index = 0; index < words.length; index += 2)
    out.push(words.slice(index, index + 2).join(''))
  return out
}

/**
 * Answers from rules and a few written replies, never a model: `samples` are
 * the demo's documents in Chinese and English, which translate into each other.
 */
export function createDemoAi(samples: () => readonly [zh: string, en: string]): MarkdownEditorAi {
  return async function* (request) {
    const text = answer(request, samples())
    // A moment to think, then the answer as it is written.
    await wait(700 + Math.random() * 500, request.signal)
    for (const piece of pieces(text)) {
      await wait(25 + Math.random() * 55, request.signal)
      yield piece
    }
  }
}
