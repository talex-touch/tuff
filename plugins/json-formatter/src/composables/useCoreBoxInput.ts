import { onCoreBoxInputChange, useBox } from '@talex-touch/utils/plugin/sdk'
import { onBeforeUnmount, onMounted } from 'vue'

function extractText(data: any): string {
  const payload = data?.data ?? data
  if (typeof payload?.query?.text === 'string')
    return payload.query.text
  if (typeof payload?.input === 'string')
    return payload.input

  const inputs = Array.isArray(payload?.inputs)
    ? payload.inputs
    : Array.isArray(payload?.query?.inputs)
      ? payload.query.inputs
      : []

  return inputs
    .map((item: any) => (typeof item?.text === 'string' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * 订阅 CoreBox 输入并用 Bridge 缓存回放恢复激活前的完整查询。
 */
export function useCoreBoxInput(onInput: (text: string) => void): void {
  const box = useBox()
  let active = true
  let bridgeInputSeen = false
  let inputGeneration = 0

  const applyInput = (text: string): void => {
    inputGeneration += 1
    onInput(text)
  }

  onCoreBoxInputChange((data: any) => {
    if (!active)
      return
    bridgeInputSeen = true
    applyInput(extractText(data))
  })

  onMounted(() => {
    const initialGeneration = inputGeneration
    void box.getInput()
      .then((text) => {
        if (active && !bridgeInputSeen && inputGeneration === initialGeneration) {
          onInput(text)
        }
      })
      .catch((error) => {
        console.warn('[useCoreBoxInput] Initial input read failed:', error)
      })
  })

  onBeforeUnmount(() => {
    active = false
  })
}

/**
 * 请求 CoreBox 使用最大展开高度展示编辑器界面。
 */
export async function forceMaxCoreBox(): Promise<void> {
  try {
    await useBox().expand({ forceMax: true })
  }
  catch (error) {
    console.warn('[useCoreBoxInput] Expand failed:', error)
  }
}
