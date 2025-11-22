import { computed, ComputedRef, Ref, unref } from 'vue'
import { useI18n } from 'vue-i18n'

type TimeSource = ComputedRef<number | null> | Ref<number | null>

export function useEstimatedCompletionText(source: TimeSource) {
  const { t } = useI18n()

  return computed(() => {
    const rawValue = unref(source)
    if (rawValue == null) {
      return null
    }

    const seconds = Math.max(0, Math.ceil(rawValue / 1000))
    if (seconds <= 5) {
      return t('settings.settingFileIndex.estimatedSoon')
    }

    if (seconds < 60) {
      return t('settings.settingFileIndex.estimatedSeconds', { seconds })
    }

    const minutes = Math.ceil(seconds / 60)
    if (minutes < 60) {
      return t('settings.settingFileIndex.estimatedMinutes', { minutes })
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (remainingMinutes) {
      return t('settings.settingFileIndex.estimatedHoursMinutes', {
        hours,
        minutes: remainingMinutes
      })
    }

    return t('settings.settingFileIndex.estimatedHours', { hours })
  })
}
