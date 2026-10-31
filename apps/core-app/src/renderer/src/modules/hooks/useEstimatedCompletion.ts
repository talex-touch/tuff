import type { ComputedRef, Ref } from 'vue'
import { computed, unref } from 'vue'
import { useI18n } from 'vue-i18n'

type TimeSource = ComputedRef<number | null> | Ref<number | null>
type EstimateStatusSource = ComputedRef<string | null | undefined> | Ref<string | null | undefined>

export function useEstimatedCompletionText(
  source: TimeSource,
  statusSource?: EstimateStatusSource
) {
  const { t } = useI18n()

  return computed(() => {
    const status = statusSource ? unref(statusSource) : undefined
    const rawValue = unref(source)
    if (rawValue == null) {
      if (status === 'stabilizing') {
        return t('settings.settingFileIndex.estimatedStabilizing')
      }
      if (status === 'stalled') {
        return t('settings.settingFileIndex.estimatedStalled')
      }
      return null
    }

    const seconds = Math.max(0, Math.ceil(rawValue / 1000))
    if (seconds <= 5) {
      return t('settings.settingFileIndex.estimatedSoon')
    }

    if (seconds < 60) {
      return t('settings.settingFileIndex.estimatedSeconds', { seconds })
    }

    // The count is passed again as the plural choice: the placeholders aren't named `count`.
    const minutes = Math.ceil(seconds / 60)
    if (minutes < 60) {
      return t('settings.settingFileIndex.estimatedMinutes', { minutes }, minutes)
    }

    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60

    if (remainingMinutes) {
      return t('settings.settingFileIndex.estimatedHoursMinutes', {
        hours: t('settings.settingFileIndex.estimatedHourCount', { count: hours }),
        minutes: t('settings.settingFileIndex.estimatedMinuteCount', { count: remainingMinutes })
      })
    }

    return t('settings.settingFileIndex.estimatedHours', { hours }, hours)
  })
}
