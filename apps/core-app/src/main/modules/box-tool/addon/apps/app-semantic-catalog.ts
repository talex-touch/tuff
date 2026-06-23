import path from 'node:path'
import type { ScannedAppInfo } from './app-types'
import { normalizeStringList } from './app-utils'

export const APP_SEMANTIC_ALIAS_CATALOG_VERSION = 2

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

const IM_ALIASES = ['im', 'chat', 'messenger', 'message', 'messages', '即时通讯', '聊天', '通讯']

const DESIGN_ALIASES = ['design', 'designer', 'creative', 'graphics', 'image', '设计', '作图']
const DEV_ALIASES = ['dev', 'develop', 'developer', 'code', 'coding', 'ide', '开发', '编程']
const OFFICE_ALIASES = ['office', 'work', 'document', 'docs', '办公', '文档']
const BROWSER_ALIASES = ['browser', 'web', 'internet', '浏览器', '网页']
const TERMINAL_ALIASES = ['terminal', 'shell', 'cli', 'console', 'term', '终端', '命令行']
const NOTES_ALIASES = ['notes', 'note', 'memo', '笔记', '备忘录']
const MEETING_ALIASES = ['meeting', 'meet', 'conference', 'video meeting', '会议', '视频会议']
const CLOUD_ALIASES = ['cloud', 'drive', 'sync', 'storage', '云盘', '网盘', '同步']
const AI_ALIASES = ['ai', 'agent', 'chatbot', 'llm', 'assistant', '智能', '助手']
const TASK_ALIASES = ['pm', 'task', 'todo', 'kanban', 'project', '项目', '任务', '待办']
const DATABASE_ALIASES = ['db', 'database', 'sql', '数据库']
const API_ALIASES = ['api', 'http', 'request', 'rest', '接口', '调试']
const DEVOPS_ALIASES = [
  'devops',
  'infra',
  'container',
  'docker',
  'k8s',
  'kubernetes',
  '运维',
  '容器'
]
const GIT_ALIASES = ['git', 'repo', 'repository', 'github', '代码仓库', '仓库']
const SCREENSHOT_ALIASES = [
  'screenshot',
  'capture',
  'ocr',
  'screen',
  'recording',
  '截图',
  '录屏',
  '识别'
]
const MEDIA_ALIASES = [
  'video',
  'audio',
  'music',
  'player',
  'media',
  'edit video',
  '视频',
  '音频',
  '音乐',
  '播放器'
]
const ARCHIVE_ALIASES = ['zip', 'archive', 'compress', 'extract', '压缩', '解压']
const TRANSFER_ALIASES = ['ftp', 'sftp', 'transfer', 'file transfer', '传输', '文件传输']
const SECURITY_ALIASES = ['password', 'secret', '2fa', 'auth', 'security', '密码', '验证器', '安全']
const NETWORK_ALIASES = ['vpn', 'proxy', 'network', '网络', '代理']
const REMOTE_ALIASES = ['remote', 'ssh', 'rdp', '远程']
const VIRTUALIZATION_ALIASES = ['vm', 'virtual', 'virtualization', '虚拟机']
const PRODUCT_DESIGN_ALIASES = ['prototype', 'wireframe', 'product design', '产品设计', '原型']

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
  }
]

function normalizeForMatch(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function basenameWithoutExtension(value: string | null | undefined): string {
  const normalized = value?.trim()
  if (!normalized) return ''

  const baseName = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized
  return baseName.replace(/\.(app|exe|lnk|desktop)$/i, '')
}

function collectSearchText(app: AppSemanticAliasInput): string {
  return normalizeForMatch(
    [
      app.name,
      app.displayName,
      app.fileName,
      ...(app.alternateNames ?? []),
      app.bundleId,
      app.uniqueId,
      app.stableId,
      app.appIdentity,
      app.path,
      app.launchTarget,
      app.displayPath,
      app.description,
      basenameWithoutExtension(app.path),
      basenameWithoutExtension(app.launchTarget),
      app.path ? path.basename(app.path) : '',
      app.launchTarget ? path.basename(app.launchTarget) : ''
    ].join(' ')
  )
}

export function resolveAppSemanticAliases(app: AppSemanticAliasInput): string[] {
  const searchText = collectSearchText(app)
  if (!searchText) return []

  const aliases: string[] = []
  for (const entry of APP_SEMANTIC_CATALOG) {
    if (entry.match.some((needle) => searchText.includes(needle.toLowerCase()))) {
      aliases.push(...entry.aliases)
    }
  }

  return normalizeStringList(aliases)
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
