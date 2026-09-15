/**
 * Adaptive dictation formatting — the profile registry.
 *
 * A profile is data: which transforms to run, in which order, with which parameters, and which
 * applications it claims. There is deliberately no per-application function anywhere in this
 * module — the moment a new app needs a special case, it needs a profile field instead, and a
 * reader can see the whole policy for every app side by side.
 *
 * Bundle identifiers and application names below are registry data, the same kind of literal that
 * any platform integration carries. They are matched case-insensitively and only ever widen a
 * match; an entry that turns out to be wrong costs that application its tuned formatting and
 * nothing else, because the fallback is `default`.
 */
import type { AppFormatProfile } from './types'

const TERMINAL_PROFILE: AppFormatProfile = {
  id: 'terminal',
  label: '终端',
  bundleIds: [
    'com.apple.Terminal',
    'com.mitchellh.ghostty',
    'com.googlecode.iterm2',
    'dev.warp.Warp-Stable',
    'com.github.wez.wezterm',
    'net.kovidgoyal.kitty',
    'io.alacritty',
    'org.alacritty',
    'org.gnome.Terminal',
    'co.zeit.hyper',
    'com.termius.mac'
  ],
  // Windows has no bundle id, only an AppUserModelId, whose stable part is the prefix.
  bundlePrefixes: ['Microsoft.WindowsTerminal'],
  appNames: [
    'Terminal',
    'Ghostty',
    'iTerm2',
    'Warp',
    'WezTerm',
    'kitty',
    'Alacritty',
    'Hyper',
    'Windows Terminal'
  ],
  windowTitlePattern: null,
  /**
   * A command line is ASCII, must not gain a full stop from how the speaker phrased it, and takes
   * `/` and `_` literally — `斜杠`, `下划线` and `点` are dictation, not content here.
   */
  transforms: [
    'filler.remove',
    'symbols.spoken',
    'punctuation.ascii',
    'numerals.chinese',
    'punctuation.trailing',
    'whitespace.collapse'
  ],
  options: { identifierCase: null }
}

const CODE_PROFILE: AppFormatProfile = {
  id: 'code',
  label: '代码编辑器',
  bundleIds: [
    'com.microsoft.VSCode',
    'com.microsoft.VSCodeInsiders',
    'com.vscodium',
    'com.todesktop.230313mzl4w4u92',
    'com.exafunction.windsurf',
    'com.sublimetext.4',
    'com.sublimetext.3',
    'com.apple.dt.Xcode',
    'dev.zed.Zed',
    'com.jetbrains.intellij',
    'com.jetbrains.pycharm',
    'com.jetbrains.WebStorm',
    'com.jetbrains.goland',
    'com.jetbrains.CLion',
    'com.jetbrains.rider'
  ],
  // Editor families ship several channel-specific bundle ids; the vendor prefix covers the rest.
  bundlePrefixes: ['com.microsoft.VSCode', 'com.jetbrains.'],
  appNames: [
    'Visual Studio Code',
    'Code',
    'VSCodium',
    'Cursor',
    'Windsurf',
    'Sublime Text',
    'Xcode',
    'Zed',
    'IntelliJ IDEA',
    'PyCharm',
    'WebStorm',
    'GoLand',
    'CLion',
    'Rider'
  ],
  // A window titled after a source file is an editor window even when the app is not recognized.
  windowTitlePattern:
    /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|kts|c|h|cc|cpp|hpp|cs|php|swift|sh|bash|zsh|sql|json|ya?ml|toml|vue|svelte|css|scss|less|html|md)\b/i,
  /**
   * Code is ASCII and sentence punctuation is noise — a comma dictated mid-sentence is a pause, not
   * a character — while `.`, `/`, `_` and `*` are kept because they are syntax. `identifier.case`
   * then rewrites a short spoken name such as `get user name` into a single identifier.
   */
  transforms: [
    'filler.remove',
    'symbols.spoken',
    'punctuation.ascii',
    'punctuation.strip',
    'numerals.chinese',
    'identifier.case',
    'punctuation.trailing',
    'whitespace.collapse'
  ],
  options: { identifierCase: 'camel' }
}

const CHAT_PROFILE: AppFormatProfile = {
  id: 'chat',
  label: '聊天',
  bundleIds: [
    'com.tencent.xinWeChat',
    'com.apple.MobileSMS',
    'com.apple.iChat',
    'com.tinyspeck.slackmacgap',
    'com.hnc.Discord',
    'org.telegram.desktop',
    'ru.keepcoder.Telegram',
    'com.microsoft.teams2',
    'com.electron.lark',
    'com.tencent.qq'
  ],
  bundlePrefixes: ['com.tencent.xin'],
  appNames: [
    'WeChat',
    '微信',
    'Messages',
    'Slack',
    'Discord',
    'Telegram',
    'Microsoft Teams',
    'Lark',
    '飞书',
    'QQ'
  ],
  windowTitlePattern: null,
  /**
   * A message is prose: Chinese punctuation is what the reader expects, the speaker's words are
   * their own (a literal `斜杠` in a chat is a slash somebody said out loud), and turning `三点`
   * into `3点` would make a casual message read like a form. Only the fillers go.
   */
  transforms: ['filler.remove', 'whitespace.collapse'],
  options: { identifierCase: null }
}

const NOTES_PROFILE: AppFormatProfile = {
  id: 'notes',
  label: '笔记',
  bundleIds: [
    'com.apple.Notes',
    'notion.id',
    'md.obsidian',
    'net.shinyfrog.bear',
    'com.evernote.Evernote',
    'com.microsoft.onenote.mac',
    'com.craft.Craft'
  ],
  bundlePrefixes: [],
  appNames: ['Notes', 'Notion', 'Obsidian', 'Bear', 'Evernote', 'Microsoft OneNote', 'Craft'],
  windowTitlePattern: null,
  /**
   * Notes keep the speaker's punctuation but gain structure: a spoken enumeration becomes a
   * Markdown list, and `换行` becomes a real break, because a note is read back and edited rather
   * than sent.
   */
  transforms: [
    'filler.remove',
    'symbols.spoken',
    'list.ordinals',
    'numerals.chinese',
    'whitespace.collapse'
  ],
  options: { identifierCase: null }
}

const SPREADSHEET_PROFILE: AppFormatProfile = {
  id: 'spreadsheet',
  label: '表格',
  bundleIds: [
    'com.microsoft.Excel',
    'com.apple.iWork.Numbers',
    'com.kingsoft.wpsoffice.mac',
    'org.libreoffice.script'
  ],
  bundlePrefixes: [],
  appNames: ['Excel', 'Numbers', 'WPS Office', 'LibreOffice Calc'],
  windowTitlePattern: null,
  /**
   * A cell holds a value, not a sentence: punctuation is stripped rather than converted, and the
   * spoken symbols are not substituted because a cell saying `斜杠` is far more likely to be a word
   * someone actually wanted than a path someone was dictating into a grid.
   */
  transforms: [
    'filler.remove',
    'punctuation.ascii',
    'punctuation.strip',
    'numerals.chinese',
    'punctuation.trailing',
    'whitespace.collapse'
  ],
  options: { identifierCase: null }
}

/** Everything the resolver searches, in the order it searches them. `default` is not in here. */
export const APP_FORMAT_PROFILES: readonly AppFormatProfile[] = [
  TERMINAL_PROFILE,
  CODE_PROFILE,
  CHAT_PROFILE,
  NOTES_PROFILE,
  SPREADSHEET_PROFILE
]

/**
 * What an unrecognized application gets.
 *
 * Only whitespace is touched. Every other transform in this module makes a judgement that is wrong
 * somewhere, and a wrong judgement pasted into whoever-knows-what window is worse than the extra
 * space it was meant to remove.
 */
export const DEFAULT_FORMAT_PROFILE: AppFormatProfile = {
  id: 'default',
  label: '默认',
  bundleIds: [],
  bundlePrefixes: [],
  appNames: [],
  windowTitlePattern: null,
  transforms: ['whitespace.collapse'],
  options: { identifierCase: null }
}
