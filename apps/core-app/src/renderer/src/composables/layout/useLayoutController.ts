import { computed, type ComputedRef } from 'vue'
import type { Composer } from 'vue-i18n'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useApplicationUpgrade } from '~/modules/hooks/useUpdate'
import { resolveI18nLabel } from '~/utils/i18n-helpers'

/**
 * Shared layout controller logic for Flat and Simple layouts
 * @returns Route, translation function, and upgrade handler
 */
export function useLayoutController(): {
  route: RouteLocationNormalizedLoaded
  t: Composer['t']
  routeLabel: ComputedRef<string>
  handleUpgradeClick: () => void
} {
  const route = useRoute()
  const { t } = useI18n()
  const { checkApplicationUpgrade } = useApplicationUpgrade()
  const routeLabel = computed(() => {
    const name = route?.name
    const source = typeof name === 'string' ? name : (route?.path ?? '')
    return resolveI18nLabel(source, t)
  })

  function handleUpgradeClick() {
    void checkApplicationUpgrade()
  }

  return {
    route,
    t,
    routeLabel,
    handleUpgradeClick
  }
}
