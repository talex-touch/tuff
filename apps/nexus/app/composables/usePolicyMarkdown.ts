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
      // The prerendered static twin (`/api/content/policy/<name>/<locale>`): no Worker, no database.
      const response = await fetchContentApi<PolicyContentResponse>(`/api/content/policy/${baseName}/${normalizedLocale.value}`, {})
      return response.doc
    },
    { watch: [normalizedLocale] },
  )

  return { doc: data }
}
