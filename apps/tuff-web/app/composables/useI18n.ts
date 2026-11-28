import { useI18n as useVueI18n } from 'vue-i18n'

/**
 * Shared global vue-i18n composable auto-imported across `apps/tuff-web/app/`.
 * Reads directly from the statically inlined EN + ZH message catalogs (0 network fetches).
 */
export function useI18n() {
  return useVueI18n({ useScope: 'global' })
}
