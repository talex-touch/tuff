import { computed } from 'vue'

function normalizeLocale(locale: string) {
  return locale.startsWith('zh') ? 'zh' : 'en'
}

export function usePolicyMarkdown(baseName: string) {
  const { locale } = useI18n()
  const normalizedLocale = computed(() => normalizeLocale(locale.value))
  const basePath = computed(() => `/app/${baseName}`)
  const localizedPath = computed(() => `${basePath.value}.${normalizedLocale.value}`)
  const requestKey = computed(() => `policy:${baseName}:${normalizedLocale.value}`)

  const { data } = useAsyncData(
    () => requestKey.value,
    async () => {
      const localizedDoc = await queryCollection('app').path(localizedPath.value).first()
      if (localizedDoc)
        return localizedDoc
      return await queryCollection('app').path(basePath.value).first()
    },
    { watch: [localizedPath] },
  )

  return { doc: data }
}
