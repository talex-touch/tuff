import type { PreviewAbilityResult, PreviewCardPayload } from '@talex-touch/utils'
import type { PreviewAbilityContext } from '../preview-ability'
import { performance } from 'node:perf_hooks'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BasePreviewAbility } from '../preview-ability'

dayjs.extend(duration)
dayjs.extend(relativeTime)

const RELATIVE_PATTERN = /^now\s*([+-])\s*([\w\s.]+)$/i
const RANGE_PATTERN =
  /^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)\s*-\s*(now|\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)$/i

const UNIT_MAP: Record<string, number> = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000
}

function parseRelative(value: string): number {
  let total = 0
  const regex = /([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z]+)/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(value)) !== null) {
    const amount = Number(match[1])
    const unit = match[2].toLowerCase()
    const factor = UNIT_MAP[unit]
    if (!factor || Number.isNaN(amount)) continue
    total += amount * factor
  }
  return total
}

const CN_UNIT_MAP: Record<string, number> = {
  秒: UNIT_MAP.second,
  分钟: UNIT_MAP.minute,
  分: UNIT_MAP.minute,
  小时: UNIT_MAP.hour,
  时: UNIT_MAP.hour,
  天: UNIT_MAP.day,
  日: UNIT_MAP.day,
  周: UNIT_MAP.week
}

function parseChineseRelative(text: string): number | null {
  const match = text.match(/^([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*(秒|分钟|[分时天日周]|小时)(后|前)?$/)
  if (!match) return null
  const [, amountRaw, unitRaw, direction] = match
  const factor = CN_UNIT_MAP[unitRaw]
  if (!factor) return null
  const amount = Number(amountRaw)
  if (Number.isNaN(amount)) return null
  const sign = direction === '前' ? -1 : 1
  return amount * factor * sign
}

function parseNaturalRelative(text: string): number | null {
  const lower = text.trim().toLowerCase()
  if (!lower) return null

  if (lower === 'tomorrow' || lower === '明天') return UNIT_MAP.day
  if (lower === 'yesterday' || lower === '昨天') return -UNIT_MAP.day
  if (lower === 'today' || lower === 'now' || lower === '今天') return 0

  const inMatch = lower.match(/^in\s+([\w\s.]+)$/)
  if (inMatch) {
    const offset = parseRelative(inMatch[1])
    return offset || null
  }

  const agoMatch = lower.match(/^([\w\s.]+)\s+(ago|before)$/)
  if (agoMatch) {
    const offset = parseRelative(agoMatch[1])
    return offset ? -offset : null
  }

  const laterMatch = lower.match(/^([\w\s.]+)\s+(later|after|from now)$/)
  if (laterMatch) {
    const offset = parseRelative(laterMatch[1])
    return offset || null
  }

  const cn = parseChineseRelative(text)
  if (cn !== null) return cn

  return null
}

function parseDurationValue(text: string): number | null {
  const lower = text.trim().toLowerCase()
  const regex = /^([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z]+)$/i
  const match = lower.match(regex)
  if (match) {
    const offset = parseRelative(lower)
    if (offset) return Math.abs(offset)
  }

  const cn = parseChineseRelative(text)
  if (cn !== null) {
    return Math.abs(cn)
  }

  const multiMatch = /(\d+)\s+[a-z]+/i.test(lower)
  if (multiMatch) {
    const offset = parseRelative(lower)
    if (offset) return Math.abs(offset)
  }

  return null
}

function parseAbsoluteDate(text: string): dayjs.Dayjs | null {
  const normalized = text.trim()
  if (!normalized) return null

  // 检查是否以 "date" 开头，如果是则移除前缀并降低限制
  const lower = normalized.toLowerCase()
  const hasDatePrefix = lower.startsWith('date ')
  const dateText = hasDatePrefix ? normalized.slice(5).trim() : normalized

  // 严格的日期格式验证（仅对非 date 前缀的输入）
  if (!hasDatePrefix) {
    // 只接受符合标准日期格式的输入
    const datePattern = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:[\sT]\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/

    // 检查自然语言映射
    const naturalMap: Record<string, number> = {
      tomorrow: 1,
      'day after tomorrow': 2,
      yesterday: -1,
      今天: 0,
      明天: 1,
      后天: 2,
      昨天: -1
    }

    const isNaturalLanguage = lower in naturalMap

    // 如果既不是标准格式也不是自然语言，直接返回 null
    if (!datePattern.test(normalized) && !isNaturalLanguage) {
      return null
    }
  }

  const formats = [
    'YYYY-MM-DD',
    'YYYY/MM/DD',
    'YYYY.MM.DD',
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DD HH:mm:ss',
    'YYYY/MM/DD HH:mm',
    'YYYY/MM/DD HH:mm:ss',
    'YYYY.MM.DD HH:mm',
    'YYYY.MM.DD HH:mm:ss'
  ]

  // 尝试解析标准格式
  const textToParse = hasDatePrefix ? dateText : normalized
  for (const format of formats) {
    const parsed = dayjs(textToParse, format, true)
    if (parsed.isValid()) return parsed
  }

  // 如果有 date 前缀，使用宽松的 dayjs 解析
  if (hasDatePrefix) {
    const parsed = dayjs(dateText)
    if (parsed.isValid()) return parsed
  }

  // 自然语言映射
  const naturalMap: Record<string, number> = {
    tomorrow: 1,
    'day after tomorrow': 2,
    yesterday: -1,
    今天: 0,
    明天: 1,
    后天: 2,
    昨天: -1
  }

  if (lower in naturalMap) {
    return dayjs().add(naturalMap[lower], 'day')
  }

  return null
}

function formatDuration(ms: number): string {
  const d = dayjs.duration(ms)
  const segments: string[] = []
  if (d.days()) segments.push(`${d.days()}天`)
  if (d.hours()) segments.push(`${d.hours()}小时`)
  if (d.minutes()) segments.push(`${d.minutes()}分钟`)
  if (segments.length === 0) segments.push(`${d.seconds()}秒`)
  return segments.join('')
}

export class TimeDeltaAbility extends BasePreviewAbility {
  readonly id = 'preview.time'
  readonly priority = 30

  override canHandle(query: { text?: string }): boolean {
    if (!query.text) return false
    return (
      RELATIVE_PATTERN.test(query.text) ||
      RANGE_PATTERN.test(query.text) ||
      parseNaturalRelative(query.text) !== null ||
      parseDurationValue(query.text) !== null ||
      parseAbsoluteDate(query.text) !== null
    )
  }

  async execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    const startedAt = performance.now()
    const text = this.getNormalizedQuery(context.query)

    const relativeMatch = text.match(RELATIVE_PATTERN)
    if (relativeMatch) {
      const [, operator, expression] = relativeMatch
      const offset = parseRelative(expression)
      const sign = operator === '-' ? -1 : 1
      const target = dayjs().add(sign * offset, 'millisecond')
      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '时间偏移',
        primaryLabel: '目标时间',
        primaryValue: target.format('YYYY-MM-DD HH:mm:ss'),
        secondaryLabel: '相对现在',
        secondaryValue: target.fromNow(),
        sections: [
          {
            rows: [
              { label: '偏移量', value: formatDuration(offset) },
              { label: 'ISO', value: target.toISOString() }
            ]
          }
        ]
      }
      return {
        abilityId: this.id,
        confidence: 0.8,
        payload,
        durationMs: performance.now() - startedAt
      }
    }

    const naturalOffset = parseNaturalRelative(text)
    if (naturalOffset !== null) {
      const target = dayjs().add(naturalOffset, 'millisecond')
      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '时间偏移',
        primaryLabel: '目标时间',
        primaryValue: target.format('YYYY-MM-DD HH:mm:ss'),
        secondaryLabel: '相对现在',
        secondaryValue: target.fromNow(),
        sections: [
          {
            rows: [
              { label: '偏移量', value: formatDuration(Math.abs(naturalOffset)) },
              { label: 'ISO', value: target.toISOString() }
            ]
          }
        ]
      }
      return {
        abilityId: this.id,
        confidence: 0.7,
        payload,
        durationMs: performance.now() - startedAt
      }
    }

    const durationValue = parseDurationValue(text)
    if (durationValue) {
      const hours = durationValue / (60 * 60 * 1000)
      const minutes = durationValue / (60 * 1000)
      const seconds = durationValue / 1000

      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '时长换算',
        primaryLabel: '总时长',
        primaryValue: formatDuration(durationValue),
        sections: [
          {
            rows: [
              { label: '小时', value: hours.toFixed(2) },
              { label: '分钟', value: minutes.toFixed(2) },
              { label: '秒', value: seconds.toFixed(2) }
            ]
          }
        ]
      }

      return {
        abilityId: this.id,
        confidence: 0.6,
        payload,
        durationMs: performance.now() - startedAt
      }
    }

    const absoluteDate = parseAbsoluteDate(text)
    if (absoluteDate) {
      const diff = Math.abs(absoluteDate.diff(dayjs()))
      const payload: PreviewCardPayload = {
        abilityId: this.id,
        title: text,
        subtitle: '日期差',
        primaryLabel: '距离现在',
        primaryValue: absoluteDate.fromNow(),
        secondaryLabel: '间隔',
        secondaryValue: formatDuration(diff),
        sections: [
          {
            rows: [
              { label: '目标日期', value: absoluteDate.format('YYYY-MM-DD HH:mm:ss') },
              { label: '毫秒', value: diff.toString() }
            ]
          }
        ]
      }

      return {
        abilityId: this.id,
        confidence: 0.7,
        payload,
        durationMs: performance.now() - startedAt
      }
    }

    const rangeMatch = text.match(RANGE_PATTERN)
    if (!rangeMatch) return null
    const [, startRaw, endRaw] = rangeMatch
    const start = startRaw.toLowerCase() === 'now' ? dayjs() : dayjs(startRaw)
    const end = endRaw.toLowerCase() === 'now' ? dayjs() : dayjs(endRaw)
    if (!start.isValid() || !end.isValid()) return null
    const diff = Math.abs(end.diff(start))

    const payload: PreviewCardPayload = {
      abilityId: this.id,
      title: text,
      subtitle: '时间差',
      primaryLabel: '间隔',
      primaryValue: formatDuration(diff),
      secondaryLabel: '毫秒',
      secondaryValue: diff.toString(),
      sections: [
        {
          rows: [
            { label: '起点', value: start.format('YYYY-MM-DD HH:mm:ss') },
            { label: '终点', value: end.format('YYYY-MM-DD HH:mm:ss') }
          ]
        }
      ]
    }

    return {
      abilityId: this.id,
      confidence: 0.75,
      payload,
      durationMs: performance.now() - startedAt
    }
  }
}
