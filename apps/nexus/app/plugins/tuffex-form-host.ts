import type { FormMessages } from '@talex-touch/tuffex/utils'
import { provideTxFormHost } from '@talex-touch/tuffex/utils'

type NexusI18n = ReturnType<typeof useNuxtApp>['$i18n']

/**
 * TxForm's built-in text in the page's language: validation messages, the screen-reader prefixes
 * and the draft notice. TxForm reads the getter inside a computed, so a language switch reaches the
 * forms on screen.
 *
 * The server ships only the messages its render read, and the rest of the locale arrives after
 * hydration. Reading the `form` namespace ships all of it with a page whose server render reads these
 * messages, so hydration and later validation find them; a form that reads them before the rest
 * arrives keeps TxForm's English until then instead of showing keys.
 */
function createFormMessages(i18n: NexusI18n): () => Partial<FormMessages> | undefined {
  const time = (savedAt: Date): string =>
    savedAt.toLocaleString(i18n.locale.value, { dateStyle: 'medium', timeStyle: 'short' })

  return () => {
    if (!Object.keys(i18n.tm('form')).length)
      return undefined
    const { t } = i18n
    return {
      field: t('form.field'),
      required: label => t('form.required', { label }),
      type: (label, type) => t(`form.type.${type}`, { label }),
      min: (label, min) => t('form.min', { label, min }),
      max: (label, max) => t('form.max', { label, max }),
      minLength: (label, min, unit) => t(`form.minLength.${unit}`, { label, min }, min),
      maxLength: (label, max, unit) => t(`form.maxLength.${unit}`, { label, max }, max),
      pattern: label => t('form.pattern', { label }),
      invalid: label => t('form.invalid', { label }),
      hint: label => t('form.hint', { label }),
      errorPrefix: t('form.errorPrefix'),
      warningPrefix: t('form.warningPrefix'),
      validating: t('form.validating'),
      optional: t('form.optional'),
      summaryTitle: t('form.summaryTitle'),
      draftRestored: savedAt => t('form.draftRestored', { time: time(savedAt) }),
      draftPending: savedAt => t('form.draftPending', { time: time(savedAt) }),
      draftRestore: t('form.draftRestore'),
      draftDiscard: t('form.draftDiscard'),
      leaveConfirm: t('form.leaveConfirm'),
      autosaved: t('form.autosaved'),
      autosaveFailed: t('form.autosaveFailed'),
    }
  }
}

export default defineNuxtPlugin({
  name: 'nexus:tuffex-form-host',
  dependsOn: ['i18n:plugin'],
  setup() {
    const nuxtApp = useNuxtApp()
    // From `utils`, which the entry already loads: importing it from `form` would put TxForm and
    // its stylesheets into every page.
    provideTxFormHost({ messages: createFormMessages(nuxtApp.$i18n) }, nuxtApp.vueApp)
  },
})
