import { computed } from 'vue'
import type { PolicyContentResponse } from '#shared/types/content-api'
import { fetchContentApi } from '~/utils/content-api-client'

function normalizeLocale(locale: string) {
  return locale.startsWith('zh') ? 'zh' : 'en'
}

export function usePolicyMarkdown(baseName: string) {
  const { locale } = useI18n()
  const normalizedLocale = computed(() => normalizeLocale(locale.value))
  const requestKey = computed(() => `policy:${baseName}:${normalizedLocale.value}`)

  const { data } = useAsyncData(
    () => requestKey.value,
    async () => {
      const response = await fetchContentApi<PolicyContentResponse>('/api/content/policy', {
        name: baseName,
        locale: normalizedLocale.value,
      })
      return response.doc
    },
    { watch: [normalizedLocale] },
  )

  return { doc: data }
}
