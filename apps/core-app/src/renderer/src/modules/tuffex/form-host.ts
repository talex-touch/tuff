import type { FormMessages, TxFormHost } from '@talex-touch/tuffex/form'
import type { AuthState } from '@talex-touch/utils/renderer'
import type { I18nInstance } from '~/modules/lang'
import { clearTxFormDrafts } from '@talex-touch/tuffex/form'
import { isMainWindow } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AuthEvents } from '@talex-touch/utils/transport/events'
import { shallowRef } from 'vue'
import { createRendererLogger } from '~/utils/renderer-log'

type Translate = (key: string, named: Record<string, unknown>, plural?: number) => string

const formHostLog = createRendererLogger('FormHost')

/**
 * TxForm's built-in text in the app's language. TxForm reads the getter inside a computed, so a
 * language switch reaches the forms already on screen.
 */
function createFormMessages(i18n: I18nInstance): () => FormMessages {
  // vue-i18n's `t` is a pile of overloads; this is the one shape used here.
  const translate = i18n.global.t as unknown as Translate
  const t = (key: string, named: Record<string, unknown> = {}, plural?: number): string =>
    plural === undefined ? translate(`form.${key}`, named) : translate(`form.${key}`, named, plural)
  const time = (savedAt: Date): string =>
    savedAt.toLocaleString(i18n.global.locale.value, { dateStyle: 'medium', timeStyle: 'short' })

  return () => ({
    field: t('field'),
    required: (label) => t('required', { label }),
    type: (label, type) => t(`type.${type}`, { label }),
    min: (label, min) => t('min', { label, min }),
    max: (label, max) => t('max', { label, max }),
    minLength: (label, min, unit) => t(`minLength.${unit}`, { label, min }, min),
    maxLength: (label, max, unit) => t(`maxLength.${unit}`, { label, max }, max),
    pattern: (label) => t('pattern', { label }),
    invalid: (label) => t('invalid', { label }),
    errorPrefix: t('errorPrefix'),
    warningPrefix: t('warningPrefix'),
    validating: t('validating'),
    optional: t('optional'),
    hint: (label) => t('hint', { label }),
    summaryTitle: t('summaryTitle'),
    draftRestored: (savedAt) => t('draftRestored', { time: time(savedAt) }),
    draftPending: (savedAt) => t('draftPending', { time: time(savedAt) }),
    draftRestore: t('draftRestore'),
    draftDiscard: t('draftDiscard'),
    leaveConfirm: t('leaveConfirm'),
    autosaved: t('autosaved'),
    autosaveFailed: t('autosaveFailed')
  })
}

type SessionState = Pick<AuthState, 'isLoaded' | 'isSignedIn' | 'user' | 'isSettled'>

/** `null` while it is not known: main has not loaded the session, or not checked it yet. */
function namespaceOf(state: SessionState | null | undefined): string | null {
  if (!state?.isLoaded) return null
  if (state.isSignedIn && state.user) return `user:${state.user.id}`
  // Signed out before the stored session was checked may still turn signed in.
  return state.isSettled ? 'anon' : null
}

function isAccount(namespace: string): boolean {
  return namespace.startsWith('user:')
}

/**
 * Whose drafts these are, so one account never finds what another typed, and what an account typed
 * goes with its session. `null` until main has checked the session: the forms keep no draft before
 * then.
 *
 * Main tells only the main window of a sign-in change. The main window listens from the start, and
 * each time the namespace is set it clears the drafts of every other account: at startup those of a
 * session that ended while the app was closed, later those of an account that signed out. Any other
 * window starts once a form asks, asks main again whenever it comes back to the front, and clears
 * the account it leaves.
 */
function createDraftNamespace(): () => string | null {
  const transport = useTuffTransport()
  const main = isMainWindow()
  const current = shallowRef<string | null>(null)
  let started = false
  /** Moves with every change main announces: an answer to an older question is out of date. */
  let announced = 0
  let asked = 0

  function settle(state: SessionState | null | undefined): void {
    const next = namespaceOf(state)
    const previous = current.value
    if (next === null || next === previous) return
    // Before the switch, so the forms still in a cleared namespace drop the write they were about to
    // make. Only main hears every change in order; another window clears no more than it leaves.
    if (main) {
      void clearTxFormDrafts({
        namespace: (namespace) => isAccount(namespace) && namespace !== next
      })
    } else if (previous !== null && isAccount(previous)) {
      void clearTxFormDrafts({ namespace: previous })
    }
    current.value = next
  }

  function ask(): void {
    const id = ++asked
    const since = announced
    transport
      .send(AuthEvents.session.getState)
      .then((state) => {
        if (id === asked && since === announced) settle(state)
      })
      .catch((error: unknown) => {
        formHostLog.warn('Cannot read the session, so forms keep no drafts', error)
      })
  }

  function start(): void {
    if (started) return
    started = true
    if (main) {
      transport.on(AuthEvents.session.stateChanged, (state) => {
        announced++
        settle(state)
      })
    } else {
      window.addEventListener('focus', ask)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') ask()
      })
    }
    ask()
  }

  if (main) start()

  return () => {
    start()
    return current.value
  }
}

/** What every TxForm in the app takes from its host: the app's language and the account's drafts. */
export function createCoreAppFormHost(i18n: I18nInstance): TxFormHost {
  return {
    messages: createFormMessages(i18n),
    namespace: createDraftNamespace()
  }
}
