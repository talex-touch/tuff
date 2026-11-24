import { useBox, useFeature } from '@talex-touch/utils/plugin/sdk'
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * 订阅 CoreBox 输入并用 Bridge 缓存回放恢复激活前的完整查询。
 */
export function useCoreBoxInput(onInput: (text: string) => void): void {
  const box = useBox()
  const feature = useFeature()
  let active = true
  let bridgeInputSeen = false
  let inputGeneration = 0

  const applyInput = (text: string): void => {
    inputGeneration += 1
    onInput(text)
  }

  const unsubscribeInput = feature.onInputChange((input: string) => {
    if (!active)
      return
    bridgeInputSeen = true
    applyInput(input)
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
    unsubscribeInput()
    feature.dispose()
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
