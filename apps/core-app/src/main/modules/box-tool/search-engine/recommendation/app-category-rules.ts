import { extractAppNameFromPath, matchesAppRule, type AppMatchRule } from './app-identity-match'

/**
 * Short terminal names that would false-match unrelated apps under substring matching
 * (e.g. `Cloudflare WARP`, `Angry Birds Rio`, `Mario`, `HyperX`, `mycmd`). Matched only
 * when the entire identifier or extracted app basename equals the name exactly.
 */
const EXACT_TERMINAL_NAMES = new Set(['warp', 'hyper', 'rio', 'cmd', 'wt', 'kitty'])
const EXACT_TERMINAL_EXE_REGEX = /(?:^|[\s\\/])(?:cmd|wt)\.exe(?:\s|$)/i

/**
 * Category tables for context matching. `names` exist because candidate ids are
 * often absolute paths rather than bundle ids (see app-identity-match).
 */
export const APP_MATCH_RULES = {
  browser: {
    bundleIds: [
      'com.google.Chrome',
      'com.apple.Safari',
      'org.mozilla.firefox',
      'com.microsoft.edgemac',
      'com.brave.Browser',
      'com.operasoftware.Opera'
    ],
    names: ['chrome', 'safari', 'firefox', 'microsoft edge', 'brave browser', 'opera', 'arc']
  },
  entertainment: {
    bundleIds: [
      'spotify',
      'music',
      'netease',
      'qqmusic',
      'youtube',
      'netflix',
      'discord',
      'telegram',
      'wechat',
      'slack',
      'twitter',
      'x.com'
    ],
    names: [
      'spotify',
      'music',
      '网易云音乐',
      'qq音乐',
      'youtube',
      'netflix',
      'discord',
      'telegram',
      'wechat',
      '微信',
      'slack'
    ]
  },
  editor: {
    bundleIds: [
      'com.microsoft.VSCode',
      'com.sublimetext',
      'com.jetbrains',
      'com.barebones.bbedit',
      'com.vim',
      'com.neovim',
      'com.textmate'
    ],
    names: ['visual studio code', 'vscodium', 'cursor', 'sublime text', 'bbedit', 'textmate', 'zed']
  },
  image: {
    bundleIds: [
      'com.adobe.Photoshop',
      'com.adobe.illustrator',
      'com.adobe.AfterEffects',
      'com.bohemiancoding.sketch',
      'com.figma.Desktop',
      'com.pixelmatorteam.pixelmator',
      'com.apple.Preview',
      'com.gimp',
      'com.serif.affinity.photo',
      'com.serif.affinity.designer',
      'com.krita',
      'com.procreate',
      'com.canva'
    ],
    names: [
      'photoshop',
      'illustrator',
      'after effects',
      'sketch',
      'figma',
      'pixelmator',
      'preview',
      '预览',
      'gimp',
      'affinity',
      'krita',
      'canva'
    ]
  },
  vscode: {
    bundleIds: ['com.microsoft.VSCode', 'VSCodium'],
    names: ['visual studio code', 'vscodium', 'code']
  },
  textEditor: {
    bundleIds: [
      'com.apple.TextEdit',
      'com.sublimetext',
      'com.barebones.bbedit',
      'com.coteditor.CotEditor',
      'com.typora'
    ],
    names: ['textedit', '文本编辑', 'sublime text', 'bbedit', 'coteditor', 'typora']
  },
  fileManager: {
    bundleIds: ['com.apple.finder', 'com.coderforart.MWeb', 'com.agilebits'],
    names: ['finder', '访达', 'mweb', 'forklift', 'path finder']
  },
  ide: {
    bundleIds: [
      'com.microsoft.VSCode',
      'com.jetbrains',
      'com.apple.dt.Xcode',
      'com.android.studio'
    ],
    names: [
      'visual studio code',
      'vscodium',
      'cursor',
      'xcode',
      'android studio',
      'intellij',
      'pycharm',
      'webstorm',
      'goland',
      'rider',
      'clion',
      'rustrover',
      'datagrip',
      'phpstorm'
    ]
  },
  terminal: {
    bundleIds: [
      'com.apple.Terminal',
      'com.googlecode.iterm2',
      'com.github.wez.wezterm',
      'org.wezfurlong.wezterm',
      'io.alacritty',
      'org.alacritty',
      'net.kovidgoyal.kitty',
      'com.mitchellh.ghostty',
      'dev.warp.Warp',
      'co.zeit.hyper',
      'org.tabby',
      'com.cmuxterm.app',
      'com.raphaelamorim.rio',
      'dev.waveterm.waveterm',
      'dev.commandline.waveterm',
      'kingtoolbox.windterm',
      'org.electerm.electerm',
      'Microsoft.WindowsTerminal',
      'org.kde.konsole',
      'org.gnome.Ptyxis',
      'com.gexperts.Tilix',
      'ghostty',
      'wezterm',
      'alacritty',
      'tabby',
      'cmux',
      'waveterm',
      'windterm',
      'electerm',
      'windows terminal',
      'powershell',
      'pwsh',
      'git-bash',
      'git bash',
      'command prompt',
      'konsole',
      'ptyxis',
      'tilix'
    ],
    names: [
      'terminal',
      '终端',
      'iterm',
      'wezterm',
      'alacritty',
      'kitty',
      'ghostty',
      'tabby',
      'cmux',
      'rio terminal',
      'rioterm',
      'waveterm',
      'wave terminal',
      'windterm',
      'electerm',
      'windows terminal',
      'pwsh',
      'powershell',
      'command prompt',
      'git bash',
      'git-bash',
      'konsole',
      'ptyxis',
      'tilix'
    ]
  },
  apiClient: {
    bundleIds: ['postman', 'insomnia'],
    names: ['postman', 'insomnia', 'apifox']
  },
  downloadTool: {
    bundleIds: ['download', 'aria'],
    names: ['downie', 'motrix', 'aria2', 'folx', 'free download manager', 'thunder', '迅雷']
  },
  collaborationChat: {
    bundleIds: [
      'com.tencent.xinWeChat',
      'wechat',
      'com.electron.lark',
      'com.bytedance.feishu',
      'feishu',
      'lark',
      'com.alibaba.DingTalkMac',
      'dingtalk',
      'com.tinyspeck.slackmacgap',
      'slack',
      'telegram',
      'discord',
      'com.microsoft.teams'
    ],
    names: [
      'wechat',
      '微信',
      'feishu',
      '飞书',
      'lark',
      'dingtalk',
      '钉钉',
      'slack',
      'telegram',
      'teams'
    ]
  }
} as const satisfies Record<string, AppMatchRule>

export const JETBRAINS_MATCH_RULES: Record<string, AppMatchRule> = {
  idea: { bundleIds: ['com.jetbrains.intellij'], names: ['intellij idea'] },
  pycharm: { bundleIds: ['com.jetbrains.pycharm'], names: ['pycharm'] },
  webstorm: { bundleIds: ['com.jetbrains.webstorm'], names: ['webstorm'] },
  'android-studio': { bundleIds: ['com.google.android.studio'], names: ['android studio'] },
  goland: { bundleIds: ['com.jetbrains.goland'], names: ['goland'] },
  rider: { bundleIds: ['com.jetbrains.rider'], names: ['rider'] }
}

/**
 * App candidates reach scoring with either source type: `item_usage_stats`
 * stores `item.source.type` (`'application'` for the app provider), while
 * plugin/builtin candidates and tests use the short `'app'`. Gating on one
 * spelling silently disabled context matching for every real app row.
 */
export function isAppSourceType(sourceType: string): boolean {
  return sourceType === 'app' || sourceType === 'application'
}

export function isBrowserApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.browser)
}

export function isEntertainmentOrSocialApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.entertainment)
}

export function isEditorApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.editor)
}

export function isImageApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.image)
}

export function isJetBrainsIDE(identifier: string, products: readonly string[]): boolean {
  return products.some((product) => {
    const rule = JETBRAINS_MATCH_RULES[product]
    return rule ? matchesAppRule(identifier, rule) : false
  })
}

export function isVSCode(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.vscode)
}

export function isTextEditor(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.textEditor)
}

export function isFileManagerApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.fileManager)
}

export function isIDE(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.ide)
}

export function isTerminalApp(identifier: string): boolean {
  if (!identifier) return false
  if (matchesAppRule(identifier, APP_MATCH_RULES.terminal)) {
    return true
  }
  const normalized = identifier.trim().toLowerCase()
  const stripped = normalized.replace(/\.(app|exe|lnk|desktop)$/i, '')
  if (EXACT_TERMINAL_NAMES.has(stripped)) {
    return true
  }
  if (EXACT_TERMINAL_EXE_REGEX.test(normalized)) {
    return true
  }
  const name = extractAppNameFromPath(identifier)
  return name !== null && EXACT_TERMINAL_NAMES.has(name)
}

export function isDeveloperTool(identifier: string): boolean {
  return (
    isIDE(identifier) ||
    isTerminalApp(identifier) ||
    matchesAppRule(identifier, APP_MATCH_RULES.apiClient)
  )
}

export function isDownloadToolApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.downloadTool)
}

export function isCollaborationChatApp(identifier: string): boolean {
  return matchesAppRule(identifier, APP_MATCH_RULES.collaborationChat)
}
