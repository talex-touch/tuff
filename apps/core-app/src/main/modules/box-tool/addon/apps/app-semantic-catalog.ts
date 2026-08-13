import type { ScannedAppInfo } from './app-types'
import { normalizeStringList } from './app-utils'
import { createAppCatalogNeedleMatcher } from './app-catalog-matching'
import { resolveAppToolSourceAliases } from './app-tool-source-catalog'

export const APP_SEMANTIC_ALIAS_CATALOG_VERSION = 5

/**
 * Adding a language: append its tag here, add a rule to LOCALE_ALIAS_EXPANSIONS, then add the
 * key to the category groups that need it.
 */
const SEMANTIC_ALIAS_LOCALES = ['en', 'zh'] as const

type SemanticAliasLocale = (typeof SEMANTIC_ALIAS_LOCALES)[number]

type LocalizedAliasGroup = Partial<Record<SemanticAliasLocale, readonly string[]>>

const ASCII_WORD_REGEX = /^[a-z]+$/
const SIBILANT_SUFFIX_REGEX = /(?:x|z|ch|sh)$/
const CONSONANT_Y_SUFFIX_REGEX = /[^aeiou]y$/

/**
 * Words whose naive plural is not something a user would ever type. Aliases of two characters
 * or fewer ('im', 'ai', 'db', 'pm', 'vm'), aliases carrying digits ('2fa', 'k8s'), multi-word
 * phrases and words already ending in 's' are skipped structurally and stay out of this table.
 */
const NON_PLURALIZABLE_ALIASES = new Set([
  // Acronyms and clipped forms: 'apis' / 'infras' are not words.
  'api',
  'auth',
  'cli',
  'ftp',
  'http',
  'ide',
  'infra',
  'llm',
  'ocr',
  'rdp',
  'rest',
  'sftp',
  'sql',
  'ssh',
  'vpn',
  // Verbs, gerunds and adjectives: the plural would be a conjugation, not a noun.
  'capture',
  'coding',
  'creative',
  'develop',
  'extract',
  'meet',
  'remote',
  'sync',
  'virtual',
  // Uncountable here, or the plural shifts meaning ('codes', 'securities', 'works', 'terms').
  'audio',
  'cloud',
  'code',
  'internet',
  'kanban',
  'mail',
  'media',
  'music',
  'office',
  'security',
  'storage',
  'term',
  'virtualization',
  'web',
  'work',
  // Product and file format names.
  'docker',
  'git',
  'github',
  'zip'
])

/** Naive English pluralisation for catalog words. Exported so the rules can be tested directly. */
export function expandEnglishPlural(alias: string): readonly string[] {
  // Catalog words are lowercase ASCII by convention; phrases ('edit video'), digit-bearing
  // tokens ('k8s') and CJK never reach a plural rule.
  if (!ASCII_WORD_REGEX.test(alias)) return [alias]
  if (alias.length <= 2) return [alias]
  if (alias.endsWith('s')) return [alias]
  if (NON_PLURALIZABLE_ALIASES.has(alias)) return [alias]

  // Words already ending in 's' returned above, so the sibilant rule covers the rest.
  if (SIBILANT_SUFFIX_REGEX.test(alias)) return [alias, `${alias}es`]
  if (CONSONANT_Y_SUFFIX_REGEX.test(alias)) return [alias, `${alias.slice(0, -1)}ies`]
  return [alias, `${alias}s`]
}

const LOCALE_ALIAS_EXPANSIONS: Record<SemanticAliasLocale, (alias: string) => readonly string[]> = {
  en: expandEnglishPlural,
  zh: (alias) => [alias]
}

function compileAliasGroup(group: LocalizedAliasGroup): readonly string[] {
  const expanded: string[] = []

  for (const locale of SEMANTIC_ALIAS_LOCALES) {
    const aliases = group[locale]
    if (!aliases) continue

    const expand = LOCALE_ALIAS_EXPANSIONS[locale]
    for (const alias of aliases) expanded.push(...expand(alias))
  }

  return normalizeStringList(expanded)
}

export interface AppSemanticAliasInput {
  name?: string | null
  displayName?: string | null
  fileName?: string | null
  alternateNames?: readonly string[] | null
  bundleId?: string | null
  uniqueId?: string | null
  stableId?: string | null
  appIdentity?: string | null
  path?: string | null
  launchTarget?: string | null
  displayPath?: string | null
  description?: string | null
}

interface AppSemanticCatalogEntry {
  match: readonly string[]
  aliases: readonly string[]
}

const IM_ALIASES = compileAliasGroup({
  en: ['im', 'chat', 'messenger', 'message', 'messages'],
  zh: ['即时通讯', '聊天', '通讯']
})
const DESIGN_ALIASES = compileAliasGroup({
  en: ['design', 'designer', 'creative', 'graphics', 'image'],
  zh: ['设计', '作图']
})
const DEV_ALIASES = compileAliasGroup({
  en: ['dev', 'develop', 'developer', 'code', 'coding', 'ide'],
  zh: ['开发', '编程']
})
const OFFICE_ALIASES = compileAliasGroup({
  en: ['office', 'work', 'document', 'docs'],
  zh: ['办公', '文档']
})
const BROWSER_ALIASES = compileAliasGroup({
  en: ['browser', 'web', 'internet'],
  zh: ['浏览器', '网页', '上网']
})
const TERMINAL_ALIASES = compileAliasGroup({
  en: ['terminal', 'shell', 'cli', 'console', 'term', 'command line'],
  zh: ['终端', '命令行']
})
const NOTES_ALIASES = compileAliasGroup({
  en: ['notes', 'note', 'memo'],
  zh: ['笔记', '备忘录']
})
const MEETING_ALIASES = compileAliasGroup({
  en: ['meeting', 'meet', 'conference', 'video meeting'],
  zh: ['会议', '视频会议', '开会']
})
const CLOUD_ALIASES = compileAliasGroup({
  en: ['cloud', 'drive', 'sync', 'storage'],
  zh: ['云盘', '网盘', '同步']
})
const AI_ALIASES = compileAliasGroup({
  en: ['ai', 'agent', 'chatbot', 'llm', 'assistant'],
  zh: ['智能', '助手']
})
const TASK_ALIASES = compileAliasGroup({
  en: ['pm', 'task', 'todo', 'kanban', 'project'],
  zh: ['项目', '任务', '待办']
})
const DATABASE_ALIASES = compileAliasGroup({
  en: ['db', 'database', 'sql'],
  zh: ['数据库']
})
const API_ALIASES = compileAliasGroup({
  en: ['api', 'http', 'request', 'rest'],
  zh: ['接口', '调试']
})
const DEVOPS_ALIASES = compileAliasGroup({
  en: ['devops', 'infra', 'container', 'docker', 'k8s', 'kubernetes'],
  zh: ['运维', '容器']
})
const GIT_ALIASES = compileAliasGroup({
  en: ['git', 'repo', 'repository', 'github'],
  zh: ['代码仓库', '仓库']
})
const SCREENSHOT_ALIASES = compileAliasGroup({
  en: ['screenshot', 'capture', 'ocr', 'screen', 'recording'],
  zh: ['截图', '录屏', '识别']
})
const MEDIA_ALIASES = compileAliasGroup({
  en: ['video', 'audio', 'music', 'player', 'media', 'movie', 'edit video'],
  zh: ['视频', '音频', '音乐', '播放器', '电影']
})
const ARCHIVE_ALIASES = compileAliasGroup({
  en: ['zip', 'archive', 'compress', 'extract'],
  zh: ['压缩', '解压']
})
const TRANSFER_ALIASES = compileAliasGroup({
  en: ['ftp', 'sftp', 'transfer', 'file transfer'],
  zh: ['传输', '文件传输']
})
const SECURITY_ALIASES = compileAliasGroup({
  en: ['password', 'secret', '2fa', 'auth', 'security'],
  zh: ['密码', '验证器', '安全']
})
const NETWORK_ALIASES = compileAliasGroup({
  en: ['vpn', 'proxy', 'network'],
  zh: ['网络', '代理']
})
const REMOTE_ALIASES = compileAliasGroup({
  en: ['remote', 'ssh', 'rdp'],
  zh: ['远程']
})
const VIRTUALIZATION_ALIASES = compileAliasGroup({
  en: ['vm', 'virtual', 'virtualization'],
  zh: ['虚拟机']
})
const PRODUCT_DESIGN_ALIASES = compileAliasGroup({
  en: ['prototype', 'wireframe', 'product design'],
  zh: ['产品设计', '原型']
})
const EMAIL_ALIASES = compileAliasGroup({
  en: ['email', 'mail', 'inbox'],
  zh: ['邮件', '邮箱']
})
const DOWNLOAD_ALIASES = compileAliasGroup({
  en: ['download', 'downloader'],
  zh: ['下载', '下载器']
})

const APP_SEMANTIC_CATALOG: readonly AppSemanticCatalogEntry[] = [
  {
    match: ['wechat', 'weixin', '微信', 'com.tencent.xin'],
    aliases: [...IM_ALIASES, 'wechat', 'weixin', 'wx', '微信']
  },
  {
    match: ['wecom', '企业微信', 'wxwork', 'com.tencent.wework'],
    aliases: [...IM_ALIASES, 'wecom', 'wxwork', '企业微信']
  },
  {
    match: ['feishu', 'lark', '飞书', 'bytedance.feishu'],
    aliases: [...IM_ALIASES, ...OFFICE_ALIASES, 'feishu', 'lark', '飞书']
  },
  {
    match: ['dingtalk', 'ding talk', '钉钉', 'com.alibaba.dingtalk'],
    aliases: [...IM_ALIASES, ...MEETING_ALIASES, 'dingtalk', 'ding', '钉钉']
  },
  {
    match: ['telegram', 'tg', 'org.telegram'],
    aliases: [...IM_ALIASES, 'telegram', 'tg']
  },
  {
    match: ['whatsapp'],
    aliases: [...IM_ALIASES, 'whatsapp']
  },
  {
    match: ['discord'],
    aliases: [...IM_ALIASES, 'discord']
  },
  {
    match: ['slack'],
    aliases: [...IM_ALIASES, 'slack']
  },
  {
    match: ['qq', 'tencent qq', 'com.tencent.qq'],
    aliases: [...IM_ALIASES, 'qq']
  },
  {
    match: ['tim', 'tencent tim', 'com.tencent.tim'],
    aliases: [...IM_ALIASES, 'tim']
  },
  {
    match: ['photoshop', 'adobe photoshop', 'com.adobe.photoshop'],
    aliases: [...DESIGN_ALIASES, 'photoshop', 'adobe photoshop', 'ps', '修图']
  },
  {
    match: ['illustrator', 'adobe illustrator', 'com.adobe.illustrator'],
    aliases: [...DESIGN_ALIASES, 'illustrator', '矢量']
  },
  {
    match: ['figma'],
    aliases: [...DESIGN_ALIASES, 'figma', 'ui', 'ux']
  },
  {
    match: ['sketch'],
    aliases: [...DESIGN_ALIASES, 'sketch', 'ui', 'ux']
  },
  {
    match: ['affinity designer'],
    aliases: [...DESIGN_ALIASES, 'affinity designer']
  },
  {
    match: ['blender'],
    aliases: [...DESIGN_ALIASES, 'blender', '3d', 'modeling', '建模']
  },
  {
    match: ['canva'],
    aliases: [...DESIGN_ALIASES, 'canva']
  },
  {
    match: ['mastergo', 'master go'],
    aliases: [...DESIGN_ALIASES, ...PRODUCT_DESIGN_ALIASES, 'mastergo']
  },
  {
    match: ['即时设计', 'js.design'],
    aliases: [...DESIGN_ALIASES, ...PRODUCT_DESIGN_ALIASES, '即时设计']
  },
  {
    match: ['pixso'],
    aliases: [...DESIGN_ALIASES, ...PRODUCT_DESIGN_ALIASES, 'pixso']
  },
  {
    match: ['modao', '墨刀'],
    aliases: [...DESIGN_ALIASES, ...PRODUCT_DESIGN_ALIASES, '墨刀']
  },
  {
    match: ['lanhu', '蓝湖'],
    aliases: [...DESIGN_ALIASES, ...PRODUCT_DESIGN_ALIASES, '蓝湖']
  },
  {
    match: ['visual studio code', 'vscode', 'vs code', 'vscodium', 'com.microsoft.vscode'],
    aliases: [...DEV_ALIASES, 'vscode', 'vsc', 'vs code', 'visual studio code']
  },
  {
    match: ['codex', 'openai codex'],
    aliases: [...DEV_ALIASES, 'codex', 'openai codex']
  },
  {
    match: ['cursor'],
    aliases: [...DEV_ALIASES, 'cursor']
  },
  {
    match: ['windsurf'],
    aliases: [...DEV_ALIASES, 'windsurf']
  },
  {
    match: [
      'jetbrains',
      'intellij',
      'webstorm',
      'pycharm',
      'goland',
      'clion',
      'rubymine',
      'phpstorm'
    ],
    aliases: [...DEV_ALIASES, 'jetbrains', 'intellij', 'webstorm', 'pycharm', 'goland']
  },
  {
    match: ['xcode', 'com.apple.dt.xcode'],
    aliases: [...DEV_ALIASES, 'xcode', 'ios dev', 'apple dev']
  },
  {
    match: ['terminal', 'iterm', 'warp', 'hyper', 'tabby'],
    aliases: [...DEV_ALIASES, ...TERMINAL_ALIASES]
  },
  {
    match: ['apifox'],
    aliases: [...DEV_ALIASES, ...API_ALIASES, 'apifox']
  },
  {
    match: ['postman'],
    aliases: [...DEV_ALIASES, ...API_ALIASES, 'postman']
  },
  {
    match: ['insomnia'],
    aliases: [...DEV_ALIASES, ...API_ALIASES, 'insomnia']
  },
  {
    match: ['hoppscotch'],
    aliases: [...DEV_ALIASES, ...API_ALIASES, 'hoppscotch']
  },
  {
    match: ['tableplus'],
    aliases: [...DEV_ALIASES, ...DATABASE_ALIASES, 'tableplus']
  },
  {
    match: ['dbeaver'],
    aliases: [...DEV_ALIASES, ...DATABASE_ALIASES, 'dbeaver']
  },
  {
    match: ['datagrip'],
    aliases: [...DEV_ALIASES, ...DATABASE_ALIASES, 'datagrip']
  },
  {
    match: ['navicat'],
    aliases: [...DEV_ALIASES, ...DATABASE_ALIASES, 'navicat']
  },
  {
    match: ['docker', 'docker desktop'],
    aliases: [...DEV_ALIASES, ...DEVOPS_ALIASES, 'docker']
  },
  {
    match: ['orbstack'],
    aliases: [...DEV_ALIASES, ...DEVOPS_ALIASES, 'orbstack']
  },
  {
    match: ['lens', 'kubernetes lens'],
    aliases: [...DEV_ALIASES, ...DEVOPS_ALIASES, 'lens', 'kubernetes lens']
  },
  {
    match: ['github desktop'],
    aliases: [...GIT_ALIASES, 'github desktop']
  },
  {
    match: ['sourcetree'],
    aliases: [...GIT_ALIASES, 'sourcetree']
  },
  {
    match: ['gitkraken'],
    aliases: [...GIT_ALIASES, 'gitkraken']
  },
  {
    match: ['tower.app', 'git tower'],
    aliases: [...GIT_ALIASES, 'tower']
  },
  {
    match: ['fork.app', 'git fork'],
    aliases: [...GIT_ALIASES, 'fork']
  },
  {
    match: ['finalshell'],
    aliases: [...DEV_ALIASES, ...TERMINAL_ALIASES, ...REMOTE_ALIASES, 'finalshell']
  },
  {
    match: ['mobaxterm'],
    aliases: [...DEV_ALIASES, ...TERMINAL_ALIASES, ...REMOTE_ALIASES, 'mobaxterm']
  },
  {
    match: ['xshell'],
    aliases: [...TERMINAL_ALIASES, ...REMOTE_ALIASES, 'xshell']
  },
  {
    match: ['xftp'],
    aliases: [...TRANSFER_ALIASES, ...REMOTE_ALIASES, 'xftp']
  },
  {
    match: ['termius'],
    aliases: [...TERMINAL_ALIASES, ...REMOTE_ALIASES, 'termius']
  },
  {
    match: ['royal tsx', 'royal ts'],
    aliases: [...REMOTE_ALIASES, 'royal tsx']
  },
  {
    match: ['microsoft remote desktop', 'windows app'],
    aliases: [...REMOTE_ALIASES, 'rdp', 'remote desktop']
  },
  {
    match: ['chatgpt', 'openai chatgpt'],
    aliases: [...AI_ALIASES, 'chatgpt', 'openai']
  },
  {
    match: ['claude'],
    aliases: [...AI_ALIASES, 'claude', 'anthropic']
  },
  {
    match: ['gemini', 'google gemini'],
    aliases: [...AI_ALIASES, 'gemini']
  },
  {
    match: ['perplexity'],
    aliases: [...AI_ALIASES, 'perplexity']
  },
  {
    match: ['deepseek', 'deep seek'],
    aliases: [...AI_ALIASES, 'deepseek', '深度求索']
  },
  {
    match: ['kimi', 'moonshot', '月之暗面'],
    aliases: [...AI_ALIASES, 'kimi', 'moonshot']
  },
  {
    match: ['doubao', '豆包'],
    aliases: [...AI_ALIASES, 'doubao', '豆包']
  },
  {
    match: ['tongyi', 'qianwen', '通义千问'],
    aliases: [...AI_ALIASES, 'tongyi', 'qwen', '通义千问']
  },
  {
    match: ['ollama'],
    aliases: [...AI_ALIASES, 'ollama', 'local llm', '本地模型']
  },
  {
    match: ['lm studio', 'lmstudio'],
    aliases: [...AI_ALIASES, 'lm studio', 'local llm', '本地模型']
  },
  {
    match: ['wps'],
    aliases: [...OFFICE_ALIASES, 'wps']
  },
  {
    match: ['microsoft word', ' winword', 'word.app'],
    aliases: [...OFFICE_ALIASES, 'word', 'doc', 'docx']
  },
  {
    match: ['microsoft excel', 'excel.app'],
    aliases: [...OFFICE_ALIASES, 'excel', 'xls', 'xlsx', 'sheet', 'spreadsheet', '表格']
  },
  {
    match: ['microsoft powerpoint', 'powerpoint.app'],
    aliases: [...OFFICE_ALIASES, 'powerpoint', 'ppt', 'slides', '幻灯片']
  },
  {
    match: ['pages.app', 'com.apple.pages'],
    aliases: [...OFFICE_ALIASES, 'pages']
  },
  {
    match: ['numbers.app', 'com.apple.numbers'],
    aliases: [...OFFICE_ALIASES, 'numbers', 'spreadsheet', '表格']
  },
  {
    match: ['keynote.app', 'com.apple.keynote'],
    aliases: [...OFFICE_ALIASES, 'keynote', 'slides', '幻灯片']
  },
  {
    match: ['notion'],
    aliases: [...OFFICE_ALIASES, ...NOTES_ALIASES, 'notion', 'knowledge base']
  },
  {
    match: ['linear'],
    aliases: [...TASK_ALIASES, 'linear']
  },
  {
    match: ['jira'],
    aliases: [...TASK_ALIASES, 'jira']
  },
  {
    match: ['trello'],
    aliases: [...TASK_ALIASES, 'trello']
  },
  {
    match: ['asana'],
    aliases: [...TASK_ALIASES, 'asana']
  },
  {
    match: ['things.app', 'cultured code things'],
    aliases: [...TASK_ALIASES, 'things']
  },
  {
    match: ['todoist'],
    aliases: [...TASK_ALIASES, 'todoist']
  },
  {
    match: ['microsoft to do', 'todo.app'],
    aliases: [...TASK_ALIASES, 'microsoft to do']
  },
  {
    match: ['滴答清单', 'ticktick'],
    aliases: [...TASK_ALIASES, 'ticktick', '滴答清单']
  },
  {
    match: ['chrome', 'google chrome'],
    aliases: [...BROWSER_ALIASES, 'chrome']
  },
  {
    match: ['microsoft edge', 'msedge', 'edge'],
    aliases: [...BROWSER_ALIASES, 'edge']
  },
  {
    match: ['safari', 'com.apple.safari'],
    aliases: [...BROWSER_ALIASES, 'safari']
  },
  {
    match: ['firefox', 'mozilla'],
    aliases: [...BROWSER_ALIASES, 'firefox']
  },
  {
    match: ['arc browser', 'company.thebrowser.browser', '/arc.app'],
    aliases: [...BROWSER_ALIASES, 'arc']
  },
  {
    match: ['brave browser', 'com.brave.browser', 'brave.exe'],
    aliases: [...BROWSER_ALIASES, 'brave']
  },
  {
    match: ['quark', '夸克浏览器'],
    aliases: [...BROWSER_ALIASES, 'quark', '夸克']
  },
  {
    match: ['360 browser', '360se', '360chrome', '360浏览器'],
    aliases: [...BROWSER_ALIASES, '360 browser', '360浏览器']
  },
  {
    match: ['qqbrowser', 'qq browser', 'qq浏览器'],
    aliases: [...BROWSER_ALIASES, 'qq browser', 'qq浏览器']
  },
  {
    match: ['sogou explorer', 'sogou browser', '搜狗浏览器'],
    aliases: [...BROWSER_ALIASES, 'sogou', '搜狗浏览器']
  },
  {
    match: ['obsidian'],
    aliases: [...NOTES_ALIASES, 'obsidian', 'markdown', 'md']
  },
  {
    match: ['onenote'],
    aliases: [...NOTES_ALIASES, 'onenote']
  },
  {
    match: ['zoom'],
    aliases: [...MEETING_ALIASES, 'zoom']
  },
  {
    match: ['teams', 'microsoft teams'],
    aliases: [...IM_ALIASES, ...MEETING_ALIASES, 'teams']
  },
  {
    match: ['tencent meeting', 'voov', '腾讯会议'],
    aliases: [...MEETING_ALIASES, 'tencent meeting', 'voov', '腾讯会议']
  },
  {
    match: ['onedrive'],
    aliases: [...CLOUD_ALIASES, 'onedrive']
  },
  {
    match: ['dropbox'],
    aliases: [...CLOUD_ALIASES, 'dropbox']
  },
  {
    match: ['google drive'],
    aliases: [...CLOUD_ALIASES, 'google drive']
  },
  {
    match: ['baidunetdisk', '百度网盘'],
    aliases: [...CLOUD_ALIASES, '百度网盘', 'baidu netdisk']
  },
  {
    match: ['aliyundrive', '阿里云盘'],
    aliases: [...CLOUD_ALIASES, '阿里云盘', 'aliyun drive']
  },
  {
    match: ['quark drive', '夸克网盘'],
    aliases: [...CLOUD_ALIASES, '夸克网盘', 'quark drive']
  },
  {
    match: ['jianguoyun', '坚果云'],
    aliases: [...CLOUD_ALIASES, '坚果云', 'jianguoyun']
  },
  {
    match: ['snipaste'],
    aliases: [...SCREENSHOT_ALIASES, 'snipaste']
  },
  {
    match: ['shottr'],
    aliases: [...SCREENSHOT_ALIASES, 'shottr']
  },
  {
    match: ['cleanshot'],
    aliases: [...SCREENSHOT_ALIASES, 'cleanshot']
  },
  {
    match: ['xnip'],
    aliases: [...SCREENSHOT_ALIASES, 'xnip']
  },
  {
    match: ['sharex'],
    aliases: [...SCREENSHOT_ALIASES, 'sharex']
  },
  {
    match: ['obs studio', 'open broadcaster software'],
    aliases: [...SCREENSHOT_ALIASES, ...MEDIA_ALIASES, 'obs', 'streaming']
  },
  {
    match: ['kap.app', 'getkap'],
    aliases: [...SCREENSHOT_ALIASES, 'kap']
  },
  {
    match: ['screen studio'],
    aliases: [...SCREENSHOT_ALIASES, 'screen studio']
  },
  {
    match: ['vlc'],
    aliases: [...MEDIA_ALIASES, 'vlc']
  },
  {
    match: ['iina'],
    aliases: [...MEDIA_ALIASES, 'iina']
  },
  {
    match: ['quicktime'],
    aliases: [...MEDIA_ALIASES, 'quicktime']
  },
  {
    match: ['netease music', '网易云音乐', '163music'],
    aliases: [...MEDIA_ALIASES, 'netease music', '网易云音乐']
  },
  {
    match: ['spotify'],
    aliases: [...MEDIA_ALIASES, 'spotify']
  },
  {
    match: ['apple music', 'music.app'],
    aliases: [...MEDIA_ALIASES, 'apple music']
  },
  {
    match: ['capcut', 'jianying', '剪映'],
    aliases: [...MEDIA_ALIASES, 'capcut', '剪映']
  },
  {
    match: ['premiere', 'adobe premiere'],
    aliases: [...MEDIA_ALIASES, 'premiere', 'pr', '剪辑']
  },
  {
    match: ['final cut pro'],
    aliases: [...MEDIA_ALIASES, 'final cut pro', 'fcp', '剪辑']
  },
  {
    match: ['davinci resolve'],
    aliases: [...MEDIA_ALIASES, 'davinci resolve', 'resolve', '剪辑', '调色']
  },
  {
    match: ['audition', 'adobe audition'],
    aliases: [...MEDIA_ALIASES, 'audition', 'au', '音频编辑']
  },
  {
    match: ['keka'],
    aliases: [...ARCHIVE_ALIASES, 'keka']
  },
  {
    match: ['the unarchiver'],
    aliases: [...ARCHIVE_ALIASES, 'the unarchiver']
  },
  {
    match: ['winrar'],
    aliases: [...ARCHIVE_ALIASES, 'winrar', 'rar']
  },
  {
    match: ['7-zip', '7zip'],
    aliases: [...ARCHIVE_ALIASES, '7zip', '7-zip']
  },
  {
    match: ['bandizip'],
    aliases: [...ARCHIVE_ALIASES, 'bandizip']
  },
  {
    match: ['filezilla'],
    aliases: [...TRANSFER_ALIASES, 'filezilla']
  },
  {
    match: ['transmit.app', 'panic transmit'],
    aliases: [...TRANSFER_ALIASES, 'transmit']
  },
  {
    match: ['cyberduck'],
    aliases: [...TRANSFER_ALIASES, 'cyberduck']
  },
  {
    match: ['1password'],
    aliases: [...SECURITY_ALIASES, '1password']
  },
  {
    match: ['bitwarden'],
    aliases: [...SECURITY_ALIASES, 'bitwarden']
  },
  {
    match: ['keepassxc'],
    aliases: [...SECURITY_ALIASES, 'keepassxc']
  },
  {
    match: ['authy'],
    aliases: [...SECURITY_ALIASES, 'authy']
  },
  {
    match: ['authenticator'],
    aliases: [...SECURITY_ALIASES, 'authenticator']
  },
  {
    match: ['tailscale'],
    aliases: [...NETWORK_ALIASES, ...REMOTE_ALIASES, 'tailscale']
  },
  {
    match: ['wireguard'],
    aliases: [...NETWORK_ALIASES, 'wireguard']
  },
  {
    match: ['clash'],
    aliases: [...NETWORK_ALIASES, 'clash']
  },
  {
    match: ['surge'],
    aliases: [...NETWORK_ALIASES, 'surge']
  },
  {
    match: ['parallels'],
    aliases: [...VIRTUALIZATION_ALIASES, 'parallels']
  },
  {
    match: ['vmware'],
    aliases: [...VIRTUALIZATION_ALIASES, 'vmware']
  },
  {
    match: ['virtualbox'],
    aliases: [...VIRTUALIZATION_ALIASES, 'virtualbox']
  },
  {
    match: ['utm.app', 'utm virtual'],
    aliases: [...VIRTUALIZATION_ALIASES, 'utm']
  },
  {
    match: ['com.apple.mail'],
    aliases: [...EMAIL_ALIASES, 'apple mail']
  },
  {
    // Basename fallback for scans without a bundle id. A bare 'mail' needle would attach to any
    // app whose name tokenises to 'mail', so the '.app' suffix carries the identity here.
    match: ['mail.app'],
    aliases: [...EMAIL_ALIASES]
  },
  {
    match: ['outlook', 'com.microsoft.outlook'],
    aliases: [...EMAIL_ALIASES, 'outlook']
  },
  {
    match: ['thunderbird'],
    aliases: [...EMAIL_ALIASES, 'thunderbird']
  },
  {
    // Bare 'spark' collides with Apache Spark and Spark AR.
    match: ['spark mail', 'spark desktop', 'com.readdle.smartemail'],
    aliases: [...EMAIL_ALIASES, 'spark']
  },
  {
    match: ['foxmail'],
    aliases: [...EMAIL_ALIASES, 'foxmail']
  },
  {
    match: ['mailmaster', '网易邮箱大师', '邮箱大师'],
    aliases: [...EMAIL_ALIASES, 'mailmaster', '网易邮箱大师']
  },
  {
    match: ['motrix'],
    aliases: [...DOWNLOAD_ALIASES, 'motrix']
  },
  {
    match: ['aria2'],
    aliases: [...DOWNLOAD_ALIASES, 'aria2']
  },
  {
    match: ['迅雷', 'thunder', 'com.xunlei'],
    aliases: [...DOWNLOAD_ALIASES, 'thunder', '迅雷']
  },
  {
    match: ['free download manager'],
    aliases: [...DOWNLOAD_ALIASES, 'free download manager']
  },
  {
    match: ['folx'],
    aliases: [...DOWNLOAD_ALIASES, 'folx']
  }
]

export function resolveAppSemanticAliases(app: AppSemanticAliasInput): string[] {
  const matcher = createAppCatalogNeedleMatcher(app)
  if (!matcher.hasIdentity) return []

  const aliases: string[] = []
  for (const entry of APP_SEMANTIC_CATALOG) {
    if (matcher.matchesAny(entry.match)) {
      aliases.push(...entry.aliases)
    }
  }

  return normalizeStringList([...aliases, ...resolveAppToolSourceAliases(app)])
}

export function resolveScannedAppSemanticAliases(appInfo: ScannedAppInfo): string[] {
  return resolveAppSemanticAliases({
    name: appInfo.name,
    displayName: appInfo.displayName,
    fileName: appInfo.fileName,
    alternateNames: appInfo.alternateNames,
    bundleId: appInfo.bundleId,
    uniqueId: appInfo.uniqueId,
    stableId: appInfo.stableId,
    path: appInfo.path,
    launchTarget: appInfo.launchTarget,
    displayPath: appInfo.displayPath,
    description: appInfo.description
  })
}
