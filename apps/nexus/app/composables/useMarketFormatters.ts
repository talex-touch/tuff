import { computed } from 'vue'

export function useMarketFormatters() {
  const { t, locale } = useI18n()

  const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
  const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
  const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

  function formatInstalls(count: number) {
    return numberFormatter.value.format(count)
  }

  function formatDate(value?: string | number | Date) {
    if (value === undefined || value === null || value === '')
      return '—'
    const parsed = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(parsed.getTime()))
      return String(value)
    return dateFormatter.value.format(parsed)
  }

  function formatPackageSize(bytes?: number) {
    if (!bytes || Number.isNaN(bytes))
      return t('market.detail.sizeUnknown', 'Size unknown')
    if (bytes >= 1024 * 1024)
      return `${(bytes / 1024 / 1024).toFixed(2)} MB`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return {
    localeTag,
    numberFormatter,
    dateFormatter,
    formatInstalls,
    formatDate,
    formatPackageSize,
  }
}
