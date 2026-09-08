import { ref, watch } from 'vue'
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk/storage'

const STORAGE_FILE = 'ui-state.json'
const WRITE_DEBOUNCE_MS = 200

type UiState = Record<string, boolean>

/**
 * 一个持久化到插件存储的布尔开关。
 *
 * `usePluginStorage()` 在插件上下文之外会抛（拿不到 plugin name / renderer channel），
 * 所以这里全程降级：拿不到存储就退回内存状态，组件照常可用，只是不跨会话保持。
 */
export function usePersistedFlag(key: string, fallback = false) {
  const expanded = ref(fallback)

  let storage: ReturnType<typeof usePluginStorage> | null = null
  try {
    storage = usePluginStorage()
  } catch {
    storage = null
  }

  if (storage) {
    void storage
      .getFile(STORAGE_FILE)
      .then((state: UiState | null) => {
        const stored = state?.[key]
        if (typeof stored === 'boolean') {
          expanded.value = stored
        }
      })
      .catch(() => {
        // 读不到就用默认值，不打扰用户。
      })
  }

  let writeTimer: ReturnType<typeof setTimeout> | null = null

  watch(expanded, next => {
    if (!storage) {
      return
    }

    if (writeTimer) {
      clearTimeout(writeTimer)
    }

    // 连点会产生一串 IPC，攒一下再写。
    writeTimer = setTimeout(() => {
      writeTimer = null
      void storage
        ?.getFile(STORAGE_FILE)
        .then((state: UiState | null) => storage?.setFile(STORAGE_FILE, { ...(state ?? {}), [key]: next }))
        .catch(() => {
          // 写不进去不影响当前会话的使用。
        })
    }, WRITE_DEBOUNCE_MS)
  })

  return expanded
}

/**
 * 折叠态。状态是全局一个而不是 per-item——用户展开过一次就说明想一直看到。
 */
export function useDisclosureState(key: string, fallback = false) {
  return usePersistedFlag(key, fallback)
}

/**
 * 主机 IP 是否掩码，默认开。
 *
 * 这个偏好属于插件而不是主进程的分类设置：被开关的掩码行为本身就只发生在插件侧，
 * 主进程不掩码自己的 CoreBox 预览。放进主进程的设置里，插件反而没有读取它的通道。
 */
export function useMaskHostIp() {
  return usePersistedFlag('maskHostIp', true)
}
