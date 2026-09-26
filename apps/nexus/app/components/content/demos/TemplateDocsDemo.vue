<script setup lang="ts">
// Docs template: the Tuff help center — a contents tree, one article rendered
// from markdown, an "On this page" outline that follows the article's own
// scroller, ⌘K search over articles and their sections, breadcrumbs,
// previous / next, "Was this helpful?", related articles, and who last edited
// the page. The featured article, "Plugin permissions", uses the real
// permission registry and manifest fields; every article is sample content.
//
// TxMarkdownView renders through v-html, which sets the rules here:
// - Its headings carry no id and must not get one: the docs page collects
//   id'd headings for its own outline and scrolls the whole page to them on
//   hashchange. The outline is parsed from the markdown source instead, and
//   matched to the rendered headings by position.
// - Its links are real <a>: one delegated click / auxclick handler keeps them
//   in the template. `#kb:<id>` opens an article; anything else would leave the
//   docs page, so it only reports what the host would open.
// - Nothing scrolls the page: the outline, ⌘K and the scripted tour move the
//   article's own scroller with scrollTo, never scrollIntoView.
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import type { TreeKey, TreeNode } from '@talex-touch/tuffex/tree'
import type { ComponentPublicInstance } from 'vue'
import { useIndicatorBox } from '@talex-touch/tuffex/sidebar-nav'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Mode = 'narrow' | 'column' | 'wide'
type GroupId = 'start' | 'plugins' | 'clipboard' | 'ai' | 'account' | 'trouble'
type ArticleId
  = | 'welcome'
    | 'corebox'
    | 'shortcuts'
    | 'install'
    | 'permissions'
    | 'manage'
    | 'first-plugin'
    | 'clipboard-history'
    | 'privacy'
    | 'providers'
    | 'ocr'
    | 'devices'
    | 'sync'
    | 'corebox-open'
    | 'search-slow'
type PersonId = 'lq' | 'mo' | 'ks' | 'ac' | 'nh' | 'zy'
type Vote = '' | 'up' | 'down'

interface Bi { zh: string, en: string }

interface Article {
  group: GroupId
  title: Bi
  /** Markdown: one line per paragraph (`breaks: true`), no markup in headings. */
  body: Bi
  days: number
  contributors: PersonId[]
  /** Share of readers who found it helpful, in percent (sample). */
  helpful: number
  badge?: 'new' | 'updated'
  related?: ArticleId[]
}

interface Heading { level: 2 | 3, text: string }

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so layout decisions CSS cannot make can follow it.
const StageSize = defineComponent({
  name: 'StageSize',
  props: {
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  emits: { resize: (_width: number, _height: number) => true },
  setup(props, { emit }) {
    watch(() => [props.width, props.height] as const, ([width, height]) => emit('resize', width, height), { immediate: true })
    return () => null
  },
})

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function bi(zh: string, en: string): Bi {
  return { zh, en }
}

function md(...lines: string[]): string {
  return lines.join('\n')
}

/* ─── Content ─────────────────────────────────────────────────────────── */

const NOW = Date.UTC(2026, 8, 24, 2, 0)
const DAY = 86_400_000

const PEOPLE: Record<PersonId, { name: Bi, hue: string }> = {
  lq: { name: bi('林乔', 'Lin Qiao'), hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  mo: { name: bi('Mara Okafor', 'Mara Okafor'), hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: bi('佐藤健二', 'Kenji Sato'), hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: bi('Ava Chen', 'Ava Chen'), hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: bi('Noor Haddad', 'Noor Haddad'), hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  zy: { name: bi('周屿', 'Zhou Yu'), hue: 'var(--tx-chart-categorical-2, #f5b647)' },
}

const GROUPS: Array<{ id: GroupId, label: Bi, icon: string, articles: ArticleId[] }> = [
  { id: 'start', label: bi('快速上手', 'Getting started'), icon: 'i-carbon-rocket', articles: ['welcome', 'corebox', 'shortcuts'] },
  { id: 'plugins', label: bi('插件', 'Plugins'), icon: 'i-carbon-plug', articles: ['install', 'permissions', 'manage', 'first-plugin'] },
  { id: 'clipboard', label: bi('剪贴板', 'Clipboard'), icon: 'i-carbon-paste', articles: ['clipboard-history', 'privacy'] },
  { id: 'ai', label: bi('AI 与智能', 'AI and intelligence'), icon: 'i-carbon-machine-learning-model', articles: ['providers', 'ocr'] },
  { id: 'account', label: bi('账户与同步', 'Account and sync'), icon: 'i-carbon-user-avatar', articles: ['devices', 'sync'] },
  { id: 'trouble', label: bi('故障排查', 'Troubleshooting'), icon: 'i-carbon-help', articles: ['corebox-open', 'search-slow'] },
]

const GROUP_BY_ID = new Map(GROUPS.map(group => [group.id, group]))
const ORDER: ArticleId[] = GROUPS.flatMap(group => group.articles)
const FEATURED: ArticleId = 'permissions'
const INITIAL_EXPANDED: GroupId[] = ['start', 'plugins']

// Callout markup: GitHub's `> [!NOTE]` syntax is not converted by marked, so
// the alert is raw HTML with a blank line after it, which lets the markdown
// inside still be parsed. The icon classes sit in this file so UnoCSS sees them.
function callout(kind: 'tip' | 'warning' | 'note', title: string, text: string): string {
  const icon = kind === 'tip' ? 'i-carbon-idea' : kind === 'warning' ? 'i-carbon-warning-alt' : 'i-carbon-information'
  return md(
    `<div class="markdown-alert markdown-alert-${kind}">`,
    `<p class="markdown-alert-title"><span class="${icon}" aria-hidden="true"></span>${title}</p>`,
    '',
    text,
    '',
    '</div>',
  )
}

// The real `plugins/touch-translation/manifest.json`, trimmed to its
// permission fields. The reason is the manifest's own text in both languages.
const MANIFEST_SNIPPET = md(
  '```json',
  '{',
  '  "id": "com.tuffex.translation",',
  '  "version": "1.0.18-beta.4",',
  '  "permissions": {',
  '    "required": ["network.internet", "intelligence.basic", "storage.plugin", "search.root-results"],',
  '    "optional": ["clipboard.write"]',
  '  },',
  '  "permissionReasons": {',
  '    "clipboard.write": "将翻译结果复制到剪贴板"',
  '  }',
  '}',
  '```',
)

const ARTICLES: Record<ArticleId, Article> = {
  'welcome': {
    group: 'start',
    title: bi('欢迎使用 Tuff', 'Welcome to Tuff'),
    days: 30,
    contributors: ['lq', 'mo'],
    helpful: 91,
    body: {
      zh: md(
        'Tuff 是常驻桌面的效率启动器：按下快捷键呼出 CoreBox，在一个输入框里搜索应用、文件、剪贴板和插件。',
        '',
        '## Tuff 是什么',
        '',
        'CoreBox 是 Tuff 的主界面，默认快捷键是 `⌥ Space`（Windows 上是 `Alt Space`）。你输入的内容会同时交给应用、文件、剪贴板历史和已安装的插件，结果按相关度排在一起。',
        '',
        '## 从哪里开始',
        '',
        '- 先读[认识 CoreBox](#kb:corebox)，熟悉搜索和结果操作',
        '- 到[插件商店](#kb:install)装几个常用插件',
        '- 常用按键见[快捷键速查](#kb:shortcuts)',
      ),
      en: md(
        'Tuff is a launcher that lives on your desktop: press a shortcut to bring up CoreBox and search apps, files, your clipboard and plugins from one field.',
        '',
        '## What Tuff is',
        '',
        'CoreBox is Tuff’s main window. The default shortcut is `⌥ Space` (`Alt Space` on Windows). What you type goes to apps, files, clipboard history and your installed plugins at once, and the results are ranked together.',
        '',
        '## Where to start',
        '',
        '- Read [Meet CoreBox](#kb:corebox) to learn searching and acting on results',
        '- Install a few everyday plugins from the [plugin store](#kb:install)',
        '- Keep [Keyboard shortcuts](#kb:shortcuts) handy',
      ),
    },
  },
  'corebox': {
    group: 'start',
    title: bi('认识 CoreBox', 'Meet CoreBox'),
    days: 12,
    contributors: ['ks', 'lq'],
    helpful: 88,
    body: {
      zh: md(
        '## 打开与搜索',
        '',
        '按 `⌥ Space` 呼出 CoreBox，直接输入即可搜索。`↑` `↓` 选择结果，`↵` 执行，`Esc` 关闭窗口。',
        '',
        '## 插件结果',
        '',
        '插件通过触发词接管输入，比如输入 `fy` 交给翻译插件。插件要把条目推到根结果列表，需要「推送根搜索结果」权限，见[插件权限说明](#kb:permissions)。',
      ),
      en: md(
        '## Opening and searching',
        '',
        'Press `⌥ Space` to bring up CoreBox and start typing. `↑` `↓` pick a result, `↵` runs it and `Esc` closes the window.',
        '',
        '## Plugin results',
        '',
        'A plugin takes over the field through its trigger: typing `fy` hands it to the Translate plugin. To put items in the root results a plugin needs the Push Root Search Results permission; see [Plugin permissions](#kb:permissions).',
      ),
    },
  },
  'shortcuts': {
    group: 'start',
    title: bi('快捷键速查', 'Keyboard shortcuts'),
    days: 45,
    contributors: ['ac'],
    helpful: 94,
    body: {
      zh: md(
        '下面是默认按键，都可以在设置里修改。',
        '',
        '## 全局',
        '',
        '| 操作 | macOS | Windows |',
        '| --- | --- | --- |',
        '| 呼出 CoreBox | <kbd>⌥</kbd> <kbd>Space</kbd> | <kbd>Alt</kbd> <kbd>Space</kbd> |',
        '',
        '## CoreBox 里',
        '',
        '| 操作 | 按键 |',
        '| --- | --- |',
        '| 选择上一个 / 下一个结果 | <kbd>↑</kbd> <kbd>↓</kbd> |',
        '| 执行选中的结果 | <kbd>↵</kbd> |',
        '| 关闭 CoreBox | <kbd>Esc</kbd> |',
      ),
      en: md(
        'These are the defaults; you can change any of them in Settings.',
        '',
        '## Global',
        '',
        '| Action | macOS | Windows |',
        '| --- | --- | --- |',
        '| Open CoreBox | <kbd>⌥</kbd> <kbd>Space</kbd> | <kbd>Alt</kbd> <kbd>Space</kbd> |',
        '',
        '## Inside CoreBox',
        '',
        '| Action | Keys |',
        '| --- | --- |',
        '| Previous / next result | <kbd>↑</kbd> <kbd>↓</kbd> |',
        '| Run the selected result | <kbd>↵</kbd> |',
        '| Close CoreBox | <kbd>Esc</kbd> |',
      ),
    },
  },
  'install': {
    group: 'plugins',
    title: bi('从插件商店安装', 'Install from the store'),
    days: 6,
    contributors: ['mo', 'nh', 'lq'],
    helpful: 89,
    related: ['permissions', 'manage', 'corebox'],
    body: {
      zh: md(
        '## 找到插件',
        '',
        '在插件商店按分类浏览，或直接搜索插件名、功能和触发词。卡片上会标出官方插件和发布渠道：`RELEASE`、`BETA` 或 `SNAPSHOT`。',
        '',
        '## 安装与授权',
        '',
        '点「安装」后，Tuff 会下载插件包并校验签名，再请你确认插件需要的权限。每项权限都附有理由，三个选项的含义见[插件权限说明](#kb:permissions)。',
        '',
        '## 装好之后',
        '',
        '插件会立即出现在 CoreBox 里：输入它的触发词即可，比如翻译的 `fy`、截图翻译的 `s-fy`。',
      ),
      en: md(
        '## Finding a plugin',
        '',
        'Browse the plugin store by category, or search for a name, a feature or a trigger. Cards mark official plugins and the release channel: `RELEASE`, `BETA` or `SNAPSHOT`.',
        '',
        '## Installing and granting',
        '',
        'After you press Install, Tuff downloads the package and verifies its signature, then asks you to confirm the permissions the plugin needs. Each one comes with a reason; the three choices are explained in [Plugin permissions](#kb:permissions).',
        '',
        '## Once it is installed',
        '',
        'The plugin shows up in CoreBox straight away: type its trigger, such as `fy` for Translate or `s-fy` for screenshot translation.',
      ),
    },
  },
  'permissions': {
    group: 'plugins',
    title: bi('插件权限说明', 'Plugin permissions'),
    days: 4,
    contributors: ['lq', 'mo', 'ks'],
    helpful: 86,
    badge: 'updated',
    related: ['install', 'manage', 'first-plugin'],
    body: {
      zh: md(
        '插件在 `manifest.json` 里声明需要的权限，安装时由你授权，之后随时可以撤销。这篇说明权限从哪里来、风险等级怎么分，以及安装时每个选项的含义。',
        '',
        '## 权限从哪里来',
        '',
        '每个插件在清单的 `permissions` 里分两组声明：`required` 是运行必需的，`optional` 在用到时才会询问。每一项都要在 `permissionReasons` 里写明理由，商店和安装确认框会原样展示。下面是翻译插件的清单片段：',
        '',
        MANIFEST_SNIPPET,
        '',
        '## 风险等级',
        '',
        'Tuff 把每项权限归入低、中、高三档风险，安装确认框用同样的颜色标出。常见的几项：',
        '',
        '| 权限 | 名称 | 风险 |',
        '| --- | --- | --- |',
        '| `clipboard.write` | 写入剪贴板 | 低 |',
        '| `storage.plugin` | 插件存储 | 低 |',
        '| `clipboard.read` | 读取剪贴板 | 中 |',
        '| `fs.read` | 读取文件 | 中 |',
        '| `network.internet` | 互联网访问 | 中 |',
        '| `fs.write` | 写入文件 | 高 |',
        '| `system.shell` | 执行命令 | 高 |',
        '| `search.root-results` | 推送根搜索结果 | 高 |',
        '',
        '### 高风险权限',
        '',
        callout('warning', '注意', '带 `system.shell` 或 `fs.write` 的插件可以执行命令、改写文件，只从可信来源安装。'),
        '',
        '`search.root-results` 同样属于高风险：插件可以把条目推到 CoreBox 的根结果列表里，和系统结果排在一起。',
        '',
        '## 安装时的授权选择',
        '',
        '安装确认框列出插件需要的全部权限和理由，你有三个选择：',
        '',
        '- **始终允许**：授权一直有效，直到你撤销',
        '- **仅本次会话**：退出 Tuff 后失效，下次使用时重新询问',
        '- **拒绝安装**：不安装插件，也不保留任何授权',
        '',
        callout('tip', '提示', '临时试用一个插件时，选「仅本次会话」。'),
        '',
        '### 非官方来源',
        '',
        '商店之外的插件包在权限确认之前还会多一步：「插件「{name}」来自非官方来源，确定继续安装吗？」确认之后才进入权限确认。',
        '',
        '## 撤销与审计',
        '',
        '在插件详情的「权限」页可以随时撤销单项授权；插件下次用到这项能力时会重新询问。',
        '',
        '## 开发者须知',
        '',
        '提交之前，先在本地检查清单和权限声明：',
        '',
        '```bash',
        'tuff validate',
        'tuff scan',
        '```',
        '',
        '从零开始写插件，见[开发第一个插件](#kb:first-plugin)；完整的清单字段见 [Nexus 开发者文档](https://tuff.tagzxia.com/docs/dev)。',
      ),
      en: md(
        'Plugins declare the permissions they need in `manifest.json`; you grant them at install time and can revoke them whenever you like. This page covers where permissions come from, how risk is rated, and what each install choice means.',
        '',
        '## Where permissions come from',
        '',
        'Each plugin lists two groups under `permissions` in its manifest: `required` ones it cannot run without, and `optional` ones it asks for when needed. Every entry needs a reason in `permissionReasons`, which the store and the install dialog show word for word. Here is the Translate plugin’s manifest, trimmed:',
        '',
        MANIFEST_SNIPPET,
        '',
        '## Risk levels',
        '',
        'Tuff rates every permission low, medium or high risk, and the install dialog marks them in the same colours. The common ones:',
        '',
        '| Permission | Name | Risk |',
        '| --- | --- | --- |',
        '| `clipboard.write` | Write Clipboard | Low |',
        '| `storage.plugin` | Plugin Storage | Low |',
        '| `clipboard.read` | Read Clipboard | Medium |',
        '| `fs.read` | Read Files | Medium |',
        '| `network.internet` | Internet Access | Medium |',
        '| `fs.write` | Write Files | High |',
        '| `system.shell` | Execute Commands | High |',
        '| `search.root-results` | Push Root Search Results | High |',
        '',
        '### High-risk permissions',
        '',
        callout('warning', 'Warning', 'A plugin with `system.shell` or `fs.write` can run commands and rewrite files. Only install one from a source you trust.'),
        '',
        '`search.root-results` is high risk too: it lets a plugin put items in CoreBox’s root results, right next to the system’s own.',
        '',
        '## Choosing at install time',
        '',
        'The install dialog lists every permission the plugin needs, with its reason, and offers three choices:',
        '',
        '- **Always allow**: the grant lasts until you revoke it',
        '- **Allow this session**: it ends when you quit Tuff, and you are asked again next time',
        '- **Reject install**: the plugin is not installed and nothing is granted',
        '',
        callout('tip', 'Tip', 'Just trying a plugin out? Pick Allow this session.'),
        '',
        '### Unofficial sources',
        '',
        'A package from outside the store adds one step before the permission dialog: “"{name}" comes from an unofficial source. Proceed with installation?” The permission dialog follows only once you confirm.',
        '',
        '## Revoking and auditing',
        '',
        'The Permissions tab in a plugin’s details lets you revoke any single grant; the plugin asks again the next time it needs that capability.',
        '',
        '## For developers',
        '',
        'Check the manifest and its permission declarations locally before you submit:',
        '',
        '```bash',
        'tuff validate',
        'tuff scan',
        '```',
        '',
        'Starting from scratch? See [Build your first plugin](#kb:first-plugin). Every manifest field is covered in the [Nexus developer docs](https://tuff.tagzxia.com/docs/dev).',
      ),
    },
  },
  'manage': {
    group: 'plugins',
    title: bi('管理与更新插件', 'Manage and update plugins'),
    days: 9,
    contributors: ['nh', 'ac'],
    helpful: 84,
    related: ['install', 'permissions', 'search-slow'],
    body: {
      zh: md(
        '## 查看更新',
        '',
        '在插件商店的「已安装」页点「检查更新」，有新版本的插件会排在最前面。',
        '',
        '## 更新时会发生什么',
        '',
        '更新会停止当前运行的插件，删除旧版本并安装新版本，完成后自动重新启用。新版本多出的权限会在确认框里单独列出。',
        '',
        '## 停用与卸载',
        '',
        '停用会保留插件和它的数据；卸载会删除插件文件及其缓存数据。',
      ),
      en: md(
        '## Checking for updates',
        '',
        'On the Installed page of the plugin store, press Check for updates; plugins with a new version move to the top.',
        '',
        '## What an update does',
        '',
        'An update stops the running plugin, removes the old version and installs the new one, then re-enables it automatically. Permissions the new version adds are listed separately in the confirmation.',
        '',
        '## Disabling and uninstalling',
        '',
        'Disabling keeps the plugin and its data; uninstalling removes the plugin files and their cached data.',
      ),
    },
  },
  'first-plugin': {
    group: 'plugins',
    title: bi('开发第一个插件', 'Build your first plugin'),
    days: 2,
    contributors: ['ks', 'zy', 'ac', 'mo'],
    helpful: 92,
    badge: 'new',
    related: ['permissions', 'install', 'corebox'],
    body: {
      zh: md(
        '用 Tuff CLI 几分钟就能搭好一个插件项目。',
        '',
        '## 创建项目',
        '',
        '```bash',
        'tuff create my-plugin',
        'cd my-plugin',
        '```',
        '',
        '清单文件 `manifest.json` 声明插件的 id、功能和触发词；先导脚本 `index.js` 负责注册能力、处理回调。',
        '',
        '## 本地调试',
        '',
        '```bash',
        'tuff dev',
        '```',
        '',
        '在 `manifest.json` 里把 `dev.enable` 设为 `true`，Tuff 会从本地开发服务器加载插件；清单或先导脚本改动后自动重新加载。',
        '',
        '## 发布',
        '',
        '```bash',
        'tuff build',
        'tuff publish',
        '```',
        '',
        '发布前先跑 `tuff validate` 检查清单，并给每项权限写好理由，见[插件权限说明](#kb:permissions)。',
      ),
      en: md(
        'With the Tuff CLI a plugin project is up in a few minutes.',
        '',
        '## Create the project',
        '',
        '```bash',
        'tuff create my-plugin',
        'cd my-plugin',
        '```',
        '',
        'The manifest, `manifest.json`, declares the plugin’s id, features and triggers; the prelude script, `index.js`, registers capabilities and handles callbacks.',
        '',
        '## Develop locally',
        '',
        '```bash',
        'tuff dev',
        '```',
        '',
        'Set `dev.enable` to `true` in `manifest.json` and Tuff loads the plugin from your local dev server, reloading it whenever the manifest or the prelude changes.',
        '',
        '## Publish',
        '',
        '```bash',
        'tuff build',
        'tuff publish',
        '```',
        '',
        'Run `tuff validate` on the manifest first, and give every permission a reason; see [Plugin permissions](#kb:permissions).',
      ),
    },
  },
  'clipboard-history': {
    group: 'clipboard',
    title: bi('剪贴板历史', 'Clipboard history'),
    days: 15,
    contributors: ['zy'],
    helpful: 90,
    body: {
      zh: md(
        '## 找回复制过的内容',
        '',
        '装好剪贴板历史插件后，在 CoreBox 输入 `剪贴板` 或 `clipboard-history` 打开历史，可以按文本、图片和文件筛选。',
        '',
        '## 固定与清理',
        '',
        '常用的条目可以固定，固定的条目不会被自动清理。',
      ),
      en: md(
        '## Finding what you copied',
        '',
        'With the Clipboard History plugin installed, type `clipboard-history` in CoreBox to open your history, then filter it by text, images or files.',
        '',
        '## Pinning and cleaning up',
        '',
        'Pin the items you reuse; pinned items are never cleaned up automatically.',
      ),
    },
  },
  'privacy': {
    group: 'clipboard',
    title: bi('敏感内容与隐私', 'Sensitive content and privacy'),
    days: 21,
    contributors: ['lq', 'nh'],
    helpful: 87,
    body: {
      zh: md(
        '## 数据留在哪里',
        '',
        '剪贴板历史只保存在这台设备上。',
        '',
        '## 复制了密码怎么办',
        '',
        '可以在历史里手动删除那一条；需要时也可以暂时停用剪贴板历史插件。',
      ),
      en: md(
        '## Where the data stays',
        '',
        'Clipboard history is kept on this device only.',
        '',
        '## If you copied a password',
        '',
        'Delete that item from the history by hand, or turn the Clipboard History plugin off for a while.',
      ),
    },
  },
  'providers': {
    group: 'ai',
    title: bi('接入自己的 AI 服务', 'Bring your own AI provider'),
    days: 18,
    contributors: ['ac', 'ks'],
    helpful: 81,
    body: {
      zh: md(
        '## 添加服务商',
        '',
        '在设置里添加 AI 服务商并填写密钥；密钥由安全存储保管，不会出现在日志里。',
        '',
        '## 按场景选择模型',
        '',
        '翻译、摘要和问答可以各自指定模型，没有指定的场景使用默认模型。',
      ),
      en: md(
        '## Adding a provider',
        '',
        'Add an AI provider in Settings and enter its key; keys stay in secure storage and never appear in logs.',
        '',
        '## Picking a model per task',
        '',
        'Translation, summaries and answers can each use their own model; anything left unset uses the default.',
      ),
    },
  },
  'ocr': {
    group: 'ai',
    title: bi('截图 OCR 与翻译', 'Screenshot OCR and translation'),
    days: 3,
    contributors: ['ks'],
    helpful: 85,
    badge: 'new',
    body: {
      zh: md(
        '## 截图翻译',
        '',
        '在 CoreBox 输入 `s-fy`，框选屏幕上的文字，译文直接出现在结果里。',
        '',
        '## 识别在哪里完成',
        '',
        'macOS 上用 Apple Vision，Windows 上用系统 OCR，识别在本机完成；系统没有 OCR 时，才会改用你配置的 AI 服务。',
      ),
      en: md(
        '## Screenshot translate',
        '',
        'Type `s-fy` in CoreBox and box the text on screen; the translation appears right in the results.',
        '',
        '## Where recognition happens',
        '',
        'Apple Vision on macOS and the system OCR on Windows, on the machine itself; only without a system OCR does Tuff fall back to the AI provider you configured.',
      ),
    },
  },
  'devices': {
    group: 'account',
    title: bi('登录与设备管理', 'Sign-in and devices'),
    days: 26,
    contributors: ['mo'],
    helpful: 83,
    body: {
      zh: md(
        '## 登录方式',
        '',
        'Tuff 账户支持 Passkey、GitHub、LinuxDO 和邮件魔法链接登录。',
        '',
        '## 管理设备',
        '',
        '账户页列出所有已登录的设备，不再使用的设备可以随时退出。',
      ),
      en: md(
        '## Ways to sign in',
        '',
        'A Tuff account signs in with a passkey, GitHub, LinuxDO or an emailed magic link.',
        '',
        '## Managing devices',
        '',
        'Your account page lists every signed-in device; sign out of any you no longer use.',
      ),
    },
  },
  'sync': {
    group: 'account',
    title: bi('处理同步冲突', 'Resolving sync conflicts'),
    days: 33,
    contributors: ['nh', 'zy'],
    helpful: 79,
    body: {
      zh: md(
        '## 冲突从哪里来',
        '',
        '两台设备离线时改了同一项设置，重新联网后就会出现冲突。',
        '',
        '## 保留哪一份',
        '',
        'Tuff 会列出两边的版本和修改时间，由你决定保留哪一份。',
      ),
      en: md(
        '## Where conflicts come from',
        '',
        'Two devices change the same setting while offline; once both are back online, the edits conflict.',
        '',
        '## Keeping one version',
        '',
        'Tuff lists both versions with the time each was changed, and you choose which one to keep.',
      ),
    },
  },
  'corebox-open': {
    group: 'trouble',
    title: bi('CoreBox 打不开', 'CoreBox won’t open'),
    days: 40,
    contributors: ['zy', 'lq'],
    helpful: 76,
    body: {
      zh: md(
        '## 检查快捷键',
        '',
        '如果 `⌥ Space` 被别的应用占用，CoreBox 可能不会弹出。换一个快捷键，或先退出冲突的应用。',
        '',
        '## 重新启动',
        '',
        '退出并重新打开 Tuff；问题仍在时，附上日志向我们反馈。',
      ),
      en: md(
        '## Check the shortcut',
        '',
        'If another app has taken `⌥ Space`, CoreBox may not appear. Pick another shortcut, or quit the app that holds it.',
        '',
        '## Restart',
        '',
        'Quit and reopen Tuff. If the problem stays, send us feedback with the logs attached.',
      ),
    },
  },
  'search-slow': {
    group: 'trouble',
    title: bi('搜索变慢', 'Search feels slow'),
    days: 11,
    contributors: ['ac'],
    helpful: 80,
    body: {
      zh: md(
        '## 看看索引',
        '',
        '第一次建立文件索引时搜索会稍慢，索引完成后就会恢复。',
        '',
        '## 停用不用的插件',
        '',
        '每个推送根结果的插件都会参与搜索，停用不常用的插件可以减轻负担。',
      ),
      en: md(
        '## Check the index',
        '',
        'Search is slower while the first file index is being built, and recovers once it finishes.',
        '',
        '## Turn off plugins you don’t use',
        '',
        'Every plugin that pushes root results takes part in each search; disabling the ones you rarely use lightens the load.',
      ),
    },
  },
}

function isArticleId(value: string | undefined): value is ArticleId {
  return !!value && value in ARTICLES
}

/** `##` / `###` lines outside code fences, in order. */
function parseHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      fenced = !fenced
      continue
    }
    const match = fenced ? null : /^(#{2,3}) (.+)$/.exec(line)
    if (match)
      headings.push({ level: match[1]!.length === 2 ? 2 : 3, text: match[2]!.trim() })
  }
  return headings
}

function readMinutes(markdown: string, chinese: boolean): number {
  const text = markdown.replace(/```[\s\S]*?```/g, '').replace(/<[^>]+>/g, '')
  const units = chinese ? text.replace(/\s+/g, '').length / 400 : text.split(/\s+/).filter(Boolean).length / 200
  return Math.max(1, Math.round(units))
}

/* ─── Copy ────────────────────────────────────────────────────────────── */

const zhCopy = {
  frameTitle: '三栏知识库',
  brand: 'Tuff 帮助中心',
  search: '搜索文档…',
  searchLabel: '搜索帮助中心（⌘K）',
  openNav: '打开目录',
  closeNav: '关闭目录',
  navLabel: '帮助中心目录',
  navTitle: '目录',
  filter: '筛选目录',
  filterEmpty: '没有匹配的文章',
  home: '帮助中心',
  outline: '本页目录',
  outlineMenu: (heading: string) => `本页目录：${heading}`,
  articleLabel: (title: string) => `文章：${title}`,
  people: (first: string, count: number) => (count > 1 ? `${first}等 ${count} 人` : first),
  meta: (people: string, date: string, minutes: number) => `${people}编辑 · 更新于 ${date} · ${minutes} 分钟阅读`,
  readTime: (minutes: number) => `${minutes} 分钟阅读`,
  updated: (date: string) => `更新于 ${date}`,
  badges: { new: '新', updated: '已更新' },
  feedback: {
    title: '这篇文章有帮助吗？',
    label: '文章反馈',
    up: '有帮助',
    down: '没帮助',
    share: (percent: number) => `${percent}% 的读者觉得有帮助（示例数据）`,
    reasonsTitle: '哪里可以改进？',
    reasons: { outdated: '内容过时', example: '缺少示例', steps: '步骤有误' },
    note: '补充说明（可选）',
    submit: '提交反馈',
    thanks: '谢谢，反馈已记录（示例）',
    received: '已收到你的反馈，谢谢。',
  },
  pager: { label: '上一篇与下一篇', prev: '上一篇', next: '下一篇' },
  related: '相关文章',
  external: (href: string) => `宿主会在浏览器中打开：${href}`,
  edit: '编辑此页',
  editHint: '宿主会打开这篇文章的编辑页（示例）',
  sample: '示例内容：文章为模板演示；权限名称与风险等级取自仓库的权限注册表。',
  palette: {
    label: '搜索帮助中心',
    placeholder: '搜索文章或章节…',
    empty: '没有匹配的文章或章节',
    keys: { move: '选择', open: '打开', close: '关闭' },
    feedback: '跳到「这篇文章有帮助吗」',
    home: '回到「欢迎使用 Tuff」',
    actions: '操作',
  },
  toast: { label: '操作结果', dismiss: '关闭提示' },
}

const enCopy: typeof zhCopy = {
  frameTitle: 'Three-pane docs',
  brand: 'Tuff help center',
  search: 'Search the docs…',
  searchLabel: 'Search the help center (⌘K)',
  openNav: 'Open contents',
  closeNav: 'Close contents',
  navLabel: 'Help center contents',
  navTitle: 'Contents',
  filter: 'Filter contents',
  filterEmpty: 'No matching articles',
  home: 'Help center',
  outline: 'On this page',
  outlineMenu: (heading: string) => `On this page: ${heading}`,
  articleLabel: (title: string) => `Article: ${title}`,
  people: (first: string, count: number) => (count > 2 ? `${first} and ${count - 1} others` : count === 2 ? `${first} and 1 other` : first),
  meta: (people: string, date: string, minutes: number) => `Edited by ${people} · Updated ${date} · ${minutes} min read`,
  readTime: (minutes: number) => `${minutes} min read`,
  updated: (date: string) => `Updated ${date}`,
  badges: { new: 'New', updated: 'Updated' },
  feedback: {
    title: 'Was this article helpful?',
    label: 'Article feedback',
    up: 'Yes',
    down: 'No',
    share: (percent: number) => `${percent}% of readers found it helpful (sample data)`,
    reasonsTitle: 'What could be better?',
    reasons: { outdated: 'Out of date', example: 'Needs an example', steps: 'Steps are wrong' },
    note: 'Anything else? (optional)',
    submit: 'Send feedback',
    thanks: 'Thanks, your feedback was recorded (sample)',
    received: 'Feedback received. Thank you.',
  },
  pager: { label: 'Previous and next article', prev: 'Previous', next: 'Next' },
  related: 'Related articles',
  external: (href: string) => `The host would open ${href} in the browser`,
  edit: 'Edit this page',
  editHint: 'The host would open this article in the editor (sample)',
  sample: 'Sample content: the articles are a template demo; permission names and risk levels come from the repo’s permission registry.',
  palette: {
    label: 'Search the help center',
    placeholder: 'Search articles and sections…',
    empty: 'No matching articles or sections',
    keys: { move: 'Move', open: 'Open', close: 'Close' },
    feedback: 'Jump to “Was this article helpful?”',
    home: 'Go to Welcome to Tuff',
    actions: 'Actions',
  },
  toast: { label: 'Result', dismiss: 'Dismiss' },
}

const copy = computed(() => (zh.value ? zhCopy : enCopy))

const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))

function personColors(id: PersonId): { bg: string, ink: string } {
  const hue = PEOPLE[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 22%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 70%, var(--tx-text-color-primary, #303133))`,
  }
}

/* ─── Stage ───────────────────────────────────────────────────────────── */

const stageWidth = ref(0)

function onStageResize(width: number): void {
  stageWidth.value = width
}

const mode = computed<Mode>(() => {
  const width = stageWidth.value
  if (!width)
    return 'column'
  if (width < 640)
    return 'narrow'
  return width < 960 ? 'column' : 'wide'
})

/* ─── State ───────────────────────────────────────────────────────────── */

const articleId = ref<ArticleId>(FEATURED)
const expanded = ref<TreeKey[]>([...INITIAL_EXPANDED])
const navQuery = ref('')
const navOpen = ref(false)
const paletteOpen = ref(false)
const activeIndex = ref(0)
const progress = ref(0)
const feedback = reactive({ vote: '' as Vote, outdated: false, example: false, steps: false, note: '', sent: false })

const rootRef = ref<HTMLElement | null>(null)
const scrollerRef = ref<HTMLElement | null>(null)
const bodyRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLElement | null>(null)
const feedbackRef = ref<HTMLElement | null>(null)
const navRef = ref<HTMLElement | null>(null)
const menuButtonRef = ref<HTMLButtonElement | null>(null)
const searchButtonRef = ref<HTMLButtonElement | null>(null)
const tocButtonRef = ref<HTMLButtonElement | null>(null)
const outlineRef = ref<HTMLElement | null>(null)

const article = computed(() => ARTICLES[articleId.value])
const group = computed(() => GROUP_BY_ID.get(article.value.group)!)
const markdown = computed(() => L(article.value.body))
const outline = computed(() => parseHeadings(markdown.value))
const currentHeading = computed(() => outline.value[activeIndex.value]?.text ?? L(article.value.title))

const treeNodes = computed<TreeNode[]>(() => GROUPS.map(item => ({
  key: item.id,
  label: L(item.label),
  icon: item.icon,
  children: item.articles.map(id => ({ key: id, label: L(ARTICLES[id].title) })),
})))

const crumbs = computed(() => [
  { label: copy.value.home },
  { label: L(group.value.label) },
  { label: L(article.value.title) },
])

const contributors = computed(() => article.value.contributors)
const metaLine = computed(() => {
  const names = contributors.value.map(id => L(PEOPLE[id].name))
  const people = copy.value.people(names[0] ?? '', names.length)
  return copy.value.meta(people, dateFormat.value.format(NOW - article.value.days * DAY), readMinutes(markdown.value, zh.value))
})

const neighbours = computed(() => {
  const index = ORDER.indexOf(articleId.value)
  return { prev: ORDER[index - 1], next: ORDER[index + 1] }
})

const relatedArticles = computed<ArticleId[]>(() => {
  const own = article.value.related
  if (own)
    return own
  const siblings = group.value.articles.filter(id => id !== articleId.value)
  return [...siblings, ...ORDER.filter(id => id !== articleId.value && !siblings.includes(id))].slice(0, 3)
})

function groupLabelOf(id: ArticleId): string {
  return L(GROUP_BY_ID.get(ARTICLES[id].group)!.label)
}

/* ─── Toast ───────────────────────────────────────────────────────────── */

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline' })
let toastTimer: ReturnType<typeof setTimeout> | undefined
// Every toast closes by itself; only a pointer or keyboard focus resting on
// it holds it open, and it closes shortly after both have left.
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

function notify(text: string, icon: string): void {
  toast.text = text
  toast.icon = icon
  toast.open = true
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(4000)
}

function holdToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = true
  else
    toastFocused = true
  clearTimeout(toastTimer)
}

function releaseToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = false
  else
    toastFocused = false
  if (toast.open && !toastHovered && !toastFocused)
    armToast(2000)
}

function onToastFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    releaseToast('focus')
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  toastHovered = false
  toastFocused = false
}

/* ─── Headings and the outline ────────────────────────────────────────── */

// Rendered headings, matched to the parsed outline by position, and their
// offsets inside the article scroller. Rebuilt whenever the markdown output
// changes — the sanitizer loads asynchronously, and switching an article or
// the language swaps the whole body — and re-measured on resize.
let headingEls: HTMLElement[] = []
let offsets: number[] = []
let rebuildFrame = 0
let scrollFrame = 0
let bodyObserver: MutationObserver | null = null
let sizeObserver: ResizeObserver | null = null
/** A heading the reader (or the tour) jumped to: it stays active until the reader scrolls. */
let lockIndex: number | null = null
let pendingHeading: number | null = null

/** Room left above a heading scrolled to the top of the article. */
const HEADING_GAP = 12
/** Keys that scroll the article when it (or something in it) has focus. */
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

function measure(): void {
  const scroller = scrollerRef.value
  if (!scroller) {
    offsets = []
    return
  }
  const origin = scroller.getBoundingClientRect().top - scroller.scrollTop
  offsets = headingEls.map(element => element.getBoundingClientRect().top - origin)
}

function syncActive(): void {
  const scroller = scrollerRef.value
  if (lockIndex !== null) {
    activeIndex.value = lockIndex
    return
  }
  if (!scroller || !offsets.length) {
    activeIndex.value = 0
    return
  }
  const probe = scroller.scrollTop + 32
  let index = 0
  for (let position = 0; position < offsets.length; position += 1) {
    if (offsets[position]! > probe)
      break
    index = position
  }
  // At the very end the last section is the one being read, even when it is
  // too short to reach the top.
  if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2)
    index = offsets.length - 1
  activeIndex.value = index
}

function updateProgress(): void {
  const scroller = scrollerRef.value
  if (!scroller)
    return
  const room = scroller.scrollHeight - scroller.clientHeight
  progress.value = room > 0 ? Math.round(scroller.scrollTop / room * 100) : 0
}

function invalidateHeadings(): void {
  headingEls = []
  offsets = []
}

function rebuild(): void {
  if (!hasWindow())
    return
  cancelAnimationFrame(rebuildFrame)
  rebuildFrame = requestAnimationFrame(() => {
    rebuildFrame = 0
    const body = bodyRef.value
    const found = body ? [...body.querySelectorAll<HTMLElement>('.markdown-body h2, .markdown-body h3')] : []
    headingEls = found.slice(0, outline.value.length)
    measure()
    realignLock()
    syncActive()
    updateProgress()
    measureIndicator()
    if (!offsets.length)
      return
    if (pendingHeading !== null) {
      const index = pendingHeading
      pendingHeading = null
      scrollToHeading(index)
    }
    if (tourPending)
      runTour()
  })
}

function onScroll(): void {
  if (scrollFrame)
    return
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    syncActive()
    updateProgress()
  })
}

function scrollToHeading(index: number, smooth = true): void {
  const scroller = scrollerRef.value
  const top = offsets[index]
  if (!scroller || top === undefined)
    return
  lockIndex = index
  activeIndex.value = index
  scroller.scrollTo({ top: Math.max(0, top - HEADING_GAP), behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
}

// A jumped-to heading owns the scroll position until the reader scrolls. When
// the article reflows — the stage expanding or collapsing, the column changing
// width — TemplateFrame puts back the old pixel offset, which no longer lands
// on the heading; it goes back to the top instead, instantly.
function realignLock(): void {
  const scroller = scrollerRef.value
  const top = lockIndex === null ? undefined : offsets[lockIndex]
  if (!scroller || top === undefined)
    return
  const target = Math.max(0, top - HEADING_GAP)
  if (Math.abs(scroller.scrollTop - target) > 1)
    scroller.scrollTop = target
}

function releaseLock(): void {
  if (lockIndex === null)
    return
  lockIndex = null
  syncActive()
}

/** Input that scrolls the article hands the position back to the reader. */
function isArticleTarget(target: EventTarget | null): boolean {
  return target instanceof Node && !!scrollerRef.value?.contains(target)
}

function scrollToFeedback(): void {
  const scroller = scrollerRef.value
  const target = feedbackRef.value
  if (!scroller || !target)
    return
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  scroller.scrollTo({ top: Math.max(0, top - HEADING_GAP), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

// The menu item that held focus is gone once the menu closes; the trigger,
// which now names the chosen section, takes it back.
function onTocSelect(index: number): void {
  scrollToHeading(index)
  void nextTick(() => tocButtonRef.value?.focus({ preventScroll: true }))
}

// The sliding marker in the wide outline, measured the way TxSidebarNav
// measures its highlight. The item elements are kept by index; the list is
// rebuilt for every article, so it is cleared before each re-render.
const outlineItems: Array<HTMLElement | undefined> = []

function setOutlineItem(element: Element | ComponentPublicInstance | null, index: number): void {
  outlineItems[index] = element instanceof HTMLElement ? element : undefined
}

const { box: indicatorBox, revealed: indicatorRevealed, measure: measureIndicator } = useIndicatorBox({
  container: outlineRef,
  target: () => outlineItems[activeIndex.value] ?? null,
})

const indicatorStyle = computed(() => ({
  transform: `translateY(${indicatorBox.value?.top ?? 0}px)`,
  height: `${indicatorBox.value?.height ?? 0}px`,
  opacity: indicatorBox.value ? 1 : 0,
}))

watch(articleId, () => {
  outlineItems.length = 0
}, { flush: 'pre' })

/* ─── Links inside the article ────────────────────────────────────────── */

function onBodyClick(event: MouseEvent): void {
  const anchor = (event.target as Element | null)?.closest('a')
  if (!anchor || !bodyRef.value?.contains(anchor))
    return
  // Left click, ⌘ / Ctrl / Shift click and Enter on a focused link all land
  // here; none of them may navigate the docs page.
  event.preventDefault()
  const href = anchor.getAttribute('href') ?? ''
  const target = href.startsWith('#kb:') ? href.slice(4) : ''
  if (isArticleId(target))
    openArticle(target, { focusTitle: true })
  else if (href)
    notify(copy.value.external(href), 'i-carbon-launch')
}

function onBodyAuxClick(event: MouseEvent): void {
  // Middle click would open the link in a new tab.
  if ((event.target as Element | null)?.closest('a'))
    event.preventDefault()
}

/* ─── Navigation ──────────────────────────────────────────────────────── */

function resetFeedback(): void {
  feedback.vote = ''
  feedback.outdated = false
  feedback.example = false
  feedback.steps = false
  feedback.note = ''
  feedback.sent = false
}

function openArticle(id: ArticleId, options: { heading?: number, focusTitle?: boolean } = {}): void {
  cancelTour()
  const changed = id !== articleId.value
  const groupId = ARTICLES[id].group
  if (!expanded.value.includes(groupId))
    expanded.value = [...expanded.value, groupId]
  if (navOpen.value)
    navOpen.value = false
  if (changed) {
    articleId.value = id
    resetFeedback()
    invalidateHeadings()
    lockIndex = null
    activeIndex.value = 0
    pendingHeading = options.heading ?? null
    if (scrollerRef.value)
      scrollerRef.value.scrollTop = 0
    void nextTick(rebuild)
  }
  else if (options.heading !== undefined) {
    scrollToHeading(options.heading)
  }
  // Only ever from the reader's own click or key press.
  if (options.focusTitle)
    void nextTick(() => titleRef.value?.focus({ preventScroll: true }))
}

function onTreeSelect(payload: { key: TreeKey, node: TreeNode }): void {
  const key = String(payload.key)
  if (payload.node.children?.length) {
    const open = expanded.value.includes(key)
    expanded.value = open ? expanded.value.filter(item => item !== key) : [...expanded.value, key]
    return
  }
  // From the slide-over panel the tree goes inert as it closes, so focus
  // follows the reader into the article.
  if (isArticleId(key))
    openArticle(key, { focusTitle: mode.value === 'narrow' })
}

function onCrumb(_item: unknown, index: number): void {
  if (index === 0)
    openArticle('welcome', { focusTitle: true })
  else if (index === 1 && group.value.articles[0])
    openArticle(group.value.articles[0], { focusTitle: true })
}

function openNav(): void {
  navOpen.value = true
  void nextTick(() => navRef.value?.focus({ preventScroll: true }))
}

function closeNav(): void {
  if (!navOpen.value)
    return
  navOpen.value = false
  void nextTick(() => menuButtonRef.value?.focus({ preventScroll: true }))
}

watch(mode, (next) => {
  if (next !== 'narrow')
    navOpen.value = false
  void nextTick(rebuild)
})

/* ─── ⌘K ──────────────────────────────────────────────────────────────── */

const commands = computed<CommandPaletteItem[]>(() => {
  const list: CommandPaletteItem[] = []
  for (const id of ORDER) {
    const item = ARTICLES[id]
    list.push({ id: `a:${id}`, title: L(item.title), description: groupLabelOf(id), icon: 'i-carbon-document', keywords: [item.title.zh, item.title.en] })
  }
  for (const id of ORDER) {
    const title = L(ARTICLES[id].title)
    parseHeadings(L(ARTICLES[id].body)).forEach((heading, index) => {
      list.push({ id: `h:${id}:${index}`, title: heading.text, description: title, icon: 'i-carbon-text-link' })
    })
  }
  list.push(
    { id: 'x:feedback', title: copy.value.palette.feedback, description: copy.value.palette.actions, icon: 'i-carbon-thumbs-up' },
    { id: 'x:home', title: copy.value.palette.home, description: copy.value.palette.actions, icon: 'i-carbon-home' },
  )
  return list
})

function openPalette(): void {
  cancelTour()
  paletteOpen.value = true
}

function onCommand(item: CommandPaletteItem): void {
  const [kind, id, index] = item.id.split(':')
  if (kind === 'a' && isArticleId(id))
    openArticle(id)
  else if (kind === 'h' && isArticleId(id))
    openArticle(id, { heading: Number(index) })
  else if (id === 'feedback')
    scrollToFeedback()
  else if (id === 'home')
    openArticle('welcome')
}

// TxCommandPalette does not restore focus; hand it back to the trigger.
function onPaletteClose(): void {
  void nextTick(() => searchButtonRef.value?.focus({ preventScroll: true }))
}

/* ─── Feedback ────────────────────────────────────────────────────────── */

function onVote(value: string | number | Array<string | number>): void {
  const vote = String(value) as Vote
  feedback.vote = vote
  feedback.sent = vote === 'up'
  if (vote === 'up')
    notify(copy.value.feedback.thanks, 'i-carbon-thumbs-up')
}

function submitFeedback(): void {
  feedback.sent = true
  notify(copy.value.feedback.thanks, 'i-carbon-chat')
}

/* ─── Keyboard ────────────────────────────────────────────────────────── */

function onRootKeydown(event: KeyboardEvent): void {
  cancelTour()
  if (SCROLL_KEYS.has(event.key) && isArticleTarget(event.target))
    releaseLock()
  // Bound to this root, not window: the docs site owns ⌘K on window for its
  // own search and skips a press a handler before it has claimed.
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openPalette()
    return
  }
  if (event.key === 'Escape' && !event.defaultPrevented && navOpen.value) {
    // Closing the panel is this press's whole job; the overlay stays open.
    event.preventDefault()
    closeNav()
  }
}

/** Pointer, wheel or touch: the tour stops; inside the article it also scrolls, so a jumped-to heading lets go. */
function onRootInput(event: Event): void {
  cancelTour()
  if (isArticleTarget(event.target))
    releaseLock()
}

/* ─── Scripted tour ───────────────────────────────────────────────────── */

// On first sight the article scrolls itself to "Risk levels", then to
// "Choosing at install time", and stops. It only moves its own scroller, and
// any reader input inside the template cancels it. Reduced motion lands on the
// final section straight away.
const tourTimers = new Set<ReturnType<typeof setTimeout>>()
let entered = false
let tourPending = false
let interacted = false

function clearTour(): void {
  for (const timer of tourTimers)
    clearTimeout(timer)
  tourTimers.clear()
  tourPending = false
}

function tourLater(ms: number, run: () => void): void {
  const timer = setTimeout(() => {
    tourTimers.delete(timer)
    run()
  }, ms)
  tourTimers.add(timer)
}

function runTour(): void {
  tourPending = false
  if (interacted || articleId.value !== FEATURED)
    return
  const sections = outline.value.flatMap((heading, index) => (heading.level === 2 ? [index] : []))
  const second = sections[1]
  const third = sections[2]
  if (second === undefined || third === undefined)
    return
  if (prefersReducedMotion()) {
    scrollToHeading(third, false)
    return
  }
  tourLater(1200, () => scrollToHeading(second))
  tourLater(3400, () => scrollToHeading(third))
}

function startTour(): void {
  clearTour()
  if (interacted || articleId.value !== FEATURED)
    return
  if (offsets.length)
    runTour()
  else
    tourPending = true
}

/** Any reader input stops the tour; where the article sits is left alone. */
function cancelTour(): void {
  interacted = true
  clearTour()
}

function onEnter(): void {
  entered = true
  startTour()
}

/* ─── Lifecycle ───────────────────────────────────────────────────────── */

function observe(): void {
  bodyObserver?.disconnect()
  sizeObserver?.disconnect()
  const body = bodyRef.value
  const scroller = scrollerRef.value
  if (!body || !scroller || !hasWindow())
    return
  if ('MutationObserver' in window) {
    bodyObserver = new MutationObserver(rebuild)
    bodyObserver.observe(body, { childList: true, subtree: true })
  }
  if ('ResizeObserver' in window) {
    sizeObserver = new ResizeObserver(() => {
      measure()
      realignLock()
      syncActive()
      updateProgress()
    })
    sizeObserver.observe(body)
    sizeObserver.observe(scroller)
  }
  rebuild()
}

onMounted(observe)

function resetDemo(): void {
  clearTour()
  closeToast()
  paletteOpen.value = false
  navOpen.value = false
  navQuery.value = ''
  expanded.value = [...INITIAL_EXPANDED]
  resetFeedback()
  interacted = false
  lockIndex = null
  pendingHeading = null
  articleId.value = FEATURED
  activeIndex.value = 0
  invalidateHeadings()
  if (scrollerRef.value)
    scrollerRef.value.scrollTop = 0
  void nextTick(rebuild)
  if (entered)
    startTour()
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(() => {
  clearTour()
  clearTimeout(toastTimer)
  bodyObserver?.disconnect()
  sizeObserver?.disconnect()
  if (hasWindow()) {
    cancelAnimationFrame(rebuildFrame)
    cancelAnimationFrame(scrollFrame)
  }
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div
        ref="rootRef"
        class="docs"
        :class="`is-${mode}`"
        @keydown="onRootKeydown"
        @pointerdown="onRootInput"
        @wheel.passive="onRootInput"
        @touchstart.passive="onRootInput"
      >
        <header class="docs__top">
          <button
            v-if="mode === 'narrow'"
            ref="menuButtonRef"
            type="button"
            class="docs__icon-button"
            :aria-label="copy.openNav"
            :aria-expanded="navOpen ? 'true' : 'false'"
            @click="openNav"
          >
            <span class="i-carbon-menu" aria-hidden="true" />
          </button>
          <div class="docs__brand">
            <span class="docs__logo" aria-hidden="true"><span class="i-carbon-book" /></span>
            <strong class="docs__title">{{ copy.brand }}</strong>
          </div>
          <button
            ref="searchButtonRef"
            type="button"
            class="docs__search"
            :aria-label="copy.searchLabel"
            aria-keyshortcuts="Meta+K Control+K"
            @click="openPalette"
          >
            <span class="i-carbon-search docs__search-icon" aria-hidden="true" />
            <span class="docs__search-text">{{ copy.search }}</span>
            <TxKbd class="docs__search-kbd">
              ⌘K
            </TxKbd>
          </button>
        </header>

        <!-- One tree for every width: a column beside the article, or a
             panel that slides over it below 640px (not TxDrawer, which
             would take Tab and Escape on the whole document). -->
        <div v-if="mode === 'narrow'" class="docs__scrim" :class="{ 'is-open': navOpen }" aria-hidden="true" @click="closeNav" />
        <aside
          ref="navRef"
          class="docs__nav"
          :class="{ 'is-drawer': mode === 'narrow', 'is-open': navOpen }"
          :aria-label="copy.navLabel"
          :tabindex="mode === 'narrow' ? -1 : undefined"
          :inert="mode === 'narrow' && !navOpen ? true : undefined"
        >
          <div v-if="mode === 'narrow'" class="docs__nav-head">
            <strong>{{ copy.navTitle }}</strong>
            <button type="button" class="docs__icon-button" :aria-label="copy.closeNav" @click="closeNav">
              <span class="i-carbon-close" aria-hidden="true" />
            </button>
          </div>
          <div class="docs__filter">
            <TxSearchInput v-model="navQuery" :placeholder="copy.filter" />
          </div>
          <div class="docs__tree">
            <TxTree
              :nodes="treeNodes"
              :model-value="articleId"
              :expanded-keys="expanded"
              :filter-text="navQuery"
              :indent="14"
              :aria-label="copy.navLabel"
              @update:expanded-keys="expanded = $event"
              @select="onTreeSelect"
            >
              <template #item="{ node, expanded: open, hasChildren, toggleExpand }">
                <div
                  class="docs-tree-row"
                  :class="{ 'is-group': hasChildren, 'is-current': node.key === articleId }"
                  :title="node.label"
                >
                  <span
                    v-if="hasChildren"
                    class="docs-tree-row__caret i-carbon-chevron-right"
                    :class="{ 'is-open': open }"
                    aria-hidden="true"
                    @click.stop="toggleExpand()"
                  />
                  <span v-if="hasChildren" class="docs-tree-row__icon" :class="node.icon" aria-hidden="true" />
                  <span class="docs-tree-row__label">{{ node.label }}</span>
                  <TxBadge
                    v-if="!hasChildren && isArticleId(String(node.key)) && ARTICLES[node.key as ArticleId].badge"
                    class="docs-tree-row__badge"
                    :variant="ARTICLES[node.key as ArticleId].badge === 'new' ? 'primary' : 'success'"
                  >
                    {{ copy.badges[ARTICLES[node.key as ArticleId].badge!] }}
                  </TxBadge>
                </div>
              </template>
              <template #empty>
                <p class="docs-tree-empty">
                  {{ copy.filterEmpty }}
                </p>
              </template>
            </TxTree>
          </div>
        </aside>

        <div class="docs__main">
          <div class="docs__toolbar">
            <TxBreadcrumb class="docs__crumbs" :items="crumbs" @click="onCrumb" />
            <TxDropdownMenu v-if="mode !== 'wide' && outline.length" placement="bottom-end" :min-width="220" :max-height="320">
              <template #trigger>
                <button ref="tocButtonRef" type="button" class="docs__toc" aria-haspopup="menu" :aria-label="copy.outlineMenu(currentHeading)">
                  <span class="i-carbon-list" aria-hidden="true" />
                  <span class="docs__toc-text">{{ currentHeading }}</span>
                  <span class="i-carbon-chevron-down docs__toc-chevron" aria-hidden="true" />
                </button>
              </template>
              <TxDropdownItem v-for="(heading, index) in outline" :key="`${articleId}-${index}`" @select="onTocSelect(index)">
                <span class="docs-toc-item" :class="{ 'is-sub': heading.level === 3 }">{{ heading.text }}</span>
                <template v-if="index === activeIndex" #right>
                  <span class="i-carbon-checkmark docs-toc-item__check" aria-hidden="true" />
                </template>
              </TxDropdownItem>
            </TxDropdownMenu>
          </div>
          <div class="docs__progress" aria-hidden="true">
            <TxProgressBar :percentage="progress" height="2px" />
          </div>

          <div
            ref="scrollerRef"
            class="docs__scroll"
            tabindex="0"
            role="region"
            :aria-label="copy.articleLabel(L(article.title))"
            @scroll.passive="onScroll"
          >
            <article class="docs-article">
              <header class="docs-article__head">
                <span class="docs-article__group">{{ L(group.label) }}</span>
                <h2 ref="titleRef" class="docs-article__title" tabindex="-1">
                  {{ L(article.title) }}
                </h2>
                <div class="docs-article__meta">
                  <TxAvatarGroup :max="3" :size="22" :overlap="6">
                    <TxAvatar
                      v-for="id in contributors"
                      :key="id"
                      :name="L(PEOPLE[id].name)"
                      :background-color="personColors(id).bg"
                      :text-color="personColors(id).ink"
                    />
                  </TxAvatarGroup>
                  <span>{{ metaLine }}</span>
                </div>
              </header>

              <!-- Link clicks are delegated here (see onBodyClick). -->
              <div ref="bodyRef" class="docs-article__body" @click="onBodyClick" @auxclick="onBodyAuxClick">
                <TxMarkdownView class="docs-md" :content="markdown" />
              </div>

              <section ref="feedbackRef" class="docs-feedback" :aria-label="copy.feedback.label">
                <div class="docs-feedback__row">
                  <strong class="docs-feedback__title">{{ copy.feedback.title }}</strong>
                  <TxFlatRadio :model-value="feedback.vote" size="sm" :aria-label="copy.feedback.title" @update:model-value="onVote">
                    <TxFlatRadioItem value="up" icon="i-carbon-thumbs-up" :label="copy.feedback.up" />
                    <TxFlatRadioItem value="down" icon="i-carbon-thumbs-down" :label="copy.feedback.down" />
                  </TxFlatRadio>
                </div>
                <p class="docs-feedback__share">
                  {{ copy.feedback.share(article.helpful) }}
                </p>
                <div v-if="feedback.vote === 'down' && !feedback.sent" class="docs-feedback__form">
                  <span class="docs-feedback__label">{{ copy.feedback.reasonsTitle }}</span>
                  <div class="docs-feedback__reasons">
                    <TxCheckbox v-model="feedback.outdated" :label="copy.feedback.reasons.outdated" />
                    <TxCheckbox v-model="feedback.example" :label="copy.feedback.reasons.example" />
                    <TxCheckbox v-model="feedback.steps" :label="copy.feedback.reasons.steps" />
                  </div>
                  <TxTextarea v-model="feedback.note" :rows="2" :max-length="280" show-count resize="none" :placeholder="copy.feedback.note" />
                  <div>
                    <TxButton size="sm" variant="primary" icon="i-carbon-send-alt" @click="submitFeedback">
                      {{ copy.feedback.submit }}
                    </TxButton>
                  </div>
                </div>
                <p v-else-if="feedback.sent" class="docs-feedback__done" role="status">
                  <span class="i-carbon-checkmark-outline" aria-hidden="true" />
                  {{ copy.feedback.received }}
                </p>
              </section>

              <nav class="docs-pager" :aria-label="copy.pager.label">
                <TxCardItem
                  v-if="neighbours.prev"
                  class="docs-pager__item"
                  clickable
                  role="link"
                  icon-class="i-carbon-arrow-left"
                  :title="L(ARTICLES[neighbours.prev].title)"
                  :subtitle="copy.pager.prev"
                  @click="openArticle(neighbours.prev!, { focusTitle: true })"
                />
                <TxCardItem
                  v-if="neighbours.next"
                  class="docs-pager__item is-next"
                  clickable
                  role="link"
                  icon-class="i-carbon-arrow-right"
                  :title="L(ARTICLES[neighbours.next].title)"
                  :subtitle="copy.pager.next"
                  @click="openArticle(neighbours.next!, { focusTitle: true })"
                />
              </nav>

              <section class="docs-related" :aria-label="copy.related">
                <h3 class="docs-related__title">
                  {{ copy.related }}
                </h3>
                <div class="docs-related__list">
                  <TxCardItem
                    v-for="id in relatedArticles"
                    :key="id"
                    class="docs-related__item"
                    clickable
                    role="link"
                    icon-class="i-carbon-document"
                    :title="L(ARTICLES[id].title)"
                    :subtitle="groupLabelOf(id)"
                    @click="openArticle(id, { focusTitle: true })"
                  />
                </div>
              </section>

              <p class="docs-article__note">
                {{ copy.sample }}
              </p>
            </article>
          </div>

          <!-- Keeps its box while closed (TxToastPanel fades rather than
               unmounts), so it is inert until it opens. Pointer or focus on
               it holds it open; otherwise it closes by itself. -->
          <div
            class="docs__toast"
            :class="{ 'is-open': toast.open }"
            :inert="toast.open ? undefined : true"
            @mouseenter="holdToast('hover')"
            @mouseleave="releaseToast('hover')"
            @focusin="holdToast('focus')"
            @focusout="onToastFocusOut"
          >
            <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toast.label">
              <div class="docs-toast">
                <span class="docs-toast__icon" :class="toast.icon" aria-hidden="true" />
                <span class="docs-toast__text">{{ toast.text }}</span>
                <button type="button" class="docs-toast__close" :aria-label="copy.toast.dismiss" @click="closeToast">
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </div>
            </TxToastPanel>
          </div>
        </div>

        <aside v-if="mode === 'wide'" class="docs__rail">
          <nav class="docs-outline" :aria-label="copy.outline">
            <p class="docs-outline__title">
              {{ copy.outline }}
            </p>
            <div ref="outlineRef" class="docs-outline__list">
              <span
                class="docs-outline__marker"
                :class="{ 'is-revealed': indicatorRevealed }"
                :style="indicatorStyle"
                aria-hidden="true"
              />
              <button
                v-for="(heading, index) in outline"
                :key="`${articleId}-${index}`"
                :ref="element => setOutlineItem(element, index)"
                type="button"
                class="docs-outline__item"
                :class="{ 'is-sub': heading.level === 3, 'is-active': index === activeIndex }"
                :aria-current="index === activeIndex ? 'true' : undefined"
                @click="scrollToHeading(index)"
              >
                {{ heading.text }}
              </button>
            </div>
          </nav>
          <div class="docs-rail__meta">
            <span><span class="i-carbon-time" aria-hidden="true" /> {{ copy.readTime(readMinutes(markdown, zh)) }}</span>
            <span><span class="i-carbon-recently-viewed" aria-hidden="true" /> {{ copy.updated(dateFormat.format(NOW - article.days * DAY)) }}</span>
          </div>
          <TxButton size="sm" variant="ghost" icon="i-carbon-edit" @click="notify(copy.editHint, 'i-carbon-edit')">
            {{ copy.edit }}
          </TxButton>
        </aside>

        <TxCommandPalette
          v-model="paletteOpen"
          :commands="commands"
          :placeholder="copy.palette.placeholder"
          :empty-text="copy.palette.empty"
          :aria-label="copy.palette.label"
          @select="onCommand"
          @close="onPaletteClose"
        >
          <template #footer>
            <div class="docs-palette-foot">
              <span><TxKbd>↑</TxKbd><TxKbd>↓</TxKbd>{{ copy.palette.keys.move }}</span>
              <span><TxKbd>↵</TxKbd>{{ copy.palette.keys.open }}</span>
              <span><TxKbd>Esc</TxKbd>{{ copy.palette.keys.close }}</span>
            </div>
          </template>
        </TxCommandPalette>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.docs {
  --docs-line: var(--tx-border-color-lighter, #ebeef5);
  --docs-rail: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 45%, var(--tx-bg-color, #fff));
  --docs-ease: var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));

  position: relative;
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'top top'
    'nav main';
  grid-template-columns: 208px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Top bar ---------------------------------------------------------------- */

.docs__top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--docs-line);
  grid-area: top;
}

.docs__brand {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 8px;
}

.docs__logo {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--tx-color-success-light-9, #f0f9eb);
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
  font-size: 15px;
}

.docs__title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.docs__search {
  display: flex;
  width: min(300px, 50%);
  height: 32px;
  box-sizing: border-box;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  padding: 0 6px 0 10px;
  border: 0;
  border-radius: 9px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--docs-line);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.docs__search:hover {
  background: var(--tx-fill-color, #f0f2f5);
}

.docs__search:focus-visible,
.docs__icon-button:focus-visible,
.docs__toc:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs__search-icon {
  flex: none;
  font-size: 14px;
}

.docs__search-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs__search-kbd {
  flex: none;
}

.docs__icon-button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font-size: 16px;
}

.docs__icon-button:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

/* Contents --------------------------------------------------------------- */

.docs__nav {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset -1px 0 0 var(--docs-line);
  grid-area: nav;
  outline: none;
}

.docs__nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 8px 0 14px;
  font-size: 14px;
}

.docs__filter {
  padding: 10px 10px 6px;
}

.docs__tree {
  min-height: 0;
  flex: 1;
  padding: 0 8px 12px;
  overflow-y: auto;
}

.docs__tree :deep(.tx-tree__list) {
  gap: 1px;
}

.docs-tree-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 20px;
  border-radius: 8px;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.4;
}

.docs-tree-row:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.docs-tree-row.is-group {
  padding-left: 6px;
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

.docs-tree-row.is-current {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, var(--tx-text-color-primary, #303133));
  font-weight: 500;
}

.docs-tree-row__caret {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  transition: transform 0.15s var(--docs-ease);
}

.docs-tree-row__caret.is-open {
  transform: rotate(90deg);
}

.docs-tree-row__icon {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
}

.docs-tree-row__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs-tree-row__badge {
  flex: none;
  margin-left: auto;
}

.docs-tree-empty {
  margin: 0;
  padding: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* Below 640px the same aside slides over the article. */
.docs__nav.is-drawer {
  position: absolute;
  z-index: 5;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(300px, 86%);
  box-shadow: var(--tx-elevation-4, 5px 10px 30px rgba(0, 0, 0, 0.14));
  grid-area: auto;
  transform: translateX(-104%);
  transition:
    transform 0.22s var(--docs-ease),
    visibility 0s linear 0.22s;
  visibility: hidden;
}

.docs__nav.is-drawer.is-open {
  transform: none;
  transition: transform 0.22s var(--docs-ease);
  visibility: visible;
}

.docs__scrim {
  position: absolute;
  z-index: 4;
  background: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 72%, transparent);
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
}

.docs__scrim.is-open {
  opacity: 1;
  pointer-events: auto;
}

/* Article ---------------------------------------------------------------- */

.docs__main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  grid-area: main;
}

.docs__toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 8px;
}

.docs__crumbs {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.docs__crumbs :deep(.tx-breadcrumb__list) {
  min-width: 0;
}

.docs__crumbs :deep(.tx-breadcrumb__link) {
  padding: 3px 6px;
  font-size: 12px;
  white-space: nowrap;
}

.docs__toc {
  display: inline-flex;
  max-width: 220px;
  height: 28px;
  flex: none;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.docs__toc:hover {
  background: var(--tx-fill-color, #f0f2f5);
}

.docs__toc-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.docs__toc-chevron {
  flex: none;
  font-size: 12px;
  opacity: 0.6;
}

.docs-toc-item.is-sub {
  padding-left: 12px;
  color: var(--tx-text-color-regular, #606266);
}

.docs-toc-item__check {
  color: var(--tx-color-primary, #409eff);
}

/* A hairline under the sticky toolbar, filled as the article is read. */
.docs__progress {
  display: flex;
  height: 2px;
  flex: none;
  background: var(--docs-line);
}

.docs__progress > * {
  width: 100%;
}

.docs__progress :deep(.tx-progress-bar__track) {
  border-radius: 0;
  background: transparent;
}

.docs__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  outline: none;
}

.docs__scroll:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 40%, transparent);
}

.docs-article {
  max-width: 760px;
  margin: 0 auto;
  padding: 18px 22px 28px;
}

.docs-article__head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 18px;
}

.docs-article__group {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.docs-article__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  outline: none;
}

.docs-article__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* The article body. TxMarkdownView and the docs' own markdown sheet both
   set `.markdown-body` at 16px; an article in a stage reads at 14px. */
.docs-md :deep(.markdown-body) {
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  font-size: 14px;
  line-height: 1.75;
}

.docs-md :deep(.markdown-body > :first-child) {
  margin-top: 0;
}

.docs-md :deep(.markdown-body h2) {
  margin: 28px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--docs-line);
  color: var(--tx-text-color-primary, #303133);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
}

.docs-md :deep(.markdown-body h3) {
  margin: 20px 0 8px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.docs-md :deep(.markdown-body p),
.docs-md :deep(.markdown-body ul),
.docs-md :deep(.markdown-body ol),
.docs-md :deep(.markdown-body table),
.docs-md :deep(.markdown-body pre) {
  margin: 0 0 12px;
}

.docs-md :deep(.markdown-body strong) {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

.docs-md :deep(.markdown-body a) {
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, var(--tx-text-color-primary, #303133));
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
  text-underline-offset: 3px;
}

.docs-md :deep(.markdown-body :not(pre) > code) {
  padding: 0.12em 0.4em;
  border-radius: 6px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
  font-size: 0.9em;
}

.docs-md :deep(.markdown-body pre) {
  padding: 12px 14px;
  border: 0;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--docs-line);
}

.docs-md :deep(.markdown-body pre code) {
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
  line-height: 1.6;
}

.docs-md :deep(.markdown-body table) {
  font-size: 13px;
}

.docs-md :deep(.markdown-body th),
.docs-md :deep(.markdown-body td) {
  padding: 6px 12px;
  border: 1px solid var(--docs-line);
}

.docs-md :deep(.markdown-body th) {
  background: var(--tx-fill-color-lighter, #fafafa);
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

.docs-md :deep(.markdown-body tr) {
  background: transparent;
}

.docs-md :deep(.markdown-body kbd) {
  padding: 1px 6px;
  border: 0;
  border-radius: 5px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 -1px 0 var(--tx-border-color, #dcdfe6);
  color: var(--tx-text-color-primary, #303133);
  font-size: 12px;
}

/* Callouts: same-hue ink on each hue's own tint, readable in both themes. */
.docs-md :deep(.markdown-alert) {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-left: 3px solid var(--tx-color-primary, #409eff);
  border-radius: 0 10px 10px 0;
  background: var(--tx-color-primary-light-9, #ecf5ff);
}

.docs-md :deep(.markdown-alert .markdown-alert-title) {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 4px;
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.docs-md :deep(.markdown-alert-warning) {
  border-left-color: var(--tx-color-warning, #e6a23c);
  background: var(--tx-color-warning-light-9, #fdf6ec);
}

.docs-md :deep(.markdown-alert-warning .markdown-alert-title) {
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.docs-md :deep(.markdown-alert-tip) {
  border-left-color: var(--tx-color-success, #67c23a);
  background: var(--tx-color-success-light-9, #f0f9eb);
}

.docs-md :deep(.markdown-alert-tip .markdown-alert-title) {
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
}

.docs-md :deep(.markdown-alert > :last-child) {
  margin-bottom: 0;
}

/* Feedback, previous / next, related ------------------------------------- */

.docs-feedback {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 28px;
  padding: 14px 16px;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--docs-line);
}

.docs-feedback__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.docs-feedback__title {
  font-size: 14px;
  font-weight: 600;
}

.docs-feedback__share {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.docs-feedback__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.docs-feedback__label {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  font-weight: 500;
}

.docs-feedback__reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.docs-feedback__done {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: color-mix(in srgb, var(--tx-color-success, #67c23a) 45%, var(--tx-text-color-primary, #303133));
  font-size: 13px;
}

.docs-pager {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 16px;
}

/* On the opaque article the component's default hover wash is invisible. */
.docs-pager__item,
.docs-related__item {
  --tx-card-item-hover-bg: var(--tx-fill-color-light, #f5f7fa);

  border-color: var(--docs-line);
}

.docs-pager__item.is-next {
  flex-direction: row-reverse;
  grid-column: 2;
  text-align: right;
}

.docs-related {
  margin-top: 20px;
}

.docs-related__title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.docs-related__list {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.docs-article__note {
  margin: 20px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.55;
}

/* On this page (expanded) ------------------------------------------------ */

.docs__rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 14px;
  overflow-y: auto;
  background: var(--docs-rail);
  box-shadow: inset 1px 0 0 var(--docs-line);
  grid-area: rail;
}

.docs-outline {
  width: 100%;
}

.docs-outline__title {
  margin: 0 0 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 600;
}

.docs-outline__list {
  position: relative;
  display: flex;
  flex-direction: column;
  padding-left: 10px;
  box-shadow: inset 2px 0 0 var(--docs-line);
}

.docs-outline__marker {
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  border-radius: 2px;
  background: var(--tx-color-primary, #409eff);
}

.docs-outline__marker.is-revealed {
  transition:
    transform 0.2s var(--docs-ease),
    height 0.2s var(--docs-ease);
}

.docs-outline__item {
  display: block;
  width: 100%;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
}

.docs-outline__item.is-sub {
  padding-left: 18px;
}

.docs-outline__item:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.docs-outline__item.is-active {
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 55%, var(--tx-text-color-primary, #303133));
  font-weight: 500;
}

.docs-outline__item:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-rail__meta {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--docs-line);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.docs-rail__meta > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* Toast ------------------------------------------------------------------ */

.docs__toast {
  position: absolute;
  z-index: 6;
  bottom: 14px;
  left: 50%;
  width: min(380px, calc(100% - 28px));
  pointer-events: none;
  translate: -50% 0;
}

.docs__toast.is-open {
  pointer-events: auto;
}

.docs-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.docs-toast__icon {
  flex: none;
  color: var(--tx-color-primary, #409eff);
  font-size: 15px;
}

.docs-toast__text {
  min-width: 0;
  flex: 1;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.docs-toast__close {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
}

.docs-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.docs-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.docs-palette-foot {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.docs-palette-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Narrow: under 640px ------------------------------------------------------ */

@container template (max-width: 639px) {
  .docs {
    grid-template-areas:
      'top'
      'main';
    grid-template-columns: minmax(0, 1fr);
  }

  .docs__top {
    gap: 6px;
    padding: 8px 10px;
  }

  .docs__search {
    width: auto;
    min-width: 0;
    flex: 1;
  }

  .docs__search-kbd {
    display: none;
  }

  .docs__crumbs :deep(.tx-breadcrumb__item:first-child) {
    display: none;
  }

  .docs-article {
    padding: 14px 14px 24px;
  }

  .docs-article__title {
    font-size: 19px;
  }

  .docs-pager {
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-pager__item.is-next {
    grid-column: auto;
  }
}

/* Expanded: 960px and up -------------------------------------------------- */

@container template (min-width: 960px) {
  .docs {
    grid-template-areas:
      'top top top'
      'nav main rail';
    grid-template-columns: 232px minmax(0, 1fr) 212px;
  }

  .docs__top {
    padding: 10px 18px;
  }

  .docs__search {
    width: 380px;
  }

  .docs-article {
    padding: 22px 32px 32px;
  }
}

@container template (min-width: 1200px) {
  .docs {
    grid-template-columns: 248px minmax(0, 1fr) 232px;
  }

  .docs-article {
    max-width: 720px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .docs__nav.is-drawer,
  .docs__nav.is-drawer.is-open,
  .docs__scrim,
  .docs-outline__marker.is-revealed,
  .docs-tree-row__caret {
    transition: none;
  }
}
</style>
