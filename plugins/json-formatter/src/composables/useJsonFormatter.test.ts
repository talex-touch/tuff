import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyClipboardError,
  diffObjects,
  flattenObject,
  formatClipboardError,
  jsonToXml,
  sanitizeXmlTagName,
  smartParse,
  sortObjectKeys,
  useJsonFormatter,
} from './useJsonFormatter'

const clipboardMock = vi.hoisted(() => ({
  read: vi.fn(),
  writeText: vi.fn(),
}))

vi.mock('@talex-touch/utils/plugin/sdk/clipboard', () => ({
  useClipboard: () => clipboardMock,
}))

describe('useJsonFormatter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sanitizes invalid XML tag names and wraps arrays in a single root element', () => {
    expect(sanitizeXmlTagName('123 bad key')).toBe('_123_bad_key')
    expect(sanitizeXmlTagName('xmlHeader')).toBe('_xmlHeader')
    expect(sanitizeXmlTagName('a<b>c')).toBe('a_b_c')

    const xml = jsonToXml({ '1st key': 'a & b', 'bad<tag>': [1, 2] })
    expect(xml).toContain('<_1st_key>a &amp; b</_1st_key>')
    expect(xml).toContain('<bad_tag_>')
    expect(xml).toContain('<item>1</item>')
    expect(xml).toContain('<item>2</item>')

    const rootArrayXml = jsonToXml([1, 2], 'list')
    expect(rootArrayXml).toContain('<list>\n  <item>1</item>\n  <item>2</item>\n</list>')
  })

  it('parses standard JSON and JS object literals via smartParse', () => {
    expect(smartParse('{"a":1}')).toEqual({ data: { a: 1 }, isJsObject: false })
    expect(smartParse('{ a: \'hello\', nested: [1, 2,], }')).toEqual({
      data: { a: 'hello', nested: [1, 2] },
      isJsObject: true,
    })
  })

  it('sorts keys, flattens objects, and diffs nested structures', () => {
    expect(Object.keys(sortObjectKeys({ z: 1, a: 2, m: 3 }))).toEqual(['a', 'm', 'z'])
    expect(flattenObject({ a: { b: 1, c: [2, 3] } })).toEqual({ 'a.b': 1, 'a.c': [2, 3] })
    expect(diffObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
      { path: 'b', type: 'changed', oldValue: 2, newValue: 3 },
      { path: 'c', type: 'added', newValue: 4 },
    ])
  })

  it('guards unescapeJson against non-string JSON values', () => {
    const formatter = useJsonFormatter()

    formatter.inputJson.value = '"{\\"hello\\":\\"world\\"}"'
    formatter.unescapeJson()
    expect(formatter.isValidJson.value).toBe(true)
    expect(formatter.outputJson.value).toBe('{"hello":"world"}')

    formatter.inputJson.value = '{"not":"a string"}'
    formatter.unescapeJson()
    expect(formatter.isValidJson.value).toBe(false)
    expect(formatter.errorMessage.value).toContain('反转义失败')
    expect(typeof formatter.outputJson.value).toBe('string')

    formatter.dispose()
  })

  it('preserves swapped values with consumeSkipAutoExecute and supports diff mode + diffJson', () => {
    const formatter = useJsonFormatter()
    formatter.inputJson.value = '{"a": 1}'
    formatter.outputJson.value = '{"a": 2}'

    formatter.swapEditors()
    expect(formatter.inputJson.value).toBe('{"a": 2}')
    expect(formatter.outputJson.value).toBe('{"a": 1}')
    expect(formatter.consumeSkipAutoExecute()).toBe(true)
    expect(formatter.consumeSkipAutoExecute()).toBe(false)

    formatter.diffJson()
    expect(formatter.outputJson.value).toContain('~ a: 2 → 1')
    expect(formatter.isValidJson.value).toBe(true)

    // When both sides match outside diff mode, clicking diff enters diff mode so user can edit right pane
    formatter.inputJson.value = '{"x": 1}'
    formatter.outputJson.value = '{\n  "x": 1\n}'
    formatter.diffJson()
    expect(formatter.isDiffMode.value).toBe(true)

    formatter.dispose()
  })

  it('cancels previous toast timer when showNotification is called repeatedly and on dispose', () => {
    const formatter = useJsonFormatter()
    formatter.showNotification('first')
    vi.advanceTimersByTime(2000)
    formatter.showNotification('second')
    vi.advanceTimersByTime(2000)

    // Still visible because the first 3000ms timer was cancelled
    expect(formatter.showToast.value).toBe(true)
    expect(formatter.toastMessage.value).toBe('second')

    vi.advanceTimersByTime(1000)
    expect(formatter.showToast.value).toBe(false)

    formatter.showNotification('third')
    formatter.dispose()
    vi.advanceTimersByTime(5000)
    // Timer was cleared on dispose rather than firing after cleanup
    expect(formatter.showToast.value).toBe(true)
  })

  it('surfaces distinct clipboard permission denied vs unavailable messages', async () => {
    const formatter = useJsonFormatter()

    expect(classifyClipboardError({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' })).toBe('denied')
    expect(classifyClipboardError({ code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE' })).toBe('unavailable')
    expect(formatClipboardError(new Error('unknown'), 'write')).toContain('复制失败')

    clipboardMock.read.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' }),
    )
    await formatter.pasteFromClipboard()
    expect(formatter.toastType.value).toBe('error')
    expect(formatter.toastMessage.value).toContain('clipboard.read')

    clipboardMock.read.mockRejectedValueOnce(
      Object.assign(new Error('unavailable'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE' }),
    )
    await formatter.pasteFromClipboard()
    expect(formatter.toastMessage.value).toContain('权限服务暂不可用')

    clipboardMock.writeText.mockRejectedValueOnce(
      Object.assign(new Error('denied'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED' }),
    )
    await formatter.copyOutput()
    expect(formatter.toastMessage.value).toContain('clipboard.write')

    clipboardMock.writeText.mockRejectedValueOnce(
      Object.assign(new Error('unavailable'), { code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE' }),
    )
    await formatter.copyOutput()
    expect(formatter.toastMessage.value).toContain('权限服务暂不可用')

    formatter.dispose()
  })
})
