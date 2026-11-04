import type { App, InjectionKey, MaybeRefOrGetter } from 'vue'
import { provide } from 'vue'

/*
 * How a host hands every form its language, its drafts' owner and its leave
 * prompt. It lives here, outside `form/`, so an app can provide it once at
 * startup without loading the form, which usually arrives later with a page.
 */

export type FormRuleType = 'email' | 'url' | 'number' | 'integer'

/** Built-in text. TuffEx has no i18n, so a host passes its language through a form's `messages` or `provideTxFormHost()`. */
export interface FormMessages {
  /** Stands in for the label when an item has neither `label` nor `prop`. */
  field: string
  required: (label: string) => string
  type: (label: string, type: FormRuleType) => string
  min: (label: string, min: number) => string
  max: (label: string, max: number) => string
  minLength: (label: string, min: number, unit: 'characters' | 'items') => string
  maxLength: (label: string, max: number, unit: 'characters' | 'items') => string
  pattern: (label: string) => string
  /** A validator returned `false`, or threw. */
  invalid: (label: string) => string
  /** Read before an error; hidden on screen. */
  errorPrefix: string
  /** Read before a warning; hidden on screen. */
  warningPrefix: string
  /** Under a field whose asynchronous check has run for over a second. */
  validating: string
  /** After optional labels when `requiredMark` is `optional`. */
  optional: string
  /** Accessible name of a field's `?` button, which opens its `hint`. */
  hint: (label: string) => string
  /** Heading of `TxFormErrorSummary`. */
  summaryTitle: string
  /** Above the form once a draft has filled it in. */
  draftRestored: (savedAt: Date) => string
  /** Above the form while a draft waits for the user to restore or discard it. */
  draftPending: (savedAt: Date) => string
  draftRestore: string
  draftDiscard: string
  /** Asked through `window.confirm` before leaving with changes no draft holds, when nothing else asks. */
  leaveConfirm: string
  /** Read once an autosave went through; hidden on screen. */
  autosaved: string
  /** Read when an autosave failed and no message on screen says why; hidden on screen. */
  autosaveFailed: string
}

/** A store for drafts. Any method may return a promise. */
export interface FormDraftAdapter {
  get: (key: string) => string | null | undefined | Promise<string | null | undefined>
  /** Throw or reject when the value was not stored, so the form can keep it in memory instead. */
  set: (key: string, value: string) => void | Promise<void>
  remove: (key: string) => void | Promise<void>
  /** Removes every key that starts with `prefix`. `clearTxFormDrafts()` needs it. */
  clear?: (prefix: string) => void | Promise<void>
  /** The keys that start with `prefix`. `clearTxFormDrafts()` needs it to pick namespaces with a function. */
  keys?: (prefix: string) => string[] | Promise<string[]>
}

/**
 * Where drafts are kept. `local` survives restarts, `session` lasts as long
 * as the tab, and `memory` as long as the page: it outlives a closed dialog
 * or a route change, not a reload.
 */
export type FormDraftStorage = 'local' | 'session' | 'memory' | FormDraftAdapter

export interface FormLeaveField {
  path: string
  label: string
}

export interface FormLeaveContext {
  /** Changed fields no draft holds: secrets and excluded paths, or every change when the form keeps no draft. */
  unsaved: FormLeaveField[]
  /** The other changes are in the draft and come back with the form. */
  persisted: boolean
}

/** Resolve `true` to leave. */
export type FormLeaveConfirm = (context: FormLeaveContext) => boolean | Promise<boolean>

export interface TxFormHost {
  /** Built-in text in the host's language. A ref or getter follows locale switches. */
  messages?: MaybeRefOrGetter<Partial<FormMessages> | undefined>
  /**
   * Whose drafts these are: `user:42`. A ref or getter follows sign-in changes.
   * `null` while that is not known yet, as before the session has loaded: the
   * forms keep no draft until it is.
   */
  namespace?: MaybeRefOrGetter<string | null | undefined>
  /** Where drafts go when `persist.storage` does not say. */
  storage?: FormDraftStorage
  /** Asks before leaving, for every form below that has no `leaveConfirm` of its own. */
  leaveConfirm?: FormLeaveConfirm
}

export const TX_FORM_HOST_KEY: InjectionKey<TxFormHost> = Symbol('TxFormHost')

/**
 * Hands every form below — or in the whole app, given `app` — the host's
 * language for built-in messages. Call it in a component's `setup`.
 */
export function provideTxFormHost(host: TxFormHost, app?: App): void {
  if (app)
    app.provide(TX_FORM_HOST_KEY, host)
  else
    provide(TX_FORM_HOST_KEY, host)
}
