interface AutoSizerActionApi {
  action?: (fn: () => void | Promise<void>) => Promise<void> | void
}

export function useAutoSizerAction() {
  const sizerRef = ref<AutoSizerActionApi | null>(null)

  const runWithAutoSizer = async (fn: () => void | Promise<void>) => {
    const api = sizerRef.value
    if (api?.action) {
      await api.action(fn)
      return
    }
    await fn()
  }

  return { sizerRef, runWithAutoSizer }
}
