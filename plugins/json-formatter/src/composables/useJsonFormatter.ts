import { useClipboard } from '@talex-touch/utils/plugin/sdk/clipboard'
import { stringify as yamlStringify } from 'yaml'

export interface ParseResult {
  data: any
  isJsObject: boolean
}

/**
 * Smart parse - tries JSON.parse first, then safely evaluates JS object literals
 */
export function smartParse(text: string): ParseResult {
  // First try standard JSON
  try {
    return { data: JSON.parse(text), isJsObject: false }
  }
  catch {
    // Try to parse as JS object literal (safer than eval)
    try {
      let trimmed = text.trim()

      // Basic safety check: should start with { or [
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        throw new Error('Not a valid object literal')
      }

      // Check for dangerous patterns
      const dangerousPatterns = [
        /\bfunction\s*\(/,
        /\b(eval|setTimeout|setInterval|Function)\s*\(/,
        /\bimport\s*\(/,
        /\brequire\s*\(/,
        /\bfetch\s*\(/,
        /\bXMLHttpRequest\b/,
        /\bwindow\./,
        /\bdocument\./,
        /\bglobalThis\./,
        /=>/,
      ]

      for (const pattern of dangerousPatterns) {
        if (pattern.test(trimmed)) {
          throw new Error('Potentially unsafe code detected')
        }
      }

      // Convert undefined identifiers to strings
      const reservedWords = ['true', 'false', 'null', 'undefined']
      trimmed = trimmed.replace(
        /:\s*([A-Z_]\w*)\s*([,}\]])/gi,
        (match, identifier, ending) => {
          if (reservedWords.includes(identifier.toLowerCase())) {
            return match
          }
          return `: "${identifier}"${ending}`
        },
      )

      trimmed = trimmed.replace(
        /:\s*([A-Z_]\w*)\s*$/gim,
        (match, identifier) => {
          if (reservedWords.includes(identifier.toLowerCase())) {
            return match
          }
          return `: "${identifier}"`
        },
      )

      // eslint-disable-next-line no-new-func
      const fn = new Function(`"use strict"; return (${trimmed})`)
      const result = fn()

      if (result === null || (typeof result !== 'object')) {
        throw new Error('Result is not an object')
      }

      return { data: result, isJsObject: true }
    }
    catch (e: any) {
      throw new Error(e.message)
    }
  }
}

/**
 * Convert JSON to XML
 */
export function jsonToXml(obj: any, rootName = 'root'): string {
  function convert(data: any, name: string): string {
    if (data === null)
      return `<${name}/>`
    if (typeof data !== 'object')
      return `<${name}>${String(data).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' })[c] || c)}</${name}>`
    if (Array.isArray(data))
      return data.map(item => convert(item, 'item')).join('\n')
    return `<${name}>\n${Object.entries(data).map(([k, v]) => `  ${convert(v, k).split('\n').join('\n  ')}`).join('\n')}\n</${name}>`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${convert(obj, rootName)}`
}

/**
 * Sort object keys recursively
 */
export function sortObjectKeys(obj: any): any {
  if (Array.isArray(obj))
    return obj.map(sortObjectKeys)
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(obj[key])
      return acc
    }, {} as any)
  }
  return obj
}

/**
 * Flatten nested object
 */
export function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {}
  for (const key in obj) {
    const newKey = prefix ? `${prefix}.${key}` : key
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      Object.assign(result, flattenObject(obj[key], newKey))
    }
    else {
      result[newKey] = obj[key]
    }
  }
  return result
}

/**
 * Deep diff two objects
 */
export function diffObjects(obj1: any, obj2: any, path = ''): Array<{ path: string, type: 'added' | 'removed' | 'changed', oldValue?: any, newValue?: any }> {
  const diffs: Array<{ path: string, type: 'added' | 'removed' | 'changed', oldValue?: any, newValue?: any }> = []

  const keys1 = obj1 && typeof obj1 === 'object' ? Object.keys(obj1) : []
  const keys2 = obj2 && typeof obj2 === 'object' ? Object.keys(obj2) : []
  const allKeys = new Set([...keys1, ...keys2])

  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key
    const val1 = obj1?.[key]
    const val2 = obj2?.[key]

    if (!(key in (obj1 || {}))) {
      diffs.push({ path: currentPath, type: 'added', newValue: val2 })
    }
    else if (!(key in (obj2 || {}))) {
      diffs.push({ path: currentPath, type: 'removed', oldValue: val1 })
    }
    else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
      diffs.push(...diffObjects(val1, val2, currentPath))
    }
    else if (val1 !== val2) {
      diffs.push({ path: currentPath, type: 'changed', oldValue: val1, newValue: val2 })
    }
  }

  return diffs
}

export function useJsonFormatter() {
  const clipboard = useClipboard()
  const inputJson = ref('')
  const outputJson = ref('')
  const outputLanguage = ref<'json' | 'yaml' | 'xml'>('json')
  const queryExpression = ref('')
  const errorMessage = ref('')
  const isValidJson = ref(true)
  const showToast = ref(false)
  const toastMessage = ref('')
  const toastType = ref<'success' | 'error'>('success')

  function showNotification(message: string, type: 'success' | 'error' = 'success') {
    toastMessage.value = message
    toastType.value = type
    showToast.value = true
    setTimeout(() => {
      showToast.value = false
    }, 3000)
  }

  function formatJson() {
    try {
      const { data, isJsObject } = smartParse(inputJson.value)
      outputJson.value = JSON.stringify(data, null, 2)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      if (isJsObject) {
        showNotification('已自动识别 JS 对象并转换', 'success')
      }
    }
    catch (e: any) {
      errorMessage.value = `JSON 解析错误: ${e.message}`
      isValidJson.value = false
    }
  }

  function minifyJson() {
    try {
      const { data } = smartParse(inputJson.value)
      outputJson.value = JSON.stringify(data)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
    }
    catch (e: any) {
      errorMessage.value = `JSON 解析错误: ${e.message}`
      isValidJson.value = false
    }
  }

  function validateJson() {
    try {
      smartParse(inputJson.value)
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('JSON 有效')
    }
    catch (e: any) {
      errorMessage.value = `JSON 验证失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function executeQuery() {
    if (!queryExpression.value.trim()) {
      formatJson()
      return
    }

    try {
      const { data: parsed } = smartParse(inputJson.value)
      // eslint-disable-next-line no-new-func
      const fn = new Function('data', `with(data) { return ${queryExpression.value} }`)
      const result = fn({ this: parsed, ...parsed })
      outputJson.value = JSON.stringify(result, null, 2)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
    }
    catch (e: any) {
      errorMessage.value = `表达式执行错误: ${e.message}`
      isValidJson.value = false
    }
  }

  function toYaml() {
    try {
      const { data } = smartParse(inputJson.value)
      outputJson.value = yamlStringify(data)
      outputLanguage.value = 'yaml'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('已转换为 YAML')
    }
    catch (e: any) {
      errorMessage.value = `转换失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function toXml() {
    try {
      const { data } = smartParse(inputJson.value)
      outputJson.value = jsonToXml(data)
      outputLanguage.value = 'xml'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('已转换为 XML')
    }
    catch (e: any) {
      errorMessage.value = `转换失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function sortKeys() {
    try {
      const { data } = smartParse(inputJson.value)
      outputJson.value = JSON.stringify(sortObjectKeys(data), null, 2)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('Keys 已排序')
    }
    catch (e: any) {
      errorMessage.value = `排序失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function escapeJson() {
    try {
      outputJson.value = JSON.stringify(inputJson.value)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('已转义')
    }
    catch (e: any) {
      errorMessage.value = `转义失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function unescapeJson() {
    try {
      outputJson.value = JSON.parse(inputJson.value)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('已反转义')
    }
    catch (e: any) {
      errorMessage.value = `反转义失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function flattenJson() {
    try {
      const { data } = smartParse(inputJson.value)
      outputJson.value = JSON.stringify(flattenObject(data), null, 2)
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification('已扁平化')
    }
    catch (e: any) {
      errorMessage.value = `扁平化失败: ${e.message}`
      isValidJson.value = false
    }
  }

  function diffJson() {
    try {
      const { data: input } = smartParse(inputJson.value)
      const { data: output } = smartParse(outputJson.value)
      const diffs = diffObjects(input, output)

      if (diffs.length === 0) {
        showNotification('两个 JSON 完全相同')
        return
      }

      const diffResult = diffs.map((d) => {
        if (d.type === 'added')
          return `+ ${d.path}: ${JSON.stringify(d.newValue)}`
        if (d.type === 'removed')
          return `- ${d.path}: ${JSON.stringify(d.oldValue)}`
        return `~ ${d.path}: ${JSON.stringify(d.oldValue)} → ${JSON.stringify(d.newValue)}`
      }).join('\n')

      outputJson.value = `// 差异对比结果 (${diffs.length} 处不同)\n// + 新增  - 删除  ~ 修改\n\n${diffResult}`
      outputLanguage.value = 'json'
      errorMessage.value = ''
      isValidJson.value = true
      showNotification(`发现 ${diffs.length} 处差异`)
    }
    catch (e: any) {
      errorMessage.value = `对比失败: ${e.message}`
      isValidJson.value = false
    }
  }

  async function pasteFromClipboard() {
    try {
      const { text } = await clipboard.read()
      if (text) {
        inputJson.value = text
        showNotification('已粘贴')
      }
    }
    catch {
      showNotification('无法读取剪贴板，请使用 Ctrl+V', 'error')
    }
  }

  async function copyOutput() {
    try {
      await clipboard.writeText(outputJson.value)
      showNotification('已复制到剪贴板')
    }
    catch {
      // No `document.execCommand` fallback: it would write to the clipboard without passing
      // the plugin's `clipboard.write` permission gate, which is exactly what the gate exists
      // to prevent. A denied permission has to read as a failure, not as a silent success.
      showNotification('复制失败，请检查剪贴板权限', 'error')
    }
  }

  function swapEditors() {
    const temp = inputJson.value
    inputJson.value = outputJson.value
    outputJson.value = temp
    showNotification('已交换')
  }

  function clearAll() {
    inputJson.value = ''
    outputJson.value = ''
    queryExpression.value = ''
    errorMessage.value = ''
    isValidJson.value = true
    outputLanguage.value = 'json'
  }

  return {
    // State
    inputJson,
    outputJson,
    outputLanguage,
    queryExpression,
    errorMessage,
    isValidJson,
    showToast,
    toastMessage,
    toastType,

    // Methods
    showNotification,
    formatJson,
    minifyJson,
    validateJson,
    executeQuery,
    toYaml,
    toXml,
    sortKeys,
    escapeJson,
    unescapeJson,
    flattenJson,
    diffJson,
    pasteFromClipboard,
    copyOutput,
    swapEditors,
    clearAll,
  }
}
