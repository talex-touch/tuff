<script setup lang="ts">
// Inbox template: the Tuff account mailbox (store reviews, CI, security,
// mentions, releases, statements).
//
// Layout is a CSS grid with a fixed-width sidebar and exactly one TxSplitter
// (list | reader), so widening the stage never widens the sidebar. The list is
// a TxVirtualList over ~160 mails; the listbox semantics TxVirtualList leaves
// to its host are added here. Keyboard shortcuts live on the template root,
// never on document, and step aside while an editable element has focus.
// Three mails arrive after the stage first scrolls into view; with reduced
// motion they are simply there from the start.
import type { AiAttachment } from '@talex-touch/tuffex/ai-elements'
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { SidebarNavGroup, SidebarNavItem, SidebarNavValue } from '@talex-touch/tuffex/sidebar-nav'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Folder = 'inbox' | 'mentions' | 'updates' | 'releases' | 'billing' | 'sent' | 'archive'
type Label = 'plugins' | 'builds' | 'security' | 'community'
type View = Folder | `label-${Label}`
type SenderId = 'store' | 'ci' | 'security' | 'intelligence' | 'community' | 'billing' | 'sync' | 'releases' | 'ks' | 'ac' | 'nh' | 'mo' | 'lq' | 'me'
type SortMode = 'newest' | 'unread'
type Mode = 'narrow' | 'column' | 'wide'

interface Bi { zh: string, en: string }

interface ThreadEntry {
  id: string
  from: SenderId
  at: number
  body: Bi
}

interface Mail {
  id: string
  folder: Folder
  labels: Label[]
  sender: SenderId
  to?: SenderId
  subject: Bi
  snippet: Bi
  body: Bi
  receivedAt: number
  unread: boolean
  starred: boolean
  muted: boolean
  attachments: AiAttachment[]
  thread: ThreadEntry[]
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so script state can depend on it.
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
const uid = useId()

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Mock data ───────────────────────────────────────────────────────── */

// 10:30 on 23 Sep 2026 in Asia/Shanghai; every time below is relative to it.
const NOW = Date.UTC(2026, 8, 23, 2, 30)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const ROW_HEIGHT = 76

const SENDERS: Record<SenderId, { name: Bi, address: string, system?: boolean, hue?: string }> = {
  store: { name: { zh: 'Nexus 插件市场', en: 'Nexus Store' }, address: 'review@nexus.tagzxia.com', system: true },
  ci: { name: { zh: 'Tuff CI', en: 'Tuff CI' }, address: 'ci@tuff.tagzxia.com', system: true },
  security: { name: { zh: 'Tuff 安全中心', en: 'Tuff Security' }, address: 'security@tuff.tagzxia.com', system: true },
  intelligence: { name: { zh: 'Tuff Intelligence', en: 'Tuff Intelligence' }, address: 'ai@tuff.tagzxia.com', system: true },
  community: { name: { zh: 'Nexus 社区', en: 'Nexus Community' }, address: 'community@nexus.tagzxia.com', system: true },
  billing: { name: { zh: 'Tuff 账户', en: 'Tuff Account' }, address: 'billing@tuff.tagzxia.com', system: true },
  sync: { name: { zh: '剪贴板同步', en: 'Clipboard Sync' }, address: 'sync@tuff.tagzxia.com', system: true },
  releases: { name: { zh: 'Tuff 发布', en: 'Tuff Releases' }, address: 'releases@tuff.tagzxia.com', system: true },
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, address: 'kenji.sato@example.com', hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, address: 'ava.chen@example.com', hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, address: 'noor@example.com', hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, address: 'mara@example.com', hue: 'var(--tx-chart-categorical-6, #d37536)' },
  lq: { name: { zh: '林乔', en: 'Lin Qiao' }, address: 'linqiao@tuff.tagzxia.com', hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  me: { name: { zh: '你', en: 'You' }, address: 'you@tuff.dev', hue: 'var(--tx-bui-accent, #0285ff)' },
}

const FOLDERS: Folder[] = ['inbox', 'mentions', 'updates', 'releases', 'billing', 'sent', 'archive']
const SORT_MODES: SortMode[] = ['newest', 'unread']
const LABELS: Label[] = ['plugins', 'builds', 'security', 'community']

const FOLDER_META: Record<Folder, { label: Bi, icon: string }> = {
  inbox: { label: { zh: '收件箱', en: 'Inbox' }, icon: 'i-carbon-email' },
  mentions: { label: { zh: '提及', en: 'Mentions' }, icon: 'i-carbon-at' },
  updates: { label: { zh: '更新', en: 'Updates' }, icon: 'i-carbon-notification' },
  releases: { label: { zh: '发布', en: 'Releases' }, icon: 'i-carbon-rocket' },
  billing: { label: { zh: '账单', en: 'Billing' }, icon: 'i-carbon-receipt' },
  sent: { label: { zh: '已发送', en: 'Sent' }, icon: 'i-carbon-send-alt' },
  archive: { label: { zh: '已归档', en: 'Archive' }, icon: 'i-carbon-archive' },
}

const LABEL_META: Record<Label, { label: Bi, icon: string, color: string }> = {
  plugins: { label: { zh: '插件审核', en: 'Plugin review' }, icon: 'i-carbon-plug', color: 'var(--tx-chart-categorical-4, #8d58ee)' },
  builds: { label: { zh: '构建', en: 'Builds' }, icon: 'i-carbon-continuous-integration', color: 'var(--tx-chart-categorical-1, #4290f0)' },
  security: { label: { zh: '安全', en: 'Security' }, icon: 'i-carbon-security', color: 'var(--tx-chart-categorical-6, #d37536)' },
  community: { label: { zh: '社区', en: 'Community' }, icon: 'i-carbon-user-multiple', color: 'var(--tx-chart-categorical-3, #e8649d)' },
}

// A terminal screenshot for the CI mail, drawn rather than fetched.
function terminalShot(): string {
  const lines = [
    ['#8b949e', 180], ['#8b949e', 240], ['#7ee787', 210], ['#8b949e', 260], ['#ff7b72', 300], ['#ff7b72', 220], ['#8b949e', 150],
  ] as const
  const rows = lines.map(([color, width], index) => `<rect x="24" y="${52 + index * 22}" width="${width}" height="8" rx="4" fill="${color}"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240" viewBox="0 0 480 240"><rect width="480" height="240" rx="14" fill="#0d1117"/><circle cx="24" cy="22" r="6" fill="#ff5f57"/><circle cx="44" cy="22" r="6" fill="#febc2e"/><circle cx="64" cy="22" r="6" fill="#28c840"/>${rows}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const SCREENSHOT = terminalShot()

function seedMails(): Mail[] {
  const base = (partial: Omit<Mail, 'unread' | 'starred' | 'muted' | 'attachments' | 'thread' | 'labels'> & Partial<Mail>): Mail => ({
    unread: false,
    starred: false,
    muted: false,
    attachments: [],
    thread: [],
    labels: [],
    ...partial,
  })

  return [
    base({
      id: 'review-translate',
      folder: 'inbox',
      labels: ['plugins'],
      sender: 'store',
      subject: { zh: 'touch-translate 1.4.0 已通过审核', en: 'touch-translate 1.4.0 passed review' },
      snippet: { zh: '现在可以在开发者后台发布了。审核员留下了两条建议，不影响发布。', en: 'You can publish it from the developer console now. The reviewer left two suggestions; neither blocks the release.' },
      body: {
        zh: '你好，\n\n**touch-translate 1.4.0** 已通过 Nexus 插件审核，现在可以在开发者后台点击「发布」。\n\n审核员留下了两条建议（不影响发布）：\n\n1. `clipboard.read` 只在划词翻译时用到，建议改为按需申请。\n2. 离线词典超过 40MB，建议拆成可选下载包。\n\n完整报告见附件。\n\n— Nexus 插件审核组',
        en: 'Hi,\n\n**touch-translate 1.4.0** has passed Nexus plugin review. You can hit Publish in the developer console now.\n\nThe reviewer left two suggestions (neither blocks the release):\n\n1. `clipboard.read` is only used for selection translate — consider requesting it on demand.\n2. The offline dictionary is over 40 MB; consider shipping it as an optional download.\n\nThe full report is attached.\n\n— Nexus plugin review',
      },
      receivedAt: NOW - 18 * MINUTE,
      unread: true,
      attachments: [{ kind: 'file', id: 'review-report', name: 'review-report.pdf', size: 188_416, mime: 'application/pdf' }],
    }),
    base({
      id: 'ci-win32',
      folder: 'updates',
      labels: ['builds'],
      sender: 'ci',
      subject: { zh: 'Nightly 2.4.0-beta.3 在 win32 构建失败', en: 'Nightly 2.4.0-beta.3 failed on win32' },
      snippet: { zh: 'tuff-native 在链接阶段找不到 windows.media.ocr，darwin 与 linux 均已通过。', en: 'tuff-native could not find windows.media.ocr at link time; darwin and linux passed.' },
      body: {
        zh: '**win32-x64** 在打包阶段失败，另外两个平台通过。\n\n```\nerror LNK2019: unresolved external symbol OcrEngine::TryCreateFromUserProfileLanguages\n  referenced in tuff_native_ocr.obj\n```\n\n| 平台 | 结果 | 用时 |\n|---|---|---|\n| darwin-arm64 | 通过 | 6 分 12 秒 |\n| linux-x64 | 通过 | 5 分 48 秒 |\n| win32-x64 | 失败 | 3 分 05 秒 |\n\n完整日志与截图见附件。',
        en: '**win32-x64** failed while packaging; the other two platforms passed.\n\n```\nerror LNK2019: unresolved external symbol OcrEngine::TryCreateFromUserProfileLanguages\n  referenced in tuff_native_ocr.obj\n```\n\n| Platform | Result | Time |\n|---|---|---|\n| darwin-arm64 | passed | 6m 12s |\n| linux-x64 | passed | 5m 48s |\n| win32-x64 | failed | 3m 05s |\n\nThe full log and a screenshot are attached.',
      },
      receivedAt: NOW - 43 * MINUTE,
      unread: true,
      attachments: [
        { kind: 'image', id: 'ci-shot', url: SCREENSHOT, name: 'win32-failure.png', width: 480, height: 240 },
        { kind: 'file', id: 'ci-log', name: 'build-log.txt', size: 63_488, mime: 'text/plain' },
      ],
    }),
    base({
      id: 'security-login',
      folder: 'inbox',
      labels: ['security'],
      sender: 'security',
      subject: { zh: '新的登录：macOS 27 · 上海', en: 'New sign-in: macOS 27 · Shanghai' },
      snippet: { zh: '今天 09:12 有一台新设备登录了你的 Tuff 账户。如果是你本人，无需任何操作。', en: 'A new device signed in to your Tuff account at 09:12 today. If this was you, there is nothing to do.' },
      body: {
        zh: '今天 **09:12** 有一台新设备登录了你的 Tuff 账户：\n\n- 设备：MacBook Pro · macOS 27\n- 位置：上海（大致位置）\n- 应用：Tuff 2.4.0\n\n如果这是你本人，无需任何操作。\n\n如果不是你，请在 Tuff 的「设置 → 账户 → 登录设备」中移除这台设备并修改密码。',
        en: 'A new device signed in to your Tuff account today at **09:12**:\n\n- Device: MacBook Pro · macOS 27\n- Location: Shanghai (approximate)\n- App: Tuff 2.4.0\n\nIf this was you, there is nothing to do.\n\nIf it was not, remove the device under Settings → Account → Devices in Tuff and change your password.',
      },
      receivedAt: NOW - 78 * MINUTE,
    }),
    base({
      id: 'mention-kenji',
      folder: 'mentions',
      labels: ['community'],
      sender: 'ks',
      subject: { zh: '在 #plugin-dev 提到了你：Prelude 冷启动', en: 'Mentioned you in #plugin-dev: Prelude cold start' },
      snippet: { zh: '我把 pushItems 放进了 requestIdleCallback，冷启动快了不少，你帮忙看看会不会漏掉第一批结果？', en: 'I moved pushItems into requestIdleCallback and cold start got a lot faster — could it drop the first batch of results?' },
      body: {
        zh: '@你 我在 Prelude 里把 `pushItems()` 放进了 `requestIdleCallback`，冷启动快了不少：\n\n```ts\nonFeatureTriggered(id, query) {\n  requestIdleCallback(() => pushItems(search(query)))\n}\n```\n\n你帮忙看看，这样会不会漏掉用户最先敲下的那一批结果？',
        en: '@you I moved `pushItems()` into `requestIdleCallback` in the Prelude and cold start got a lot faster:\n\n```ts\nonFeatureTriggered(id, query) {\n  requestIdleCallback(() => pushItems(search(query)))\n}\n```\n\nCould you check whether this drops the first batch of results a user types?',
      },
      receivedAt: NOW - 2 * HOUR - 6 * MINUTE,
      unread: true,
    }),
    base({
      id: 'ai-usage',
      folder: 'updates',
      sender: 'intelligence',
      subject: { zh: '本月 AI 请求额度已用 80%', en: 'You have used 80% of this month’s AI requests' },
      snippet: { zh: '本月已使用 1,612 次请求。本地模型与自带密钥的请求不计入额度。', en: '1,612 requests used this month. Local models and your own keys do not count towards it.' },
      body: {
        zh: '本月你已使用 **1,612 次** AI 请求，约为额度的 80%。\n\n- 翻译：724 次\n- 截图 OCR 回退：388 次\n- 智能操作：500 次\n\n本地模型与自带密钥（BYOK）的请求**不计入**额度。额度会在 10 月 1 日重置。',
        en: 'You have used **1,612** AI requests this month, about 80% of your quota.\n\n- Translation: 724\n- Screenshot OCR fallback: 388\n- Smart actions: 500\n\nRequests to local models and your own keys (BYOK) **do not count**. The quota resets on 1 October.',
      },
      receivedAt: NOW - 3 * HOUR - 40 * MINUTE,
    }),
    base({
      id: 'digest-38',
      folder: 'updates',
      labels: ['community'],
      sender: 'community',
      subject: { zh: '社区周报 #38：本周新增 12 个插件', en: 'Community digest #38: twelve new plugins' },
      snippet: { zh: 'CoreBox 主题征集进入投票阶段，另有两场线上分享的录像。', en: 'The CoreBox theme contest moves to voting, plus recordings from two online talks.' },
      body: {
        zh: '## 本周新插件\n\n- **Unit Convert**：在 CoreBox 里直接换算单位\n- **Color Picker**：取色并复制多种格式\n- **Quick Notes**：随手记，支持 Markdown\n\n## 活动\n\nCoreBox 主题征集已进入投票阶段，9 套入围作品等你来选。',
        en: '## New this week\n\n- **Unit Convert**: convert units right in CoreBox\n- **Color Picker**: pick a colour, copy it in any format\n- **Quick Notes**: jot things down, Markdown included\n\n## Events\n\nThe CoreBox theme contest is now in voting — nine shortlisted themes are waiting for you.',
      },
      receivedAt: NOW - 5 * HOUR,
    }),
    base({
      id: 'statement-sep',
      folder: 'billing',
      sender: 'billing',
      subject: { zh: 'Pioneer 计划 · 2026 年 9 月账单', en: 'Pioneer plan · September 2026 statement' },
      snippet: { zh: '本期应付 0 元。感谢你参与 Pioneer 计划。', en: 'Nothing to pay this period. Thanks for being a Pioneer.' },
      body: {
        zh: '你好，\n\n这是你 **2026 年 9 月** 的账单：Pioneer 计划本期应付 **0 元**，无需任何操作。\n\n账单 PDF 见附件，也可以在「设置 → 账户」中随时查看。',
        en: 'Hi,\n\nHere is your **September 2026** statement: the Pioneer plan comes to **$0** this period, so there is nothing to do.\n\nThe PDF is attached, and you can find it under Settings → Account at any time.',
      },
      receivedAt: NOW - 7 * HOUR,
      attachments: [{ kind: 'file', id: 'statement', name: 'statement-2026-09.pdf', size: 49_152, mime: 'application/pdf' }],
    }),
    base({
      id: 'sync-conflict',
      folder: 'inbox',
      sender: 'sync',
      subject: { zh: '2 条剪贴板记录同步冲突', en: '2 clipboard items conflicted while syncing' },
      snippet: { zh: '两台设备在同一时间修改了同一条记录。我们保留了两份，你可以在剪贴板历史里合并。', en: 'Two devices edited the same item at once. Both copies were kept; you can merge them in clipboard history.' },
      body: {
        zh: '两台设备在同一时间修改了同一条剪贴板记录：\n\n- **MacBook Pro** · 08:41\n- **Windows 台式机** · 08:41\n\n我们保留了两份，并在剪贴板历史里标记为「冲突」。打开 CoreBox 输入 `clip conflict` 即可查看并合并。',
        en: 'Two devices edited the same clipboard item at the same time:\n\n- **MacBook Pro** · 08:41\n- **Windows desktop** · 08:41\n\nBoth copies were kept and marked as conflicts in clipboard history. Type `clip conflict` in CoreBox to review and merge them.',
      },
      receivedAt: NOW - 8 * HOUR - 20 * MINUTE,
      unread: true,
    }),
    base({
      id: 'release-24',
      folder: 'releases',
      sender: 'releases',
      subject: { zh: 'Tuff 2.4 正式版开始推送', en: 'Tuff 2.4 is rolling out' },
      snippet: { zh: 'CoreBox 秒开、剪贴板时间线、插件增量更新。未来 48 小时内逐步推送。', en: 'Instant CoreBox, a clipboard timeline and delta plugin updates, rolling out over the next 48 hours.' },
      body: {
        zh: '## Tuff 2.4\n\n- **CoreBox** 冷启动明显提速\n- **剪贴板**改为时间线视图\n- **插件市场**支持增量更新\n\n更新会在未来 48 小时内逐步推送；也可以在「设置 → 关于」中手动检查。',
        en: '## Tuff 2.4\n\n- **CoreBox** opens noticeably faster from cold\n- **Clipboard** history becomes a timeline\n- **Plugin store** ships delta updates\n\nThe update rolls out over the next 48 hours; you can also check under Settings → About.',
      },
      receivedAt: NOW - 20 * HOUR,
    }),
    base({
      id: 'theme-likes',
      folder: 'inbox',
      labels: ['community'],
      sender: 'community',
      subject: { zh: '你的主题《CoreBox 午夜》获得 100 个赞', en: 'Your theme “CoreBox Midnight” reached 100 likes' },
      snippet: { zh: '它已进入本周的社区精选，排在第 3 位。', en: 'It made this week’s community picks, in third place.' },
      body: {
        zh: '恭喜！你的主题 **CoreBox 午夜** 获得了第 100 个赞，并进入本周社区精选（第 3 位）。\n\n> 「配色克制，夜里用很舒服。」—— 来自一位用户的评论',
        en: 'Congratulations! Your theme **CoreBox Midnight** just got its 100th like and made this week’s community picks (third place).\n\n> “Restrained colours, easy on the eyes at night.” — a comment from one of its users',
      },
      receivedAt: NOW - 23 * HOUR,
    }),
    base({
      id: 'update-scripts',
      folder: 'updates',
      labels: ['plugins'],
      sender: 'store',
      subject: { zh: 'Workspace Scripts 3.2 可更新', en: 'Workspace Scripts 3.2 is available' },
      snippet: { zh: '支持 pnpm 工作区，并能记住上次运行的目录。', en: 'Adds pnpm workspace support and remembers the folder you last ran in.' },
      body: {
        zh: '**Workspace Scripts 3.2** 已发布：\n\n- 支持 pnpm 工作区与 `--filter`\n- 记住每个项目上次运行的目录\n- 修复长输出时滚动卡顿\n\n在 CoreBox 输入 `update` 即可更新。',
        en: '**Workspace Scripts 3.2** is out:\n\n- pnpm workspaces and `--filter` support\n- Remembers the last folder per project\n- Fixes stutter when scrolling long output\n\nType `update` in CoreBox to install it.',
      },
      receivedAt: NOW - 26 * HOUR,
    }),
    base({
      id: 'thread-signing',
      folder: 'inbox',
      labels: ['plugins'],
      sender: 'nh',
      subject: { zh: 'Re：插件签名问题', en: 'Re: plugin signing' },
      snippet: { zh: '换成新证书后审核通过了，谢谢！顺便问一下，CI 里签名有推荐做法吗？', en: 'It passed review with the new certificate, thanks! Is there a recommended way to sign in CI?' },
      body: {
        zh: '换成新证书之后审核通过了，谢谢！\n\n顺便问一下：CI 里签名有推荐的做法吗？我现在是把证书放在仓库的加密变量里，每次构建时解出来。',
        en: 'It passed review with the new certificate, thanks!\n\nOne more question: is there a recommended way to sign in CI? Right now the certificate lives in an encrypted repository variable and gets decoded on every build.',
      },
      receivedAt: NOW - 29 * HOUR,
      unread: true,
      thread: [
        { id: 'sig-1', from: 'nh', at: NOW - 3 * DAY, body: { zh: '提交 1.2.0 时被提示「签名无效」，但本地校验是通过的，是哪里不对？', en: 'Submitting 1.2.0 says “invalid signature”, but it verifies locally. What am I missing?' } },
        { id: 'sig-2', from: 'me', at: NOW - 3 * DAY + 2 * HOUR, body: { zh: '旧证书上个月已经过期，本地缓存了校验结果。重新签发一张再提交试试。', en: 'Your old certificate expired last month and the local check was cached. Issue a new one and resubmit.' } },
      ],
    }),
  ]
}

const PLUGINS = ['touch-clipboard', 'touch-quick-actions', 'touch-browser-open', 'touch-window-presets', 'touch-workspace-scripts', 'touch-system-actions', 'touch-intelligence', 'touch-translate']
const DEVICES: Bi[] = [
  { zh: 'Windows 11 · 深圳', en: 'Windows 11 · Shenzhen' },
  { zh: 'macOS 27 · 杭州', en: 'macOS 27 · Hangzhou' },
  { zh: 'Ubuntu 26.04 · 北京', en: 'Ubuntu 26.04 · Beijing' },
  { zh: 'macOS 27 · 东京', en: 'macOS 27 · Tokyo' },
]
const CHANNELS = ['plugin-dev', 'design', 'corebox', 'i18n', 'release']
const PEOPLE: SenderId[] = ['ks', 'ac', 'mo', 'lq', 'nh']
const CHATTER: Bi[] = [
  { zh: '这个快捷键冲突能不能改成可配置？', en: 'Could this shortcut conflict become configurable?' },
  { zh: '新的图标我放在 Figma 里了，帮忙看一眼。', en: 'I put the new icons in Figma, could you take a look?' },
  { zh: '日语翻译里有两处术语不一致。', en: 'Two terms are inconsistent in the Japanese strings.' },
  { zh: '发布前再跑一次 win32 的冒烟测试吧。', en: 'Let us run the win32 smoke test once more before release.' },
  { zh: 'CoreBox 在多屏下的位置记忆好像失效了。', en: 'CoreBox seems to forget its screen on multi-monitor setups.' },
]

// ~150 older mails derived from a handful of kinds, so the virtual list has
// something real to virtualise. Deterministic: same index, same mail.
function deriveMails(count: number): Mail[] {
  const list: Mail[] = []
  for (let index = 0; index < count; index += 1) {
    const kind = index % 9
    const round = Math.floor(index / 9)
    const receivedAt = NOW - DAY - index * 4.7 * HOUR - (index % 5) * 13 * MINUTE
    const common = {
      id: `mail-${index}`,
      receivedAt,
      unread: index < 14 && index % 4 === 1,
      starred: index % 11 === 5,
      muted: false,
      attachments: [] as AiAttachment[],
      thread: [] as ThreadEntry[],
    }
    let mail: Mail
    if (kind === 0) {
      const build = 40 - round
      const failed = round % 4 === 2
      mail = {
        ...common,
        folder: 'updates',
        labels: ['builds'],
        sender: 'ci',
        subject: failed
          ? { zh: `Nightly 2.4.0-alpha.${build} 在 linux 构建失败`, en: `Nightly 2.4.0-alpha.${build} failed on linux` }
          : { zh: `Nightly 2.4.0-alpha.${build} 构建通过`, en: `Nightly 2.4.0-alpha.${build} build passed` },
        snippet: failed
          ? { zh: 'linux-x64 在打包阶段失败，其余平台通过。', en: 'linux-x64 failed while packaging; the other platforms passed.' }
          : { zh: '三个平台全部通过，产物已上传到内部更新源。', en: 'All three platforms passed and the artefacts are on the internal feed.' },
        body: {
          zh: `| 平台 | 结果 |\n|---|---|\n| darwin-arm64 | 通过 |\n| win32-x64 | 通过 |\n| linux-x64 | ${failed ? '失败' : '通过'} |\n\n构建编号 #${3100 - round * 37}`,
          en: `| Platform | Result |\n|---|---|\n| darwin-arm64 | passed |\n| win32-x64 | passed |\n| linux-x64 | ${failed ? 'failed' : 'passed'} |\n\nBuild #${3100 - round * 37}`,
        },
      }
    }
    else if (kind === 1) {
      const plugin = PLUGINS[round % PLUGINS.length]!
      const version = `${1 + (round % 3)}.${(round * 3) % 8}.${(round * 7) % 10}`
      mail = {
        ...common,
        folder: 'updates',
        labels: ['plugins'],
        sender: 'store',
        subject: { zh: `${plugin} ${version} 可更新`, en: `${plugin} ${version} is available` },
        snippet: { zh: '修复若干问题并提升稳定性。在 CoreBox 输入 update 即可更新。', en: 'Bug fixes and stability improvements. Type update in CoreBox to install.' },
        body: { zh: `**${plugin} ${version}** 已发布。\n\n- 修复若干问题\n- 提升稳定性\n\n在 CoreBox 输入 \`update\` 即可更新。`, en: `**${plugin} ${version}** is out.\n\n- Bug fixes\n- Stability improvements\n\nType \`update\` in CoreBox to install it.` },
      }
    }
    else if (kind === 2) {
      const plugin = PLUGINS[(round + 3) % PLUGINS.length]!
      mail = {
        ...common,
        folder: 'inbox',
        labels: ['plugins'],
        sender: 'store',
        subject: { zh: `${plugin} 已通过审核`, en: `${plugin} passed review` },
        snippet: { zh: '可以在开发者后台发布了。', en: 'You can publish it from the developer console.' },
        body: { zh: `**${plugin}** 已通过 Nexus 插件审核，现在可以发布。\n\n— Nexus 插件审核组`, en: `**${plugin}** passed Nexus plugin review and can be published now.\n\n— Nexus plugin review` },
      }
    }
    else if (kind === 3) {
      const device = DEVICES[round % DEVICES.length]!
      mail = {
        ...common,
        folder: 'inbox',
        labels: ['security'],
        sender: 'security',
        subject: { zh: `新的登录：${device.zh}`, en: `New sign-in: ${device.en}` },
        snippet: { zh: '如果是你本人，无需任何操作。', en: 'If this was you, there is nothing to do.' },
        body: { zh: `有一台新设备登录了你的 Tuff 账户：**${device.zh}**。\n\n如果不是你，请在「设置 → 账户 → 登录设备」中移除它。`, en: `A new device signed in to your Tuff account: **${device.en}**.\n\nIf it was not you, remove it under Settings → Account → Devices.` },
      }
    }
    else if (kind === 4) {
      const person = PEOPLE[round % PEOPLE.length]!
      const channel = CHANNELS[round % CHANNELS.length]!
      const line = CHATTER[round % CHATTER.length]!
      mail = {
        ...common,
        folder: 'mentions',
        labels: ['community'],
        sender: person,
        subject: { zh: `在 #${channel} 提到了你`, en: `Mentioned you in #${channel}` },
        snippet: line,
        body: { zh: `@你 ${line.zh}`, en: `@you ${line.en}` },
      }
    }
    else if (kind === 5) {
      const issue = 37 - round
      mail = {
        ...common,
        folder: 'updates',
        labels: ['community'],
        sender: 'community',
        subject: { zh: `社区周报 #${issue}`, en: `Community digest #${issue}` },
        snippet: { zh: '新插件、社区作品与下周活动。', en: 'New plugins, community work and next week’s events.' },
        body: { zh: '## 本期内容\n\n- 新插件与值得关注的更新\n- 社区作品与主题\n- 下期活动预告', en: '## In this issue\n\n- New plugins and notable updates\n- Community work and themes\n- What is coming up next' },
      }
    }
    else if (kind === 6) {
      const patch = Math.max(0, 9 - round)
      mail = {
        ...common,
        folder: 'releases',
        labels: [],
        sender: 'releases',
        subject: { zh: `Tuff 2.3.${patch} 已发布`, en: `Tuff 2.3.${patch} released` },
        snippet: { zh: '稳定性修复与小幅改进，建议所有用户更新。', en: 'Stability fixes and small improvements; recommended for everyone.' },
        body: { zh: `## Tuff 2.3.${patch}\n\n- 稳定性修复\n- 翻译与文案改进`, en: `## Tuff 2.3.${patch}\n\n- Stability fixes\n- Translation and copy improvements` },
      }
    }
    else if (kind === 7) {
      const person = PEOPLE[(round + 2) % PEOPLE.length]!
      const line = CHATTER[(round + 1) % CHATTER.length]!
      mail = {
        ...common,
        unread: false,
        folder: 'sent',
        labels: [],
        sender: 'me',
        to: person,
        subject: { zh: `Re：${line.zh.replace(/[？。]$/, '')}`, en: `Re: ${line.en.replace(/[?.]$/, '')}` },
        snippet: { zh: '收到，我今天看一下再回复你。', en: 'Got it — I will take a look today and get back to you.' },
        body: { zh: '收到，我今天看一下再回复你。', en: 'Got it — I will take a look today and get back to you.' },
      }
    }
    else {
      const month = 8 - round
      const year = month > 0 ? 2026 : 2025
      const m = month > 0 ? month : month + 12
      mail = {
        ...common,
        unread: false,
        folder: 'billing',
        labels: [],
        sender: 'billing',
        subject: { zh: `Pioneer 计划 · ${year} 年 ${m} 月账单`, en: `Pioneer plan · ${year}-${String(m).padStart(2, '0')} statement` },
        snippet: { zh: '本期应付 0 元。', en: 'Nothing to pay this period.' },
        body: { zh: `这是你 ${year} 年 ${m} 月的账单：Pioneer 计划本期应付 **0 元**。`, en: `Here is your ${year}-${String(m).padStart(2, '0')} statement: the Pioneer plan comes to **$0** this period.` },
      }
    }
    // Older notifications drift into the archive, as they do in a real inbox.
    if (index % 7 === 3 && mail.folder !== 'sent')
      mail.folder = 'archive'
    list.push(mail)
  }
  return list
}

function seedAll(): Mail[] {
  return [...seedMails(), ...deriveMails(148)]
}

const ARRIVALS: { delay: number, mail: () => Mail }[] = [
  {
    delay: 3500,
    mail: () => ({
      id: 'arrival-ci',
      folder: 'inbox',
      labels: ['builds'],
      sender: 'ci',
      subject: { zh: 'Nightly 2.4.0-beta.4 构建通过', en: 'Nightly 2.4.0-beta.4 build passed' },
      snippet: { zh: 'win32 的链接问题已修复，三个平台全部通过。', en: 'The win32 link error is fixed and all three platforms passed.' },
      body: { zh: 'win32 的链接问题已修复，三个平台全部通过。\n\n| 平台 | 结果 |\n|---|---|\n| darwin-arm64 | 通过 |\n| win32-x64 | 通过 |\n| linux-x64 | 通过 |', en: 'The win32 link error is fixed and all three platforms passed.\n\n| Platform | Result |\n|---|---|\n| darwin-arm64 | passed |\n| win32-x64 | passed |\n| linux-x64 | passed |' },
      receivedAt: NOW + MINUTE,
      unread: true,
      starred: false,
      muted: false,
      attachments: [],
      thread: [],
    }),
  },
  {
    delay: 9000,
    mail: () => ({
      id: 'arrival-ava',
      folder: 'inbox',
      labels: ['community'],
      sender: 'ac',
      subject: { zh: '在 #design 提到了你：新的空状态插画', en: 'Mentioned you in #design: new empty-state art' },
      snippet: { zh: '三套方案都放在设计稿里了，你更喜欢哪一套？', en: 'All three options are in the design file — which one do you prefer?' },
      body: { zh: '@你 新的空状态插画三套方案都放在设计稿里了：\n\n1. 线条版\n2. 填色版\n3. 动态版（带减弱动效兜底）\n\n你更喜欢哪一套？', en: '@you All three options for the new empty-state art are in the design file:\n\n1. Line\n2. Filled\n3. Animated (with a reduced-motion fallback)\n\nWhich one do you prefer?' },
      receivedAt: NOW + 2 * MINUTE,
      unread: true,
      starred: false,
      muted: false,
      attachments: [],
      thread: [],
    }),
  },
  {
    delay: 15000,
    mail: () => ({
      id: 'arrival-review',
      folder: 'inbox',
      labels: ['plugins'],
      sender: 'store',
      subject: { zh: '新评价：touch-translate ★★★★★', en: 'New review: touch-translate ★★★★★' },
      snippet: { zh: '「划词翻译终于不用切窗口了，离线词典也很快。」', en: '“Finally, selection translate without switching windows — and the offline dictionary is fast.”' },
      body: { zh: '**touch-translate** 收到一条新评价：\n\n> ★★★★★ 划词翻译终于不用切窗口了，离线词典也很快。\n\n当前平均评分 4.8。', en: '**touch-translate** has a new review:\n\n> ★★★★★ Finally, selection translate without switching windows — and the offline dictionary is fast.\n\nAverage rating is now 4.8.' },
      receivedAt: NOW + 3 * MINUTE,
      unread: true,
      starred: false,
      muted: false,
      attachments: [],
      thread: [],
    }),
  },
]

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: 'Inbox 收件箱',
      account: 'Tuff 账户',
      address: 'you@tuff.dev',
      searchPlaceholder: '搜索发件人、主题',
      searchLabel: '搜索邮件',
      compose: '写邮件',
      foldersLabel: '邮箱',
      mailboxGroup: '邮箱',
      labelsGroup: '标签',
      navLabel: '邮箱导航',
      workspaceLabel: '切换账户',
      synced: '已同步 · 10:30',
      unread: (n: number) => `${n} 未读`,
      listLabel: (view: string) => `${view}，邮件列表`,
      sortLabel: '排序与筛选',
      sort: { newest: '最新优先', unread: '未读优先' },
      attachmentsOnly: '只看有附件',
      yesterday: '昨天',
      to: (name: string) => `发给 ${name}`,
      star: '加星标',
      unstar: '取消星标',
      emptySearch: '没有匹配的邮件',
      emptySearchDesc: '换个关键词试试，或者清除搜索。',
      clearSearch: '清除搜索',
      emptyFolder: '这里还没有邮件',
      emptyFolderDesc: '新邮件到达后会出现在这里。',
      noSelection: '未选择邮件',
      noSelectionDesc: '用 J / K 在列表里上下切换，Enter 回复。',
      back: '返回列表',
      toMe: '发给 我',
      actionsLabel: '邮件操作',
      copyBody: '复制正文',
      copied: '已复制',
      reply: '回复',
      archive: '归档',
      more: '更多操作',
      markUnread: '标为未读',
      moveTo: '移动到',
      mute: '静音此会话',
      unmute: '取消静音',
      attachmentsTitle: (n: number) => `附件 · ${n}`,
      thread: (n: number) => `往来 · ${n}`,
      replyPlaceholder: (name: string) => `回复 ${name}…`,
      replyLabel: '回复内容',
      send: '发送',
      attach: '添加附件',
      sendHint: '发送',
      composeTitle: '新邮件',
      composeTo: '收件人',
      composeSubject: '主题',
      composePlaceholder: '写点什么…',
      cancel: '取消',
      tray: {
        preview: '预览',
        prev: '上一张',
        next: '下一张',
        prevText: '上一张',
        nextText: '下一张',
        remove: '移除附件',
        cancel: '取消上传',
      },
      toastLabel: '通知',
      dismiss: '关闭提示',
      view: '查看',
      undo: '撤销',
      newMail: (from: string) => `新邮件 · ${from}`,
      archived: '已归档',
      moved: (folder: string) => `已移动到${folder}`,
      markedUnread: '已标为未读',
      muted: '已静音此会话',
      unmuted: '已取消静音',
      starred: '已加星标',
      unstarred: '已取消星标',
      sent: '已发送',
      bodyCopied: '已复制正文',
      hostOpens: (name: string) => `宿主会用系统应用打开 ${name}`,
      shortcuts: '快捷键',
      keys: { next: '下一封', prev: '上一封', archive: '归档', star: '星标' },
    }
  : {
      frameTitle: 'Inbox',
      account: 'Tuff account',
      address: 'you@tuff.dev',
      searchPlaceholder: 'Search sender or subject',
      searchLabel: 'Search mail',
      compose: 'Compose',
      foldersLabel: 'Mailboxes',
      mailboxGroup: 'Mailboxes',
      labelsGroup: 'Labels',
      navLabel: 'Mail navigation',
      workspaceLabel: 'Switch account',
      synced: 'Synced · 10:30',
      unread: (n: number) => `${n} unread`,
      listLabel: (view: string) => `${view}, message list`,
      sortLabel: 'Sort and filter',
      sort: { newest: 'Newest first', unread: 'Unread first' },
      attachmentsOnly: 'With attachments',
      yesterday: 'Yesterday',
      to: (name: string) => `To ${name}`,
      star: 'Star',
      unstar: 'Unstar',
      emptySearch: 'No matching mail',
      emptySearchDesc: 'Try another keyword, or clear the search.',
      clearSearch: 'Clear search',
      emptyFolder: 'Nothing here yet',
      emptyFolderDesc: 'New mail will show up here.',
      noSelection: 'No message selected',
      noSelectionDesc: 'Use J / K to move through the list and Enter to reply.',
      back: 'Back to list',
      toMe: 'to me',
      actionsLabel: 'Message actions',
      copyBody: 'Copy text',
      copied: 'Copied',
      reply: 'Reply',
      archive: 'Archive',
      more: 'More actions',
      markUnread: 'Mark as unread',
      moveTo: 'Move to',
      mute: 'Mute thread',
      unmute: 'Unmute thread',
      attachmentsTitle: (n: number) => `Attachments · ${n}`,
      thread: (n: number) => `Conversation · ${n}`,
      replyPlaceholder: (name: string) => `Reply to ${name}…`,
      replyLabel: 'Reply',
      send: 'Send',
      attach: 'Attach files',
      sendHint: 'to send',
      composeTitle: 'New message',
      composeTo: 'To',
      composeSubject: 'Subject',
      composePlaceholder: 'Write something…',
      cancel: 'Cancel',
      tray: {
        preview: 'Preview',
        prev: 'Previous image',
        next: 'Next image',
        prevText: 'Prev',
        nextText: 'Next',
        remove: 'Remove attachment',
        cancel: 'Cancel upload',
      },
      toastLabel: 'Notifications',
      dismiss: 'Dismiss',
      view: 'View',
      undo: 'Undo',
      newMail: (from: string) => `New mail · ${from}`,
      archived: 'Archived',
      moved: (folder: string) => `Moved to ${folder}`,
      markedUnread: 'Marked as unread',
      muted: 'Thread muted',
      unmuted: 'Thread unmuted',
      starred: 'Starred',
      unstarred: 'Unstarred',
      sent: 'Sent',
      bodyCopied: 'Copied the message text',
      hostOpens: (name: string) => `The host would open ${name} in its system app`,
      shortcuts: 'Shortcuts',
      keys: { next: 'Next', prev: 'Previous', archive: 'Archive', star: 'Star' },
    })

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

const mails = ref<Mail[]>(seedAll())
const view = ref<View>('inbox')
const search = ref('')
const sortMode = ref<SortMode>('newest')
const attachmentsOnly = ref(false)
const selectedId = ref<string | null>('review-translate')
const readerOpen = ref(false)
const composing = ref(false)
const split = ref(0.42)
const loading = ref(false)
const showSkeleton = useDeferredLoading(loading, { delay: 120, minDuration: 360 })

let loadTimer: ReturnType<typeof setTimeout> | undefined

markRead('review-translate')

function markRead(id: string): void {
  const mail = mails.value.find(item => item.id === id)
  if (mail)
    mail.unread = false
}

function inView(mail: Mail, target: View): boolean {
  if (target.startsWith('label-'))
    return mail.folder !== 'archive' && mail.labels.includes(target.slice(6) as Label)
  return mail.folder === target
}

const viewTitle = computed(() => {
  const current = view.value
  if (current.startsWith('label-'))
    return L(LABEL_META[current.slice(6) as Label].label)
  return L(FOLDER_META[current as Folder].label)
})

function senderName(id: SenderId): string {
  return L(SENDERS[id].name)
}

const listItems = computed(() => {
  const needle = search.value.trim().toLowerCase()
  const list = mails.value.filter((mail) => {
    if (!inView(mail, view.value))
      return false
    if (attachmentsOnly.value && !mail.attachments.length)
      return false
    if (!needle)
      return true
    return senderName(mail.sender).toLowerCase().includes(needle)
      || L(mail.subject).toLowerCase().includes(needle)
      || L(mail.snippet).toLowerCase().includes(needle)
  })
  return list.sort((a, b) => {
    if (sortMode.value === 'unread' && a.unread !== b.unread)
      return a.unread ? -1 : 1
    return b.receivedAt - a.receivedAt
  })
})

const selected = computed(() => mails.value.find(mail => mail.id === selectedId.value) ?? null)
const selectedIndex = computed(() => listItems.value.findIndex(mail => mail.id === selectedId.value))

function unreadIn(target: View): number {
  return mails.value.filter(mail => mail.unread && inView(mail, target)).length
}

const viewUnread = computed(() => unreadIn(view.value))

const folderChips = computed<FilterChipItem[]>(() => FOLDERS.map((folder) => {
  const unread = unreadIn(folder)
  return {
    value: folder,
    label: L(FOLDER_META[folder].label),
    // Unread, not total: that is the number a mailbox chip is read for.
    count: unread || undefined,
  }
}))

const navGroups = computed<SidebarNavGroup[]>(() => [
  { key: 'mail', label: copy.value.mailboxGroup },
  { key: 'labels', label: copy.value.labelsGroup },
])

const navItems = computed<SidebarNavItem[]>(() => [
  ...FOLDERS.map(folder => ({
    value: folder,
    label: L(FOLDER_META[folder].label),
    group: 'mail',
    icon: FOLDER_META[folder].icon,
    badge: unreadIn(folder) || undefined,
  })),
  ...LABELS.map(label => ({
    value: `label-${label}`,
    label: L(LABEL_META[label].label),
    group: 'labels',
    icon: LABEL_META[label].icon,
    badge: unreadIn(`label-${label}`) || undefined,
  })),
])

/* ─── Formatting ──────────────────────────────────────────────────────── */

const SHANGHAI = 8 * HOUR

function dayNumber(ts: number): number {
  return Math.floor((ts + SHANGHAI) / DAY)
}

const timeFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const weekdayFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { weekday: 'short', timeZone: 'Asia/Shanghai' }))
const dayFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))
const fullFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))

function listTime(ts: number): string {
  const days = dayNumber(NOW) - dayNumber(ts)
  if (days <= 0)
    return timeFormat.value.format(ts)
  if (days === 1)
    return copy.value.yesterday
  if (days < 7)
    return weekdayFormat.value.format(ts)
  return dayFormat.value.format(ts)
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function avatarColors(id: SenderId): { bg: string, ink: string } {
  const hue = SENDERS[id].hue ?? 'var(--tx-bui-accent, #0285ff)'
  return {
    bg: `color-mix(in srgb, ${hue} 20%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 78%, var(--tx-text-color-primary, #303133))`,
  }
}

// Plain text for the copy button: drop the markdown punctuation that would
// otherwise land in someone's clipboard.
function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, block => block.replace(/```\w*\n?/g, ''))
    .replace(/[*`>#|]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The send chord is shown the way the reader's keyboard labels it.
const sendKey = hasNavigator() && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

function optionId(id: string): string {
  return `${uid}-mail-${id}`
}

/* ─── List loading (simulated fetch on view change) ──────────────────── */

function setView(next: View): void {
  if (next === view.value)
    return
  view.value = next
  composing.value = false
  loading.value = true
  clearTimeout(loadTimer)
  loadTimer = setTimeout(() => {
    loadTimer = undefined
    loading.value = false
  }, 400)
  void nextTick(() => listRef.value?.scrollToTop())
}

function onChip(value: FilterChipValue): void {
  setView(value as View)
}

function onNav(value: SidebarNavValue): void {
  setView(value as View)
}

/* ─── Selection & keyboard ───────────────────────────────────────────── */

const listRef = ref<{ scrollToIndex: (index: number) => void, scrollToTop: () => void, $el?: HTMLElement } | null>(null)
const listboxRef = ref<HTMLElement | null>(null)
const composerHost = ref<HTMLElement | null>(null)

function select(id: string, open = true): void {
  selectedId.value = id
  composing.value = false
  markRead(id)
  if (open)
    readerOpen.value = true
}

// Scroll only as far as needed to reveal the row, like a native listbox;
// TxVirtualList.scrollToIndex alone would pin every step to the top.
function reveal(index: number): void {
  const container = listRef.value?.$el
  if (!container)
    return
  const top = index * ROW_HEIGHT
  const bottom = top + ROW_HEIGHT
  if (top < container.scrollTop)
    listRef.value?.scrollToIndex(index)
  else if (bottom > container.scrollTop + container.clientHeight)
    container.scrollTop = bottom - container.clientHeight
}

function move(delta: number): void {
  const list = listItems.value
  if (!list.length)
    return
  const current = selectedIndex.value
  const next = current < 0 ? 0 : Math.min(list.length - 1, Math.max(0, current + delta))
  const mail = list[next]
  if (!mail)
    return
  select(mail.id, false)
  reveal(next)
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true
  return target.isContentEditable || Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'))
}

function focusReply(): void {
  const field = composerHost.value?.querySelector<HTMLTextAreaElement>('textarea')
  // Only ever reached from a key the reader pressed, never from playback.
  field?.focus({ preventScroll: true })
}

// Bound to the template root: the shortcuts exist only while focus is inside
// the template, and never while the reader is typing.
function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  if (isEditable(event.target))
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="menu"], [role="toolbar"], [role="tablist"], [role="radiogroup"]'))
    return

  const key = event.key
  if (key === 'Escape' && mode.value === 'narrow' && readerOpen.value) {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    readerOpen.value = false
    return
  }
  if (key === 'ArrowDown' || key === 'j' || key === 'J') {
    event.preventDefault()
    move(1)
  }
  else if (key === 'ArrowUp' || key === 'k' || key === 'K') {
    event.preventDefault()
    move(-1)
  }
  else if ((key === 'e' || key === 'E') && selected.value) {
    event.preventDefault()
    archive(selected.value)
  }
  else if ((key === 's' || key === 'S') && selected.value) {
    event.preventDefault()
    toggleStar(selected.value)
  }
  else if (key === 'Enter' && selected.value && !target?.closest('button, a')) {
    event.preventDefault()
    readerOpen.value = true
    void nextTick(focusReply)
  }
}

/* ─── Toast ───────────────────────────────────────────────────────────── */

interface ToastState {
  open: boolean
  title: string
  text: string
  icon: string
  sender: SenderId | null
  action: 'view' | 'undo' | null
}

const toast = reactive<ToastState>({ open: false, title: '', text: '', icon: 'i-carbon-checkmark-outline', sender: null, action: null })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastTarget: string | null = null
let undoAction: (() => void) | null = null

function notify(state: Omit<ToastState, 'open'>, duration = 3200): void {
  Object.assign(toast, state, { open: true })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
    undoAction = null
  }, duration)
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  undoAction = null
}

function onToastAction(): void {
  if (toast.action === 'view' && toastTarget) {
    search.value = ''
    setView('inbox')
    const id = toastTarget
    void nextTick(() => {
      select(id)
      const index = listItems.value.findIndex(mail => mail.id === id)
      if (index >= 0)
        reveal(index)
    })
  }
  else if (toast.action === 'undo') {
    undoAction?.()
  }
  closeToast()
}

function withUndo(text: string, icon: string, undo: () => void): void {
  undoAction = undo
  notify({ title: '', text, icon, sender: null, action: 'undo' }, 4200)
}

/* ─── Mail actions ────────────────────────────────────────────────────── */

function nextAfter(mail: Mail): string | null {
  const list = listItems.value
  const index = list.findIndex(item => item.id === mail.id)
  const next = list[index + 1] ?? list[index - 1]
  return next ? next.id : null
}

function moveTo(mail: Mail, folder: Folder): void {
  if (mail.folder === folder)
    return
  const previous = mail.folder
  const nextId = nextAfter(mail)
  mail.folder = folder
  if (!inView(mail, view.value) && selectedId.value === mail.id) {
    selectedId.value = nextId
    if (nextId)
      markRead(nextId)
  }
  const restore = (): void => {
    mail.folder = previous
    selectedId.value = mail.id
  }
  if (folder === 'archive')
    withUndo(copy.value.archived, 'i-carbon-archive', restore)
  else
    withUndo(copy.value.moved(L(FOLDER_META[folder].label)), 'i-carbon-folder-move-to', restore)
}

function archive(mail: Mail): void {
  moveTo(mail, 'archive')
}

function toggleStar(mail: Mail): void {
  mail.starred = !mail.starred
  notify({ title: '', text: mail.starred ? copy.value.starred : copy.value.unstarred, icon: mail.starred ? 'i-carbon-star-filled' : 'i-carbon-star', sender: null, action: null }, 1800)
}

function markUnread(mail: Mail): void {
  mail.unread = true
  notify({ title: '', text: copy.value.markedUnread, icon: 'i-carbon-email-new', sender: null, action: null }, 1800)
}

function toggleMute(mail: Mail): void {
  mail.muted = !mail.muted
  notify({ title: '', text: mail.muted ? copy.value.muted : copy.value.unmuted, icon: 'i-carbon-notification-off', sender: null, action: null }, 1800)
}

function onCopied(): void {
  notify({ title: '', text: copy.value.bodyCopied, icon: 'i-carbon-copy', sender: null, action: null }, 1800)
}

function onOpenAttachment(name: string): void {
  notify({ title: '', text: copy.value.hostOpens(name), icon: 'i-carbon-launch', sender: null, action: null }, 2600)
}

function clearSearch(): void {
  search.value = ''
}

/* ─── Reply & compose ─────────────────────────────────────────────────── */

const drafts = reactive<Record<string, string>>({})
const draftFiles = ref<AiAttachment[]>([])
const sending = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const composeDraft = reactive({ to: '', subject: '', body: '' })
// Object URLs for pasted or dropped images belong to the template: revoked on
// removal, reset and unmount, and when a reply is sent. Images a composed mail
// took with it stay alive until reset or unmount.
const draftUrls = new Set<string>()
let sendTimer: ReturnType<typeof setTimeout> | undefined
let replySeq = 0

const replyText = computed({
  get: () => (selectedId.value ? drafts[selectedId.value] ?? '' : ''),
  set: (value: string) => {
    if (selectedId.value)
      drafts[selectedId.value] = value
  },
})

function addFiles(files: File[]): void {
  for (const file of files) {
    const id = `draft-${Date.now().toString(36)}-${draftFiles.value.length}`
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      draftUrls.add(url)
      draftFiles.value.push({ kind: 'image', id, url, name: file.name })
    }
    else {
      draftFiles.value.push({ kind: 'file', id, name: file.name, size: file.size, mime: file.type })
    }
  }
}

function pickFiles(): void {
  fileInput.value?.click()
}

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function removeDraftFile(id: string): void {
  const item = draftFiles.value.find(file => file.id === id)
  if (item?.kind === 'image' && draftUrls.has(item.url)) {
    URL.revokeObjectURL(item.url)
    draftUrls.delete(item.url)
  }
  draftFiles.value = draftFiles.value.filter(file => file.id !== id)
}

function releaseDraftFiles(): void {
  for (const url of draftUrls)
    URL.revokeObjectURL(url)
  draftUrls.clear()
  draftFiles.value = []
}

// Only the current draft's images: revoking every URL here would break the
// attachments of a mail sent from the composer earlier.
function discardDraftFiles(): void {
  for (const item of draftFiles.value) {
    if (item.kind === 'image' && draftUrls.delete(item.url))
      URL.revokeObjectURL(item.url)
  }
  draftFiles.value = []
}

function sendReply(payload: { text: string }): void {
  const mail = selected.value
  if (!mail || sending.value)
    return
  sending.value = true
  clearTimeout(sendTimer)
  sendTimer = setTimeout(() => {
    sendTimer = undefined
    replySeq += 1
    const entry: ThreadEntry = { id: `reply-${replySeq}`, from: 'me', at: NOW + replySeq * MINUTE, body: { zh: payload.text, en: payload.text } }
    mail.thread.push(entry)
    drafts[mail.id] = ''
    discardDraftFiles()
    sending.value = false
    withUndo(copy.value.sent, 'i-carbon-send-alt', () => {
      mail.thread = mail.thread.filter(item => item.id !== entry.id)
      drafts[mail.id] = payload.text
    })
  }, 600)
}

function startCompose(): void {
  composing.value = true
  readerOpen.value = true
  Object.assign(composeDraft, { to: '', subject: '', body: '' })
}

function sendCompose(payload: { text: string }): void {
  if (sending.value)
    return
  sending.value = true
  clearTimeout(sendTimer)
  sendTimer = setTimeout(() => {
    sendTimer = undefined
    replySeq += 1
    const subject = composeDraft.subject.trim() || (zh.value ? '（无主题）' : '(no subject)')
    const id = `sent-${replySeq}`
    mails.value.unshift({
      id,
      folder: 'sent',
      labels: [],
      sender: 'me',
      subject: { zh: subject, en: subject },
      snippet: { zh: payload.text, en: payload.text },
      body: { zh: payload.text, en: payload.text },
      receivedAt: NOW + replySeq * MINUTE,
      unread: false,
      starred: false,
      muted: false,
      attachments: [...draftFiles.value],
      thread: [],
    })
    draftFiles.value = []
    sending.value = false
    composing.value = false
    withUndo(copy.value.sent, 'i-carbon-send-alt', () => {
      mails.value = mails.value.filter(mail => mail.id !== id)
    })
  }, 600)
}

const threadCount = computed(() => selected.value?.thread.length ?? 0)

/* ─── Arrivals (scripted playback) ───────────────────────────────────── */

const arrivalTimers: ReturnType<typeof setTimeout>[] = []
let entered = false

function clearArrivals(): void {
  while (arrivalTimers.length)
    clearTimeout(arrivalTimers.pop())
}

function deliver(mail: Mail, announce: boolean): void {
  if (mails.value.some(item => item.id === mail.id))
    return
  const container = listRef.value?.$el
  const scrolled = view.value === 'inbox' && container && container.scrollTop > 2
  mails.value.unshift(mail)
  // A reader who has scrolled away from the top keeps their place: the new
  // row lands above the viewport and the list shifts by exactly one row.
  if (scrolled && container) {
    void nextTick(() => {
      container.scrollTop += ROW_HEIGHT
    })
  }
  if (!announce)
    return
  toastTarget = mail.id
  undoAction = null
  notify({
    title: copy.value.newMail(senderName(mail.sender)),
    text: L(mail.subject),
    icon: '',
    sender: mail.sender,
    action: 'view',
  }, 4200)
}

function startArrivals(): void {
  clearArrivals()
  if (prefersReducedMotion()) {
    for (const arrival of ARRIVALS)
      deliver(arrival.mail(), false)
    return
  }
  for (const arrival of ARRIVALS)
    arrivalTimers.push(setTimeout(() => deliver(arrival.mail(), true), arrival.delay))
}

function onEnter(): void {
  entered = true
  startArrivals()
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function resetDemo(): void {
  clearArrivals()
  clearTimeout(loadTimer)
  clearTimeout(sendTimer)
  closeToast()
  releaseDraftFiles()
  for (const key of Object.keys(drafts))
    delete drafts[key]
  mails.value = seedAll()
  view.value = 'inbox'
  search.value = ''
  sortMode.value = 'newest'
  attachmentsOnly.value = false
  loading.value = false
  sending.value = false
  composing.value = false
  readerOpen.value = false
  split.value = 0.42
  replySeq = 0
  selectedId.value = 'review-translate'
  markRead('review-translate')
  void nextTick(() => listRef.value?.scrollToTop())
  if (entered)
    startArrivals()
}

defineExpose({ resetDemo })

watch(locale, () => {
  if (entered)
    resetDemo()
})

onBeforeUnmount(() => {
  clearArrivals()
  clearTimeout(loadTimer)
  clearTimeout(toastTimer)
  clearTimeout(sendTimer)
  releaseDraftFiles()
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div class="inbox" :class="[`is-${mode}`, { 'is-reading': readerOpen }]" @keydown="onKeydown">
        <aside v-if="mode === 'wide'" class="inbox__nav">
          <TxSidebarNav
            :model-value="view"
            :items="navItems"
            :groups="navGroups"
            :workspace="{ name: copy.account, description: copy.address, initials: 'T' }"
            :workspace-label="copy.workspaceLabel"
            :action-label="copy.compose"
            :aria-label="copy.navLabel"
            @update:model-value="onNav"
            @action="startCompose"
          >
            <template #footer>
              <div class="inbox-nav__footer">
                <TxDotIndicator color="var(--tx-bui-green, #189a4d)" :size="6" :label="copy.synced" />
              </div>
            </template>
          </TxSidebarNav>
        </aside>

        <header class="inbox__head">
          <div class="inbox__brand">
            <span class="inbox__logo" aria-hidden="true"><span class="i-carbon-email" /></span>
            <div class="inbox__brand-text">
              <strong class="inbox__title">{{ copy.account }}</strong>
              <span class="inbox__subtitle">{{ copy.address }}</span>
            </div>
          </div>
          <div class="inbox__search">
            <TxSearchInput v-model="search" :placeholder="copy.searchPlaceholder" :aria-label="copy.searchLabel" />
          </div>
          <div v-if="mode === 'wide'" class="inbox__keys" role="group" :aria-label="copy.shortcuts">
            <span class="inbox__key"><TxKbd>J</TxKbd><TxKbd>K</TxKbd>{{ copy.keys.next }}</span>
            <span class="inbox__key"><TxKbd>E</TxKbd>{{ copy.keys.archive }}</span>
            <span class="inbox__key"><TxKbd>S</TxKbd>{{ copy.keys.star }}</span>
          </div>
          <TxButton v-else variant="primary" size="sm" icon="i-carbon-edit" :aria-label="copy.compose" @click="startCompose">
            <span class="inbox__compose-label">{{ copy.compose }}</span>
          </TxButton>
        </header>

        <div v-if="mode !== 'wide'" class="inbox__chips">
          <TxFilterChips
            :model-value="view"
            :items="folderChips"
            :aria-label="copy.foldersLabel"
            @update:model-value="onChip"
          />
        </div>

        <section class="inbox__main">
          <TxSplitter v-model="split" :min="0.3" :max="0.62" :bar-size="9">
            <template #a>
              <div class="inbox-list">
                <div class="inbox-list__head">
                  <span class="inbox-list__title">{{ viewTitle }}</span>
                  <TxBadge v-if="viewUnread" variant="primary" :value="viewUnread" />
                  <span class="inbox-list__tools">
                    <TxDropdownMenu placement="bottom-end" :min-width="176">
                      <template #trigger>
                        <TxIconButton icon="i-carbon-sort-descending" size="xs" :label="copy.sortLabel" />
                      </template>
                      <TxDropdownItem v-for="option in SORT_MODES" :key="option" @select="sortMode = option">
                        {{ copy.sort[option] }}
                        <template v-if="sortMode === option" #right>
                          <span class="i-carbon-checkmark inbox-check" aria-hidden="true" />
                        </template>
                      </TxDropdownItem>
                      <TxDropdownItem @select="attachmentsOnly = !attachmentsOnly">
                        {{ copy.attachmentsOnly }}
                        <template v-if="attachmentsOnly" #right>
                          <span class="i-carbon-checkmark inbox-check" aria-hidden="true" />
                        </template>
                      </TxDropdownItem>
                    </TxDropdownMenu>
                  </span>
                </div>

                <div class="inbox-list__body">
                  <div v-if="showSkeleton" class="inbox-list__skeleton" aria-hidden="true">
                    <div v-for="row in 6" :key="row" class="inbox-row is-skeleton">
                      <TxSkeleton variant="circle" width="32px" :height="32" />
                      <div class="inbox-row__skeleton-lines">
                        <TxSkeleton width="38%" :height="10" />
                        <TxSkeleton width="72%" :height="10" />
                        <TxSkeleton width="56%" :height="8" />
                      </div>
                    </div>
                  </div>
                  <template v-else-if="listItems.length">
                    <div
                      ref="listboxRef"
                      class="inbox-list__listbox"
                      role="listbox"
                      tabindex="0"
                      :aria-label="copy.listLabel(viewTitle)"
                      :aria-activedescendant="selected && selectedIndex >= 0 ? optionId(selected.id) : undefined"
                    >
                      <TxVirtualList ref="listRef" :items="listItems" :item-height="ROW_HEIGHT" item-key="id" height="100%">
                        <template #item="{ item, index }">
                          <div
                            :id="optionId(item.id)"
                            class="inbox-row"
                            :class="{ 'is-unread': item.unread, 'is-selected': item.id === selectedId }"
                            role="option"
                            :aria-selected="item.id === selectedId"
                            :aria-setsize="listItems.length"
                            :aria-posinset="index + 1"
                            @click="select(item.id)"
                          >
                            <span class="inbox-row__avatar">
                              <TxAvatar
                                v-if="SENDERS[item.sender as SenderId].system"
                                src="/logo.svg"
                                :alt="senderName(item.sender)"
                                :size="32"
                                shape="rounded"
                              />
                              <TxAvatar
                                v-else
                                :name="senderName(item.to ?? item.sender)"
                                :size="32"
                                :background-color="avatarColors(item.to ?? item.sender).bg"
                                :text-color="avatarColors(item.to ?? item.sender).ink"
                              />
                              <span v-if="item.unread" class="inbox-row__dot">
                                <TxDotIndicator color="var(--tx-bui-accent, #0285ff)" :size="7" />
                              </span>
                            </span>
                            <span class="inbox-row__text">
                              <span class="inbox-row__line">
                                <span class="inbox-row__sender">{{ item.to ? copy.to(senderName(item.to)) : senderName(item.sender) }}</span>
                                <span v-if="item.attachments.length" class="inbox-row__clip i-carbon-attachment" aria-hidden="true" />
                                <span class="inbox-row__time">{{ listTime(item.receivedAt) }}</span>
                              </span>
                              <span class="inbox-row__subject">{{ L(item.subject) }}</span>
                              <span class="inbox-row__line">
                                <span class="inbox-row__snippet">{{ L(item.snippet) }}</span>
                                <span v-if="item.labels[0] && mode !== 'narrow'" class="inbox-row__label">
                                  <TxTag :label="L(LABEL_META[item.labels[0] as Label].label)" :color="LABEL_META[item.labels[0] as Label].color" variant="soft" />
                                </span>
                                <span class="inbox-row__star" @click.stop>
                                  <TxIconButton
                                    :icon="item.starred ? 'i-carbon-star-filled' : 'i-carbon-star'"
                                    :pressed="item.starred"
                                    size="xs"
                                    tabindex="-1"
                                    :label="item.starred ? copy.unstar : copy.star"
                                    @click="toggleStar(item)"
                                  />
                                </span>
                              </span>
                            </span>
                          </div>
                        </template>
                      </TxVirtualList>
                    </div>
                  </template>
                  <div v-else class="inbox-list__empty">
                    <TxSearchEmpty
                      v-if="search"
                      size="small"
                      :title="copy.emptySearch"
                      :description="copy.emptySearchDesc"
                      :primary-action="{ label: copy.clearSearch }"
                      @primary="clearSearch"
                    >
                      <template #icon>
                        <span class="inbox-empty-icon i-carbon-search" aria-hidden="true" />
                      </template>
                    </TxSearchEmpty>
                    <TxEmptyState v-else variant="custom" size="small" :title="copy.emptyFolder" :description="copy.emptyFolderDesc">
                      <template #icon>
                        <span class="inbox-empty-icon i-carbon-email" aria-hidden="true" />
                      </template>
                    </TxEmptyState>
                  </div>

                  <div class="inbox-list__toast" :class="{ 'is-open': toast.open }">
                    <TxToastPanel :open="toast.open" :stack="toast.sender ? 1 : 0" :tether-length="10" :aria-label="copy.toastLabel">
                      <div class="inbox-toast">
                        <TxAvatar
                          v-if="toast.sender && SENDERS[toast.sender].system"
                          src="/logo.svg"
                          alt=""
                          :size="28"
                          shape="rounded"
                        />
                        <TxAvatar
                          v-else-if="toast.sender"
                          :name="senderName(toast.sender)"
                          :size="28"
                          :background-color="avatarColors(toast.sender).bg"
                          :text-color="avatarColors(toast.sender).ink"
                        />
                        <span v-else class="inbox-toast__icon" :class="toast.icon" aria-hidden="true" />
                        <span class="inbox-toast__text">
                          <span v-if="toast.title" class="inbox-toast__title">{{ toast.title }}</span>
                          <span class="inbox-toast__body">{{ toast.text }}</span>
                        </span>
                        <button v-if="toast.action" type="button" class="inbox-toast__action" @click="onToastAction">
                          {{ toast.action === 'view' ? copy.view : copy.undo }}
                        </button>
                        <button type="button" class="inbox-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                          <span class="i-carbon-close" aria-hidden="true" />
                        </button>
                      </div>
                    </TxToastPanel>
                  </div>
                </div>
              </div>
            </template>

            <template #b>
              <div class="inbox-reader">
                <template v-if="composing">
                  <div class="inbox-reader__head">
                    <button v-if="mode === 'narrow'" type="button" class="inbox-reader__back" :aria-label="copy.back" @click="composing = false; readerOpen = false">
                      <span class="i-carbon-arrow-left" aria-hidden="true" />
                    </button>
                    <strong class="inbox-reader__subject">{{ copy.composeTitle }}</strong>
                    <TxButton variant="ghost" size="sm" @click="composing = false">
                      {{ copy.cancel }}
                    </TxButton>
                  </div>
                  <div class="inbox-compose">
                    <label class="inbox-compose__field">
                      <span>{{ copy.composeTo }}</span>
                      <TxInput v-model="composeDraft.to" placeholder="kenji.sato@example.com" />
                    </label>
                    <label class="inbox-compose__field">
                      <span>{{ copy.composeSubject }}</span>
                      <TxInput v-model="composeDraft.subject" />
                    </label>
                  </div>
                  <div class="inbox-reader__spacer" />
                  <div class="inbox-reader__composer">
                    <TxChatComposer
                      v-model="composeDraft.body"
                      :placeholder="copy.composePlaceholder"
                      :aria-label="copy.composePlaceholder"
                      :submitting="sending"
                      :min-rows="4"
                      :max-rows="8"
                      :send-button-text="copy.send"
                      @send="sendCompose"
                    >
                      <template #footer>
                        <span class="inbox-reader__hint"><TxKbd>{{ sendKey }}</TxKbd><TxKbd>Enter</TxKbd>{{ copy.sendHint }}</span>
                      </template>
                    </TxChatComposer>
                  </div>
                </template>

                <template v-else-if="selected">
                  <div class="inbox-reader__head">
                    <button v-if="mode === 'narrow'" type="button" class="inbox-reader__back" :aria-label="copy.back" @click="readerOpen = false">
                      <span class="i-carbon-arrow-left" aria-hidden="true" />
                    </button>
                    <strong class="inbox-reader__subject">{{ L(selected.subject) }}</strong>
                    <TxMessageActions
                      :copy-text="plainText(L(selected.body))"
                      :appear="false"
                      :copy-label="copy.copyBody"
                      :copied-label="copy.copied"
                      :label="copy.actionsLabel"
                      @copy="onCopied"
                    >
                      <button type="button" class="tx-message-actions__btn" :aria-label="copy.reply" :title="copy.reply" @click="focusReply">
                        <span class="i-carbon-reply" aria-hidden="true" />
                      </button>
                      <button type="button" class="tx-message-actions__btn" :aria-label="copy.archive" :title="copy.archive" @click="archive(selected)">
                        <span class="i-carbon-archive" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="tx-message-actions__btn"
                        :class="{ 'is-on': selected.starred }"
                        :aria-label="selected.starred ? copy.unstar : copy.star"
                        :aria-pressed="selected.starred"
                        :title="selected.starred ? copy.unstar : copy.star"
                        @click="toggleStar(selected)"
                      >
                        <span :class="selected.starred ? 'i-carbon-star-filled' : 'i-carbon-star'" aria-hidden="true" />
                      </button>
                      <TxDropdownMenu placement="bottom-end" :min-width="188">
                        <template #trigger>
                          <button type="button" class="tx-message-actions__btn" :aria-label="copy.more" :title="copy.more">
                            <span class="i-carbon-overflow-menu-vertical" aria-hidden="true" />
                          </button>
                        </template>
                        <TxDropdownItem @select="markUnread(selected)">
                          <span class="inbox-menu-item"><span class="i-carbon-email-new" aria-hidden="true" />{{ copy.markUnread }}</span>
                        </TxDropdownItem>
                        <TxDropdownSubmenu>
                          <span class="inbox-menu-item"><span class="i-carbon-folder-move-to" aria-hidden="true" />{{ copy.moveTo }}</span>
                          <template #menu>
                            <TxDropdownItem
                              v-for="folder in FOLDERS.filter(item => item !== 'sent')"
                              :key="folder"
                              :disabled="selected.folder === folder"
                              @select="moveTo(selected, folder)"
                            >
                              <span class="inbox-menu-item"><span :class="FOLDER_META[folder].icon" aria-hidden="true" />{{ L(FOLDER_META[folder].label) }}</span>
                            </TxDropdownItem>
                          </template>
                        </TxDropdownSubmenu>
                        <TxDropdownItem @select="toggleMute(selected)">
                          <span class="inbox-menu-item"><span class="i-carbon-notification-off" aria-hidden="true" />{{ selected.muted ? copy.unmute : copy.mute }}</span>
                        </TxDropdownItem>
                      </TxDropdownMenu>
                    </TxMessageActions>
                  </div>

                  <div class="inbox-reader__from">
                    <TxAvatar
                      v-if="SENDERS[selected.sender].system"
                      src="/logo.svg"
                      :alt="senderName(selected.sender)"
                      :size="34"
                      shape="rounded"
                    />
                    <TxAvatar
                      v-else
                      :name="senderName(selected.sender)"
                      :size="34"
                      :background-color="avatarColors(selected.sender).bg"
                      :text-color="avatarColors(selected.sender).ink"
                    />
                    <span class="inbox-reader__who">
                      <span class="inbox-reader__line">
                        <span class="inbox-reader__name">{{ senderName(selected.sender) }}</span>
                        <span class="inbox-reader__address">&lt;{{ SENDERS[selected.sender].address }}&gt;</span>
                      </span>
                      <span class="inbox-reader__meta">{{ selected.to ? copy.to(senderName(selected.to)) : copy.toMe }} · {{ fullFormat.format(selected.receivedAt) }}</span>
                    </span>
                    <span class="inbox-reader__labels">
                      <TxTag
                        v-for="label in selected.labels"
                        :key="label"
                        :label="L(LABEL_META[label].label)"
                        :color="LABEL_META[label].color"
                        variant="soft"
                      />
                    </span>
                  </div>

                  <div class="inbox-reader__scroll">
                    <div class="inbox-reader__body">
                      <TxMarkdownView :content="L(selected.body)" />
                    </div>

                    <div v-if="selected.attachments.length" class="inbox-reader__section">
                      <span class="inbox-reader__section-title">{{ copy.attachmentsTitle(selected.attachments.length) }}</span>
                      <TxAttachmentTray
                        :attachments="selected.attachments"
                        :size-formatter="formatSize"
                        :preview-title="copy.tray.preview"
                        :previous-label="copy.tray.prev"
                        :next-label="copy.tray.next"
                        :previous-text="copy.tray.prevText"
                        :next-text="copy.tray.nextText"
                        :remove-label="copy.tray.remove"
                        :cancel-label="copy.tray.cancel"
                        @open="onOpenAttachment($event.name)"
                      />
                    </div>

                    <div v-if="threadCount" class="inbox-reader__section">
                      <span class="inbox-reader__section-title">{{ copy.thread(threadCount) }}</span>
                      <article v-for="entry in selected.thread" :key="entry.id" class="inbox-thread" :class="{ 'is-mine': entry.from === 'me' }">
                        <span class="inbox-thread__head">
                          <strong>{{ senderName(entry.from) }}</strong>
                          <span>{{ fullFormat.format(entry.at) }}</span>
                        </span>
                        <p class="inbox-thread__body">
                          {{ L(entry.body) }}
                        </p>
                      </article>
                    </div>
                  </div>

                  <div ref="composerHost" class="inbox-reader__composer">
                    <input ref="fileInput" class="inbox-reader__file" type="file" multiple tabindex="-1" aria-hidden="true" @change="onFileInput">
                    <TxChatComposer
                      v-model="replyText"
                      :placeholder="copy.replyPlaceholder(senderName(selected.sender))"
                      :aria-label="copy.replyLabel"
                      :submitting="sending"
                      :min-rows="2"
                      :max-rows="5"
                      :send-button-text="copy.send"
                      :attachment-button-text="copy.attach"
                      show-attachment-button
                      @send="sendReply"
                      @attachment-add="addFiles"
                      @attachment-click="pickFiles"
                    >
                      <template v-if="draftFiles.length" #attachments>
                        <TxAttachmentTray
                          :attachments="draftFiles"
                          removable
                          :size-formatter="formatSize"
                          :preview-title="copy.tray.preview"
                          :previous-label="copy.tray.prev"
                          :next-label="copy.tray.next"
                          :previous-text="copy.tray.prevText"
                          :next-text="copy.tray.nextText"
                          :remove-label="copy.tray.remove"
                          :cancel-label="copy.tray.cancel"
                          @remove="removeDraftFile"
                        />
                      </template>
                      <template #footer>
                        <span class="inbox-reader__hint"><TxKbd>{{ sendKey }}</TxKbd><TxKbd>Enter</TxKbd>{{ copy.sendHint }}</span>
                      </template>
                    </TxChatComposer>
                  </div>
                </template>

                <TxNoSelection v-else size="small" :title="copy.noSelection">
                  <template #icon>
                    <span class="inbox-empty-icon i-carbon-email" aria-hidden="true" />
                  </template>
                  <template #description>
                    <span class="inbox-reader__hint">
                      <TxKbd>J</TxKbd><TxKbd>K</TxKbd>{{ copy.noSelectionDesc }}
                    </span>
                  </template>
                </TxNoSelection>
              </div>
            </template>
          </TxSplitter>
        </section>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.inbox {
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'head'
    'chips'
    'main';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: 14px 16px 16px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ---------------------------------------------------------------- */

.inbox__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  grid-area: head;
}

.inbox__brand {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 10px;
}

.inbox__logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 12%, var(--tx-bg-color, #fff));
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 15px;
}

.inbox__brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inbox__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.inbox__subtitle {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox__search {
  min-width: 0;
  max-width: 320px;
  flex: 1;
  margin-left: auto;
}

.inbox__search :deep(.tx-input) {
  width: 100%;
}

.inbox__keys {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox__key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.inbox__chips {
  min-width: 0;
  padding-top: 10px;
  grid-area: chips;
}

/* Main: one splitter, flush with the stage ------------------------------- */

.inbox__main {
  position: relative;
  min-width: 0;
  min-height: 0;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: main;
}

.inbox__main :deep(.tx-splitter) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.inbox__main :deep(.tx-splitter__bar)::before {
  inset: 0 4px;
  border-radius: 0;
  background: var(--tx-border-color-lighter, #ebeef5);
  opacity: 1;
}

.inbox__main :deep(.tx-splitter__bar:focus-visible)::before {
  background: var(--tx-color-primary, #409eff);
}

.inbox__main :deep(.tx-splitter__grip) {
  width: 5px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-border-color, #dcdfe6);
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.inbox__main :deep(.tx-splitter__pane) {
  position: relative;
  overflow: hidden;
}

/* List ------------------------------------------------------------------- */

.inbox-list {
  display: flex;
  height: 100%;
  flex-direction: column;
}

.inbox-list__head {
  display: flex;
  height: 44px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.inbox-list__tools {
  display: inline-flex;
  margin-left: auto;
}

.inbox-list__title {
  font-size: 14px;
  font-weight: 600;
}

.inbox-check {
  color: var(--tx-color-primary, #409eff);
}

.inbox-list__body {
  position: relative;
  min-height: 0;
  flex: 1;
}

.inbox-list__listbox {
  position: absolute;
  inset: 0;
  outline: none;
}

.inbox-list__listbox:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.inbox-list__skeleton {
  display: flex;
  flex-direction: column;
}

.inbox-list__empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.inbox-row {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  gap: 12px;
  /* Three 18px lines and two 2px gaps: exactly the 76px row TxVirtualList
     positions by. */
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid var(--tx-border-color-extra-light, #f2f6fc);
  cursor: pointer;
}

.inbox-row.is-skeleton {
  height: 76px;
  cursor: default;
}

.inbox-row__skeleton-lines {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.inbox-row:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.inbox-row.is-selected {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 9%, var(--tx-bg-color, #fff));
  box-shadow: inset 2px 0 0 var(--tx-bui-accent, #0285ff);
}

.inbox-row__avatar {
  position: relative;
  display: inline-flex;
  flex: none;
  align-self: flex-start;
  margin-top: 2px;
}

.inbox-row__dot {
  position: absolute;
  top: -3px;
  left: -5px;
  display: inline-flex;
  border-radius: 999px;
  box-shadow: 0 0 0 2px var(--tx-bg-color, #fff);
}

.inbox-row__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.inbox-row__line {
  display: flex;
  height: 18px;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.inbox-row__sender,
.inbox-row__subject,
.inbox-row__snippet {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-row__sender {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}

.inbox-row__clip {
  flex: none;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
}

.inbox-row__time {
  flex: none;
  margin-left: auto;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.inbox-row__subject {
  font-size: 13px;
  line-height: 18px;
}

.inbox-row__label :deep(.tx-tag) {
  padding-top: 2px;
  padding-bottom: 2px;
}

.inbox-row__snippet {
  flex: 1;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox-row.is-unread .inbox-row__sender {
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

.inbox-row.is-unread .inbox-row__subject {
  font-weight: 600;
}

.inbox-row.is-unread .inbox-row__time {
  color: var(--tx-bui-accent-ink, #0170dd);
}

.inbox-row__label,
.inbox-row__star {
  display: inline-flex;
  flex: none;
}

.inbox-row__star {
  margin: -4px -4px -4px 0;
}

.inbox-row__star :deep(.tx-icon-button) {
  color: var(--tx-text-color-placeholder, #a8abb2);
}

.inbox-row__star :deep(.tx-icon-button.is-pressed) {
  background: transparent;
  color: var(--tx-bui-orange, #ef720c);
}

.inbox-row__star :deep(.tx-icon-button__icon) {
  font-size: 14px;
}

.inbox-empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

/* Toast: hangs below the list header it reports into. */
.inbox-list__toast {
  position: absolute;
  z-index: 3;
  top: 0;
  right: 10px;
  left: 10px;
  pointer-events: none;
}

.inbox-list__toast.is-open {
  pointer-events: auto;
}

.inbox-toast {
  display: flex;
  align-items: center;
  gap: 10px;
}

.inbox-toast__icon {
  flex: none;
  color: var(--tx-bui-accent, #0285ff);
  font-size: 15px;
}

.inbox-toast__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.inbox-toast__title {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox-toast__body {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-toast__action,
.inbox-toast__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.inbox-toast__action {
  padding: 3px 8px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.inbox-toast__action:hover {
  background: var(--tx-bui-accent-tint, #e9f3ff);
}

.inbox-toast__close {
  width: 22px;
  height: 22px;
  color: var(--tx-text-color-secondary, #909399);
}

.inbox-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.inbox-toast__action:focus-visible,
.inbox-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Reader ----------------------------------------------------------------- */

.inbox-reader {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  background: var(--tx-bg-color, #fff);
}

.inbox-reader :deep(.tx-empty-state) {
  margin: auto;
}

.inbox-reader__head {
  display: flex;
  min-height: 44px;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 0 18px;
}

.inbox-reader__back {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  margin-left: -8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
}

.inbox-reader__back:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.inbox-reader__back:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.inbox-reader__subject {
  display: -webkit-box;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.inbox-reader__head :deep(.tx-message-actions__btn.is-on) {
  color: var(--tx-bui-orange, #ef720c);
}

.inbox-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.inbox-reader__from {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 10px 18px 12px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.inbox-reader__who {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.inbox-reader__line {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 6px;
}

.inbox-reader__name {
  flex: none;
  font-weight: 500;
  white-space: nowrap;
}

.inbox-reader__address {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-reader__meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox-reader__labels {
  display: flex;
  flex: none;
  gap: 4px;
}

.inbox-reader__scroll {
  min-height: 0;
  flex: 1;
  padding: 4px 18px 16px;
  overflow-y: auto;
}

/* The reading pane is dense UI, not a docs page: body copy at 13px. */
.inbox-reader__body :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.7;
}

.inbox-reader__body :deep(.markdown-body pre) {
  padding: 10px 12px;
}

.inbox-reader__body :deep(.markdown-body h2) {
  margin: 14px 0 6px;
  font-size: 14px;
}

.inbox-reader__body :deep(.markdown-body table) {
  margin: 10px 0;
  font-size: 12px;
}

.inbox-reader__body :deep(.markdown-body th),
.inbox-reader__body :deep(.markdown-body td) {
  padding: 6px 10px;
}

.inbox-reader__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.inbox-reader__section-title {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.inbox-thread {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.inbox-thread.is-mine {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 7%, var(--tx-bg-color, #fff));
}

.inbox-thread__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}

.inbox-thread__head span {
  color: var(--tx-text-color-secondary, #909399);
}

.inbox-thread__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.inbox-reader__spacer {
  flex: 1;
}

.inbox-reader__composer {
  flex: none;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--tx-border-color-extra-light, #f2f6fc);
}

.inbox-reader__file {
  display: none;
}

.inbox-reader__hint {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
}

.inbox-compose {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 18px;
}

.inbox-compose__field {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: 56px minmax(0, 1fr);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.inbox-nav__footer {
  padding: 10px 10px 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* Layout ----------------------------------------------------------------- */

@container template (max-width: 639px) {
  .inbox {
    padding: 12px;
  }

  .inbox__brand-text,
  .inbox__compose-label {
    display: none;
  }

  .inbox__search {
    max-width: none;
  }

  .inbox__head :deep(.tx-button) {
    min-width: 32px;
  }

  /* One pane at a time: the list fills the stage and the reader slides over
     it. Same DOM as the split view, so selection and drafts carry across. */
  .inbox__main :deep(.tx-splitter) {
    position: relative;
    display: block;
  }

  .inbox__main :deep(.tx-splitter__bar) {
    display: none;
  }

  .inbox__main :deep(.tx-splitter__pane--a) {
    height: 100%;
  }

  .inbox__main :deep(.tx-splitter__pane--b) {
    position: absolute;
    z-index: 4;
    inset: 0;
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 0.28s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
      visibility 0.28s;
  }

  .inbox.is-reading .inbox__main :deep(.tx-splitter__pane--b) {
    transform: none;
    visibility: visible;
  }

  .inbox-reader__head {
    padding-left: 12px;
  }

  .inbox-reader__from,
  .inbox-reader__scroll {
    padding-right: 12px;
    padding-left: 12px;
  }

  .inbox-reader__labels,
  .inbox-reader__address {
    display: none;
  }
}

@container template (min-width: 960px) {
  .inbox {
    column-gap: 14px;
    grid-template-areas:
      'nav head'
      'nav main';
    grid-template-columns: 216px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    padding: 16px 18px 18px 12px;
  }

  .inbox__nav {
    min-height: 0;
    overflow-y: auto;
    grid-area: nav;
  }

  .inbox__nav :deep(.tx-bui-sidebar-nav) {
    --tx-bui-sidebar-nav-width: 100%;

    min-height: 100%;
    box-sizing: border-box;
    background: transparent;
    box-shadow: none;
  }

  .inbox__brand {
    display: none;
  }

  .inbox__search {
    max-width: 380px;
    margin-left: 0;
  }

  .inbox__keys {
    margin-left: auto;
  }

  .inbox__main {
    margin-top: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .inbox__main :deep(.tx-splitter__pane--b) {
    transition: none;
  }
}
</style>
