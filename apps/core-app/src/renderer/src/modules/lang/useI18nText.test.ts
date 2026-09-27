// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- The components declared here are mount harnesses
   for the translator (one with a composer, one without), not page components. */
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, type Plugin } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type * as PermissionRequestCardModule from '~/modules/permission/permission-request-card'
import type { Translate } from './useI18nText'
import enUS from './en-US.json'
import zhCN from './zh-CN.json'

/**
 * A key a loaded locale bundle carries must never reach a caller as a key.
 *
 * `plugin.permissions.startup.title` on screen is the defect this defends (#1982): the permission
 * gate reads its copy from a translator that used to give up and return the key. The composer
 * answers almost always, but it is out of reach in exactly the moments that matter — a transport
 * callback with no component around it, a window whose global i18n does not exist yet — and there
 * the imported locale bundles are the only source that always answers.
 *
 * Two of the states below are only reachable by controlling what is loaded: the bundles carry a
 * synthetic probe namespace whose two locales disagree, so "which bundle answered" is observable
 * without leaning on copy that someone may reword.
 */

type RendererLogger = Record<'debug' | 'info' | 'warn' | 'error', Mock>

const logState = vi.hoisted(() => ({
  /** Loggers by scope, so the *namespace* a line went through is part of the assertion. */
  loggers: new Map<string, RendererLogger>()
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: (scope: string) => {
    const logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
    logState.loggers.set(scope, logger)
    return logger
  }
}))

/**
 * The bundles stay real — every production key in them is what the tests below resolve — with one
 * namespace added that the two locales answer differently, so a test can say which one spoke.
 */
vi.mock('./en-US.json', async (importOriginal) => {
  const real = (await importOriginal()) as { default: Record<string, unknown> }
  return {
    default: {
      ...real.default,
      __i18nTextProbe: { both: 'EN-ACTIVE', onlyEn: 'EN-ONLY' }
    }
  }
})

vi.mock('./zh-CN.json', async (importOriginal) => {
  const real = (await importOriginal()) as { default: Record<string, unknown> }
  return {
    default: {
      ...real.default,
      __i18nTextProbe: { both: 'ZH-FALLBACK', onlyZh: 'ZH-ONLY' }
    }
  }
})

const permissionSdkState = vi.hoisted(() => ({
  startupHandler: undefined as ((request: unknown) => void) | undefined,
  onStartupRequest: vi.fn(),
  grantMultiple: vi.fn(),
  grantSession: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  usePermissionSdk: () => permissionSdkState
}))

/**
 * The `~/modules/lang` barrel pulls in the language follower, which pulls in the app storage
 * facade and the storage SDK behind it. This file is about translation, not storage; the same
 * stand-in the sibling `language-follow.test.ts` uses keeps that chain out of the way.
 */
vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: { lang: { locale: null, followSystem: false } },
  appSettingStore: {
    isHydrated: () => true,
    whenHydrated: () => Promise.resolve()
  }
}))

const cardState = vi.hoisted(() => ({ showPermissionRequestCard: vi.fn() }))

/**
 * The card's own identity helper is real (the install manager depends on it); only the prompt is
 * stubbed, so the copy handed to it is what is under assertion.
 */
vi.mock('~/modules/permission/permission-request-card', async (importOriginal) => ({
  ...(await importOriginal<typeof PermissionRequestCardModule>()),
  showPermissionRequestCard: cardState.showPermissionRequestCard
}))

type Bundle = Record<string, unknown>

const BUNDLES: Bundle[] = [enUS as Bundle, zhCN as Bundle]

const PERMISSIONS = {
  title: 'plugin.permissions.startup.title',
  requestMessage: 'plugin.permissions.startup.requestMessage',
  timeout: 'plugin.permissions.startup.timeout',
  deny: 'plugin.permissions.startup.actions.deny',
  session: 'plugin.permissions.startup.actions.session',
  always: 'plugin.permissions.startup.actions.always'
} as const

function readKey(bundle: Bundle, key: string): string | undefined {
  const value = key
    .split('.')
    .reduce<unknown>(
      (cursor, segment) =>
        cursor && typeof cursor === 'object'
          ? (cursor as Record<string, unknown>)[segment]
          : undefined,
      bundle
    )
  return typeof value === 'string' ? value : undefined
}

/**
 * Every text a loaded bundle carries for `key`, as the raw template — `{placeholders}` are not
 * filled, so a caller's text is compared through {@link fill}.
 */
function bundleTexts(key: string): string[] {
  return BUNDLES.map((bundle) => readKey(bundle, key)).filter(
    (value): value is string => value !== undefined
  )
}

function bundleText(bundle: Bundle, key: string): string {
  const value = readKey(bundle, key)
  if (value === undefined) throw new Error(`the bundle carries no "${key}"`)
  return value
}

/** `{placeholders}` filled the way vue-i18n writes them, for comparing against a caller's text. */
function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match)
}

/**
 * The message tree a probe composer carries: a nested bundle of strings, the shape a locale file
 * has. Written out rather than taken from vue-i18n's own recursive locale type, which a plain
 * `Record<string, unknown>` does not satisfy — and widening the tree would make the whole composer
 * untyped instead.
 */
type ProbeMessages = { [key: string]: string | ProbeMessages }

const wrappers: VueWrapper[] = []

/**
 * A component as the app builds one: the translator is asked during `setup`, and the composer it
 * gets is whatever the app-wide i18n plugin can see.
 *
 * `useI18nText` is imported per call rather than at the top: every test starts from
 * `vi.resetModules()`, and a static import would keep the first registry's `./i18n` module — with
 * its first `globalI18nInstance` — for the rest of the file, which is exactly the state these
 * tests vary.
 */
async function mountTranslator(messages: ProbeMessages): Promise<Translate> {
  const { useI18nText } = await import('./useI18nText')
  const appI18n = createI18n({
    legacy: false,
    locale: 'en-US',
    // A composer that cannot see the key is the premise here, so vue-i18n's own "not found" line
    // would only repeat what the test asserts.
    missingWarn: false,
    fallbackWarn: false,
    messages: { 'en-US': messages }
  })

  let captured: Translate | undefined
  const Probe = defineComponent({
    setup() {
      captured = useI18nText().t
      return () => h('div')
    }
  })

  const wrapper = mount(Probe, { global: { plugins: [appI18n as unknown as Plugin] } })
  wrappers.push(wrapper)
  if (!captured) throw new Error('the probe component never called useI18nText')
  return captured
}

beforeEach(() => {
  // A window that has not booted its i18n yet: fresh module state, so no global instance is left
  // over from another test.
  vi.resetModules()
  logState.loggers.clear()
  permissionSdkState.startupHandler = undefined
  permissionSdkState.onStartupRequest.mockReset()
  permissionSdkState.onStartupRequest.mockImplementation((handler: (request: unknown) => void) => {
    permissionSdkState.startupHandler = handler
    return () => {
      if (permissionSdkState.startupHandler === handler)
        permissionSdkState.startupHandler = undefined
    }
  })
  permissionSdkState.grantMultiple.mockReset()
  permissionSdkState.grantSession.mockReset()
  cardState.showPermissionRequestCard.mockReset()
  cardState.showPermissionRequestCard.mockImplementation(() => ({
    id: 'permission-card',
    result: Promise.resolve('deny')
  }))
})

afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount()
  wrappers.length = 0
})

describe('resolveLoadedMessageText', () => {
  it('prefers the active locale and falls to another loaded bundle when it lacks the key', async () => {
    const { setupI18n, setI18nLanguage, resolveLoadedMessageText } = await import('./i18n')
    const i18n = await setupI18n({ locale: 'en-US' })

    expect(resolveLoadedMessageText('__i18nTextProbe.both')).toBe('EN-ACTIVE')
    expect(resolveLoadedMessageText('__i18nTextProbe.onlyZh')).toBe('ZH-ONLY')

    // Positive control for the first assertion: an implementation that always started at en-US
    // would satisfy it and answer the wrong language after the user switches.
    setI18nLanguage(i18n, 'zh-CN')

    expect(resolveLoadedMessageText('__i18nTextProbe.both')).toBe('ZH-FALLBACK')
    expect(resolveLoadedMessageText('__i18nTextProbe.onlyEn')).toBe('EN-ONLY')
  })

  it('returns null for a key no loaded bundle carries, and for an empty key', async () => {
    const { resolveLoadedMessageText } = await import('./i18n')

    expect(resolveLoadedMessageText('__i18nTextProbe.__absent')).toBeNull()
    // An empty key is a caller mistake, not a message: resolving it to whatever the first bundle
    // holds under `''` would hand back arbitrary copy.
    expect(resolveLoadedMessageText('')).toBeNull()
  })

  it('fills placeholders from params, and keeps a placeholder no param answers', async () => {
    const { resolveLoadedMessageText } = await import('./i18n')

    const filled = resolveLoadedMessageText(PERMISSIONS.requestMessage, { name: 'json-formatter' })

    expect(filled).not.toContain('{name}')
    expect(filled).toContain('json-formatter')

    // Callers build params conditionally; a template with an unanswered placeholder is better on
    // screen than a message with the hole blanked out of it.
    const partial = resolveLoadedMessageText(PERMISSIONS.requestMessage, {})

    expect(partial).toContain('{name}')
  })
})

describe('useI18nText with no component instance and no global i18n', () => {
  it('answers from the loaded bundles so a raw key never reaches the caller', async () => {
    const { getGlobalI18nInstance } = await import('./i18n')
    const { useI18nText } = await import('./useI18nText')

    // The premise of the reported defect, asserted rather than assumed.
    expect(getGlobalI18nInstance()).toBeNull()

    const text = useI18nText().t(PERMISSIONS.requestMessage, { name: 'json-formatter' })
    const fromBundles = bundleTexts(PERMISSIONS.requestMessage).map((template) =>
      fill(template, { name: 'json-formatter' })
    )

    expect(text).not.toBe(PERMISSIONS.requestMessage)
    expect(fromBundles).toContain(text)
    expect(text).not.toContain('{name}')
    expect(text).toContain('json-formatter')
  })

  it('returns a key no bundle carries, and says so through the I18nText logger', async () => {
    const { useI18nText } = await import('./useI18nText')

    const unknown = 'plugin.permissions.startup.__no-such-message'
    expect(useI18nText().t(unknown)).toBe(unknown)

    // Reading a key off the screen is the defect, so the one case that still produces it has to
    // leave a trace naming the key — and under the namespace a reader would search for.
    const logger = logState.loggers.get('I18nText')

    expect(logger, 'no logger was created for the I18nText scope').toBeDefined()
    expect(logger?.warn).toHaveBeenCalledWith(expect.stringContaining(unknown))
  })
})

describe('useI18nText fallback', () => {
  it('uses the caller fallback only when no loaded bundle carries the key', async () => {
    const { useI18nText } = await import('./useI18nText')

    const fallback = vi.fn((key: string) => `FALLBACK:${key}`)
    const { t } = useI18nText(fallback)

    expect(t('__i18nTextProbe.__absent')).toBe('FALLBACK:__i18nTextProbe.__absent')
    // A fallback answered, so "no message for this key in any loaded locale" is not true. Read the
    // logger first: a missing one would make the assertion below pass for the wrong reason.
    const logger = logState.loggers.get('I18nText')
    expect(logger, 'no logger was created for the I18nText scope').toBeDefined()
    expect(logger?.warn).not.toHaveBeenCalled()
  })

  it('never lets a fallback stand in for a key a loaded bundle carries', async () => {
    const { useI18nText } = await import('./useI18nText')

    // Not a value either bundle holds, so seeing it means the fallback answered.
    const { t } = useI18nText(() => 'FALLBACK')

    const text = t(PERMISSIONS.title)

    expect(text).not.toBe('FALLBACK')
    expect(bundleTexts(PERMISSIONS.title)).toContain(text)
  })
})

describe('useI18nText inside a component', () => {
  it('lets the component composer answer when it carries the key', async () => {
    const t = await mountTranslator({
      plugin: { permissions: { startup: { title: 'COMPOSER-TITLE' } } }
    })

    // The bundle carries a different title for the same key; the composer is the nearer source.
    expect(t(PERMISSIONS.title)).toBe('COMPOSER-TITLE')
  })

  it('falls to the active locale bundle when the composer cannot see the key', async () => {
    const { setupI18n } = await import('./i18n')
    await setupI18n({ locale: 'en-US' })

    const t = await mountTranslator({})

    expect(t('__i18nTextProbe.both')).toBe('EN-ACTIVE')

    const text = t(PERMISSIONS.requestMessage, { name: 'json-formatter' })

    expect(text).toBe(
      fill(bundleText(BUNDLES[0], PERMISSIONS.requestMessage), { name: 'json-formatter' })
    )
  })
})

describe('usePermissionStartup permission card', () => {
  /**
   * The composable is imported per call for the same reason as `mountTranslator` above: whether a
   * global i18n instance exists is per-test module state.
   */
  async function openCardFor(request: {
    pluginId: string
    pluginName: string
    required: string[]
    reasons?: Record<string, string>
  }): Promise<PermissionRequestCardModule.PermissionRequestCardOptions> {
    const { usePermissionStartup } = await import('~/composables/usePermissionStartup')
    const appI18n = createI18n({
      legacy: false,
      locale: 'en-US',
      missingWarn: false,
      fallbackWarn: false,
      messages: { 'en-US': {} }
    })

    const Probe = defineComponent({
      setup() {
        usePermissionStartup()
        return () => h('div')
      }
    })

    const wrapper = mount(Probe, { global: { plugins: [appI18n as unknown as Plugin] } })
    wrappers.push(wrapper)

    expect(permissionSdkState.startupHandler, 'the gate never subscribed').toBeDefined()
    permissionSdkState.startupHandler?.(request)

    // The card opens inside the transport callback, before anything is awaited.
    expect(cardState.showPermissionRequestCard).toHaveBeenCalledTimes(1)
    return cardState.showPermissionRequestCard.mock
      .calls[0][0] as PermissionRequestCardModule.PermissionRequestCardOptions
  }

  const REQUEST = {
    pluginId: 'touch-demo',
    pluginName: 'json-formatter',
    required: ['fs.read'],
    reasons: { 'fs.read': 'read files' }
  }

  it('hands the card translated copy when no global i18n exists', async () => {
    const { getGlobalI18nInstance } = await import('./i18n')
    // The reported state: the gate is driven by a transport callback in a window whose global
    // i18n was never created, and the composer the component got cannot see these keys either.
    expect(getGlobalI18nInstance()).toBeNull()

    const options = await openCardFor(REQUEST)

    expect(options.title).not.toBe(PERMISSIONS.title)
    expect(bundleTexts(PERMISSIONS.title)).toContain(options.title)

    expect(options.message).not.toBe(PERMISSIONS.requestMessage)
    expect(
      bundleTexts(PERMISSIONS.requestMessage).map((template) =>
        fill(template, { name: 'json-formatter' })
      )
    ).toContain(options.message)
    expect(options.message).toContain('json-formatter')
    expect(options.message).not.toContain('{name}')

    const expectedTimeouts = bundleTexts(PERMISSIONS.timeout).map((template) =>
      fill(template, { seconds: '120' })
    )
    expect(expectedTimeouts).toContain(options.timeoutText)

    expect(bundleTexts(PERMISSIONS.deny)).toContain(options.actionLabels.deny)
    expect(bundleTexts(PERMISSIONS.session)).toContain(options.actionLabels.session)
    expect(bundleTexts(PERMISSIONS.always)).toContain(options.actionLabels.always)
  })

  it('hands the card the active locale copy a booted window would show', async () => {
    const { setupI18n } = await import('./i18n')
    await setupI18n({ locale: 'en-US' })

    const options = await openCardFor(REQUEST)
    const enUSCopy = (key: string): string => bundleText(BUNDLES[0], key)

    expect(options.title).toBe(enUSCopy(PERMISSIONS.title))
    expect(options.message).toBe(
      fill(enUSCopy(PERMISSIONS.requestMessage), { name: 'json-formatter' })
    )
    expect(options.timeoutText).toBe(fill(enUSCopy(PERMISSIONS.timeout), { seconds: '120' }))
    expect(options.actionLabels).toEqual({
      deny: enUSCopy(PERMISSIONS.deny),
      session: enUSCopy(PERMISSIONS.session),
      always: enUSCopy(PERMISSIONS.always)
    })
  })
})
