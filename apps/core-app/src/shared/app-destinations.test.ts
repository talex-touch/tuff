import type { AppDestinationId } from './app-destinations'
import { fileURLToPath } from 'node:url'
import riIcons from '@iconify-json/ri/icons.json'
import { describe, expect, it } from 'vitest'
import unoConfig from '../../uno.config'
import enUS from '../renderer/src/modules/lang/en-US.json'
import zhCN from '../renderer/src/modules/lang/zh-CN.json'
import {
  APP_DESTINATION_ICON_CLASSES,
  APP_DESTINATIONS,
  COMMON_SETTING_DESTINATION_IDS,
  getAppDestination,
  isAppDestinationId,
  normalizeAppDestinationQuery,
  resolveAppDestinationQuery
} from './app-destinations'

function hasMessage(catalog: Record<string, unknown>, key: string): boolean {
  let current: unknown = catalog
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) return false
    current = (current as Record<string, unknown>)[segment]
  }
  return typeof current === 'string' && current.length > 0
}

/**
 * The catalog is the only thing standing between a CoreBox query and a destination. The risky
 * regressions are asymmetric: a missing positive alias silently hides a destination, while an
 * over-broad negative alias steals ordinary app search (a bare `open` matching "Show Main Window"
 * ranked above the user's app). Both directions are pinned here.
 */
describe('app destination alias matching', () => {
  it.each([
    ['main-window', '主窗口'],
    ['main-window', '主界面'],
    ['main-window', '主页面'],
    ['main-window', '回到主窗口'],
    ['main-window', '打开 Tuff'],
    ['main-window', 'main window'],
    ['main-window', 'tuff window'],
    ['main-window', 'show main window'],
    ['main-window', 'open tuff'],
    ['home', '首页'],
    ['home', '主页'],
    ['home', 'home'],
    ['home', 'home page'],
    ['home', 'dashboard'],
    ['home', 'homepage'],
    ['settings-overview', '设置'],
    ['settings-overview', '偏好设置'],
    ['settings-overview', 'settings'],
    ['settings-overview', 'preferences'],
    ['settings-overview', '应用设置'],
    ['settings-overview', '选项'],
    ['settings-overview', '配置'],
    ['settings-overview', 'options'],
    ['settings-overview', 'config'],
    ['settings-overview', 'configuration'],
    ['settings-general', '通用'],
    ['settings-general', '常规'],
    ['settings-appearance', '外观'],
    ['settings-appearance', '主题设置'],
    ['settings-intelligence', 'AI settings'],
    ['settings-intelligence', 'model settings'],
    ['settings-intelligence', '模型设置'],
    ['settings-channels', '模型渠道'],
    ['settings-voice', '语音设置'],
    ['settings-plugins', '插件'],
    ['settings-plugins', 'extensions'],
    ['settings-plugins', '扩展'],
    ['settings-file-index', '文件索引'],
    ['settings-file-index', '文件搜索'],
    ['settings-file-index', 'file search'],
    ['settings-network', '网络设置'],
    ['settings-update', '检查更新'],
    ['settings-update', 'check updates'],
    ['settings-update', 'check for updates'],
    ['settings-about', '关于 Tuff'],
    ['settings-about', 'about tuff'],
    // Canonical English titles for the families the Chinese-only rows left uncovered.
    ['settings-general', 'general'],
    ['settings-general', 'general settings'],
    ['settings-appearance', 'appearance'],
    ['settings-intelligence', 'intelligence'],
    ['settings-intelligence', 'intelligence settings'],
    ['settings-channels', 'model channels'],
    ['settings-channels', 'provider settings'],
    ['settings-voice', 'voice input'],
    ['settings-plugins', 'plugins'],
    ['settings-file-index', 'file index'],
    ['settings-network', 'network'],
    ['settings-network', 'network settings'],
    ['settings-update', 'update'],
    ['settings-update', 'update settings'],
    ['settings-about', 'about'],
    // Static full-pinyin aliases for every family.
    ['main-window', 'zhuchuangkou'],
    ['main-window', 'zhujiemian'],
    ['home', 'shouye'],
    ['home', 'zhuye'],
    ['settings-overview', 'shezhi'],
    ['settings-overview', 'pianhaoshezhi'],
    ['settings-general', 'tongyong'],
    ['settings-general', 'changgui'],
    ['settings-appearance', 'waiguan'],
    ['settings-appearance', 'zhutishezhi'],
    ['settings-intelligence', 'zhineng'],
    ['settings-intelligence', 'tafuzhineng'],
    ['settings-intelligence', 'moxingshezhi'],
    ['settings-channels', 'moxingqudao'],
    ['settings-channels', 'qudaoshezhi'],
    ['settings-voice', 'yuyinshuru'],
    ['settings-voice', 'yuyinshezhi'],
    ['settings-voice', 'tingxieshezhi'],
    ['settings-plugins', 'chajian'],
    ['settings-plugins', 'kuozhan'],
    ['settings-plugins', 'chajianyugongju'],
    ['settings-file-index', 'wenjiansuoyin'],
    ['settings-file-index', 'wenjiansousuo'],
    ['settings-network', 'wangluo'],
    ['settings-network', 'wangluoshezhi'],
    ['settings-network', 'dailishezhi'],
    ['settings-update', 'gengxin'],
    ['settings-update', 'jianchagengxin'],
    ['settings-update', 'ruanjiangengxin'],
    ['settings-about', 'guanyu'],
    ['settings-about', 'banbenxinxi'],
    // Deliberate pinyin initial aliases for every family.
    ['main-window', 'zck'],
    ['main-window', 'zjm'],
    ['home', 'sy'],
    ['home', 'zy'],
    ['settings-overview', 'sz'],
    ['settings-overview', 'phsz'],
    ['settings-general', 'ty'],
    ['settings-general', 'cg'],
    ['settings-appearance', 'wg'],
    ['settings-appearance', 'ztsz'],
    ['settings-intelligence', 'zn'],
    ['settings-intelligence', 'tfzn'],
    ['settings-intelligence', 'mxsz'],
    ['settings-channels', 'mxqd'],
    ['settings-channels', 'qdsz'],
    ['settings-voice', 'yysr'],
    ['settings-voice', 'yysz'],
    ['settings-voice', 'txsz'],
    ['settings-plugins', 'cj'],
    ['settings-plugins', 'kz'],
    ['settings-plugins', 'cjygj'],
    ['settings-file-index', 'wjsy'],
    ['settings-file-index', 'wjss'],
    ['settings-network', 'wl'],
    ['settings-network', 'wlsz'],
    ['settings-network', 'dlsz'],
    ['settings-update', 'gx'],
    ['settings-update', 'jcgx'],
    ['settings-update', 'rjgx'],
    ['settings-about', 'gy'],
    ['settings-about', 'bbxx']
  ] as const)('resolves %s from the %s phrase', (destinationId, query) => {
    expect(resolveAppDestinationQuery(query)?.id).toBe(destinationId)
  })

  it.each(['Main-Window', 'main_window', '  MAIN   WINDOW  '])(
    'normalizes whitespace, separators and case for %s',
    (query) => {
      expect(resolveAppDestinationQuery(query)?.id).toBe('main-window')
    }
  )

  it('does not fold punctuation into aliases', () => {
    // Only whitespace, `_` and `-` are dropped. Normalizing every non-alphanumeric run would let
    // unrelated punctuation collapse two phrases onto one key, so the narrower rule is pinned.
    expect(normalizeAppDestinationQuery('MAIN.WINDOW')).toBe('main.window')
    expect(resolveAppDestinationQuery('MAIN.WINDOW')).toBeNull()
  })

  it.each([
    '打开',
    'open',
    'show',
    'window',
    '窗口',
    'AI',
    'ai',
    '模型',
    'model',
    'proxy',
    '主题',
    'theme',
    '语音',
    '渠道',
    '索引',
    'unknown destination text'
  ])('returns no destination for the bare or ambiguous query %s', (query) => {
    expect(resolveAppDestinationQuery(query)).toBeNull()
  })

  it('requires an exact phrase rather than a prefix or substring match', () => {
    expect(resolveAppDestinationQuery('main window please')).toBeNull()
    expect(resolveAppDestinationQuery('open the settings drawer')).toBeNull()
    expect(resolveAppDestinationQuery('网络设置在哪里')).toBeNull()
  })

  it('treats blank and separator-only input as no destination', () => {
    expect(resolveAppDestinationQuery('')).toBeNull()
    expect(resolveAppDestinationQuery('   ')).toBeNull()
    expect(resolveAppDestinationQuery('_-_')).toBeNull()
  })

  it('normalizes every catalog alias into its own stable key', () => {
    expect(normalizeAppDestinationQuery('  Main_Window  ')).toBe('mainwindow')
    expect(normalizeAppDestinationQuery('主窗口')).toBe('主窗口')
  })
})

describe('app destination catalog invariants', () => {
  it('orders the common settings group exactly as the action panel renders it', () => {
    expect(COMMON_SETTING_DESTINATION_IDS).toEqual([
      'settings-general',
      'settings-appearance',
      'settings-channels',
      'settings-voice',
      'settings-plugins',
      'settings-file-index',
      'settings-network',
      'settings-update'
    ])
  })

  it('marks exactly the common settings group as common and searchable', () => {
    const markedCommon = APP_DESTINATIONS.filter((definition) => definition.commonSetting).map(
      (definition) => definition.id
    )

    expect(markedCommon).toEqual([...COMMON_SETTING_DESTINATION_IDS])
    for (const id of COMMON_SETTING_DESTINATION_IDS) {
      expect(getAppDestination(id).searchable).toBe(true)
    }
    expect(COMMON_SETTING_DESTINATION_IDS).not.toContain('settings-about')
    expect(COMMON_SETTING_DESTINATION_IDS).not.toContain('settings-overview')
  })

  it('keeps only the reveal destination route-less', () => {
    expect(getAppDestination('main-window').route).toBeNull()
    for (const definition of APP_DESTINATIONS) {
      if (definition.id === 'main-window') continue
      expect(definition.route).toMatch(/^\//)
    }
  })

  it('gives every normalized alias a single owner across every alias group', () => {
    const owners = new Map<string, AppDestinationId>()
    const collisions: string[] = []

    for (const definition of APP_DESTINATIONS) {
      for (const alias of [
        ...definition.aliases.en,
        ...definition.aliases.zh,
        ...definition.aliases.pinyin
      ]) {
        const key = normalizeAppDestinationQuery(alias)
        const existing = owners.get(key)
        if (existing !== undefined && existing !== definition.id) {
          collisions.push(`${alias} -> ${key} (${existing} vs ${definition.id})`)
        }
        owners.set(key, definition.id)
      }
    }

    expect(collisions).toEqual([])
  })

  it('rejects unknown destination ids', () => {
    expect(isAppDestinationId('settings-overview')).toBe(true)
    expect(isAppDestinationId('settings-download')).toBe(false)
    expect(isAppDestinationId('')).toBe(false)
    expect(isAppDestinationId(null)).toBe(false)
    expect(isAppDestinationId(42)).toBe(false)
    expect(() => getAppDestination('settings-download' as AppDestinationId)).toThrow()
  })
})

/**
 * A destination whose title or subtitle key is missing renders the raw dotted key to the user.
 * Both locales must carry every referenced key, including the grouped-action label.
 */
describe('app destination localization keys', () => {
  it.each([
    ['zh-CN', zhCN as Record<string, unknown>],
    ['en-US', enUS as Record<string, unknown>]
  ])('resolves every destination title, subtitle and group label in %s', (_locale, catalog) => {
    const keys = APP_DESTINATIONS.flatMap((definition) => [
      definition.titleKey,
      definition.subtitleKey
    ])
    keys.push('corebox.destinations.commonSettings')

    const missing = keys.filter((key) => !hasMessage(catalog, key))
    expect(missing).toEqual([])
  })
})

/**
 * The catalog is a `.ts` table, so UnoCSS never scans these class names out of it: they reach the
 * stylesheet only through the config's safelist. A missing entry is invisible in review — the
 * CoreBox row simply renders an empty box — and a class outside the `ri` collection is the same
 * defect with a green safelist, so both directions are pinned here.
 */
describe('app destination icon classes', () => {
  it('lists every catalog icon once, in the order the catalog declares them', () => {
    expect(APP_DESTINATION_ICON_CLASSES).toEqual([
      'i-ri-window-line',
      'i-ri-home-line',
      'i-ri-dashboard-3-line',
      'i-ri-settings-3-line',
      'i-ri-palette-line',
      'i-ri-sparkling-2-line',
      'i-ri-links-line',
      'i-ri-mic-line',
      'i-ri-puzzle-line',
      'i-ri-file-search-line',
      'i-ri-global-line',
      'i-ri-refresh-line',
      'i-ri-information-line'
    ])
    expect(APP_DESTINATION_ICON_CLASSES).toEqual(
      Array.from(new Set(APP_DESTINATIONS.map((definition) => definition.icon)))
    )
  })

  it('resolves every icon class to a real glyph in the collection the preset installs', () => {
    const glyph = (name: string): boolean =>
      Object.prototype.hasOwnProperty.call(riIcons.icons, name) ||
      Object.prototype.hasOwnProperty.call(riIcons.aliases ?? {}, name)

    const missing = APP_DESTINATION_ICON_CLASSES.filter(
      (className) => !className.startsWith('i-ri-') || !glyph(className.slice('i-ri-'.length))
    )

    expect(missing).toEqual([])
  })

  it('safelists the catalog icons and depends on the catalog module in the Uno config', () => {
    for (const className of APP_DESTINATION_ICON_CLASSES) {
      expect(unoConfig.safelist).toContain(className)
    }

    // Without the configDeps entry a newly added icon stays an empty box until a dev-server
    // restart, which is the same defect hiding behind a reload.
    const catalogModulePath = fileURLToPath(new URL('./app-destinations.ts', import.meta.url))
    expect(unoConfig.configDeps).toContain(catalogModulePath)
  })
})
