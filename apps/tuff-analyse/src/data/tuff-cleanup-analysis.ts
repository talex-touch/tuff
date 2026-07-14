export type AnalysisStatus
  = | 'keep'
    | 'cleanup'
    | 'replace'
    | 'upgrade'
    | 'defer'
    | 'removeCandidate'
    | 'dangerConfirm'
    | 'monitor'

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type NeedLevel = 'required' | 'valuable' | 'optional' | 'questionable'
export type FrequencyLevel = 'high' | 'medium' | 'low' | 'unknown'
export type AnalysisArea
  = | 'CoreApp'
    | 'Nexus'
    | 'TuffEx'
    | 'Packages'
    | 'Plugins'
    | 'Dependencies'
    | 'Security'
    | 'Size'
    | 'Quality'
    | 'Migration'

export interface AnalysisItem {
  id: string
  area: AnalysisArea
  item: string
  status: AnalysisStatus
  risk: RiskLevel
  need: NeedLevel
  canCleanup: boolean
  outdated: boolean
  affectsUser: boolean
  affectsDependency: boolean
  requiresConfirmation: boolean
  currentUsage: string
  recommendation: string
  userValue: string
  frequency: FrequencyLevel
  migrationTarget: string
  benefit: string
  validation: string[]
  evidence: string[]
  risks: string[]
  actions: string[]
  alternatives: string[]
  trend: string
  timing: string
}

export interface UpgradeGroup {
  id: string
  phase: string
  title: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  packages: string[]
  target: string
  risk: RiskLevel
  strategy: string
  validation: string[]
}

export interface SecurityAlert {
  id: string
  source: 'pnpm audit' | 'GitHub Dependabot'
  packageName: string
  severity: RiskLevel
  scope: 'runtime' | 'development' | 'transitive' | 'unknown'
  state: 'open' | 'fixed' | 'auto_dismissed' | 'local'
  advisory: string
  cve?: string
  path: string
  impact: string
  recommendation: string
  priority: 'now' | 'next' | 'scheduled' | 'monitor'
  url?: string
}

export interface TrendNote {
  id: string
  title: string
  products: string[]
  observation: string
  tuffImplication: string
}

export const baseline = {
  version: '2.4.12-beta.8',
  node: '24.0.0',
  pnpm: '10.32.1',
  repoSize: '约 11G',
  generatedAt: '2026-06-20',
  sourceMode: '静态专家版，基于本轮只读审计、pnpm outdated、pnpm audit 与 GitHub Dependabot alerts。',
  majorRisks: [
    '当前工作区已有 AI Stable 文档与 indexing 代码/测试未提交改动，升级清理前必须隔离。',
    'pnpm dedupe --check 暴露 lockfile 可去重，以及 apps/core-app/node_modules 存在非 pnpm 安装残留。',
    '仓库体积主要来自 Electron packaged dist、runtime database、pnpm store、native target、wrangler/serena/playwright 输出。',
    'GitHub / pnpm audit 存在 critical/high vulnerability，需纳入依赖升级优先级。',
    'TypeScript 6、Vite 8、Vitest 4、Electron 42、LangChain 1.x 都属于单独大版本窗口，不能混入清理切片。',
  ],
}

export const statusLabels: Record<AnalysisStatus, string> = {
  keep: '需要保留',
  cleanup: '可以清理',
  replace: '过时替换',
  upgrade: '建议升级',
  defer: '暂缓处理',
  removeCandidate: '删除候选',
  dangerConfirm: '需确认',
  monitor: '继续观察',
}

export const riskLabels: Record<RiskLevel, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
}

export const needLabels: Record<NeedLevel, string> = {
  required: '必须',
  valuable: '有价值',
  optional: '可选',
  questionable: '待验证',
}

export const frequencyLabels: Record<FrequencyLevel, string> = {
  high: '高频',
  medium: '中频',
  low: '低频',
  unknown: '未知',
}

export const analysisItems: AnalysisItem[] = [
  {
    id: 'coreapp-main-product',
    area: 'CoreApp',
    item: 'CoreApp 桌面主产品',
    status: 'keep',
    risk: 'critical',
    need: 'required',
    canCleanup: false,
    outdated: false,
    affectsUser: true,
    affectsDependency: false,
    requiresConfirmation: false,
    currentUsage: 'Electron + Vue 桌面主入口，承载 CoreBox、插件运行时、本地存储、AI、QuickOps、Search / Indexing。',
    recommendation: '保留并作为所有清理工作的边界中心，任何改动必须走 focused tests 与 CoreApp typecheck。',
    userValue: '这是 Tuff 的核心用户价值载体，不存在下线空间。',
    frequency: 'high',
    migrationTarget: '不迁移；只拆分 legacy UI 和 runtime 边界。',
    benefit: '保持产品稳定，同时把清理限制在低风险产物、旧 UI 和依赖层。',
    validation: ['pnpm -C "apps/core-app" run typecheck', 'pnpm -C "apps/core-app" run build:vite', 'git diff --check'],
    evidence: [
      'apps/core-app/AGENTS.md 明确 CoreApp 范围和 typed transport / secure-store / SQLite SoT 规则。',
      'package.json 当前 root/CoreApp 版本为 2.4.12-beta.8。',
      'Roadmap vNext R2/R3/R4/R5/R6 均依赖 CoreApp。',
    ],
    risks: [
      '误删主进程、preload、secure-store 或 plugin runtime 会直接破坏桌面可用性。',
      'Electron/native 依赖升级可能影响安装包、签名、自动更新和平台能力。',
    ],
    actions: [
      '把清理对象限定为产物、缓存、旧 UI、重复入口和可替代依赖。',
      '每个功能切片只跑最近路径验证，不修无关失败。',
    ],
    alternatives: ['无合理替代；Nexus 不是桌面主产品替代品。'],
    trend: 'Raycast、Alfred、PowerToys 都把桌面 command center 保持为核心壳，插件和工具能力围绕主入口生长。',
    timing: '持续保留；清理时作为最高保护对象。',
  },
  {
    id: 'coreapp-artifacts',
    area: 'Size',
    item: 'CoreApp dist/out/.dev-electron/source map/runtime database backup',
    status: 'dangerConfirm',
    risk: 'high',
    need: 'optional',
    canCleanup: true,
    outdated: false,
    affectsUser: false,
    affectsDependency: false,
    requiresConfirmation: true,
    currentUsage: '本地构建产物、Electron 预览 runtime、packaged app、source map、运行时数据库和历史备份占用大量空间。',
    recommendation: '确认后批量清理本地产物与备份；保留源码资产、build 配置和必要 icon / plist / installer 脚本。',
    userValue: '对最终用户无直接价值，主要是开发与调试残留。',
    frequency: 'low',
    migrationTarget: '迁移到可复跑清理脚本，默认 dry-run，删除前列出大小和路径。',
    benefit: '预计可显著降低本地工作区体积，减少搜索、备份和 IDE 索引压力。',
    validation: ['du -sh apps/core-app/*', 'pnpm -C "apps/core-app" run build:vite', 'git status --short'],
    evidence: [
      'du 显示 apps/core-app 约 4.0G。',
      '大文件包括 apps/core-app/dist/tuff.app.zip、dist/mac-arm64/tuff.app、database.db.bak、database.db、out/*.map。',
      '.gitignore 已覆盖 apps/core-app/tuff、.dev-electron、out、dist 等路径。',
    ],
    risks: [
      'runtime database 可能包含本地调试数据，删除前必须确认不需要保留。',
      'packaged artifact 删除后需要重新构建才能做 packaged evidence。',
    ],
    actions: [
      '先实现 report-only 清单，列出路径、大小、是否 git tracked。',
      '删除动作必须单独确认。',
      '清理后跑最小 build 验证可复现。',
    ],
    alternatives: [
      '将大型 runtime database 移到 workspace 外的 userData 模拟目录。',
      '只清理 zip、source map 和 .dev-electron，保留数据库备份。',
    ],
    trend: 'Electron 项目通常把 packaged artifact 与 runtime userData 严格排除在仓库之外，CI 产物进入 release storage 而不是工作区。',
    timing: 'U2 体积清理第一轮；必须确认后执行。',
  },
  {
    id: 'coreapp-terminal-xterm',
    area: 'Dependencies',
    item: 'xterm / xterm-addon-fit 终端组件',
    status: 'replace',
    risk: 'medium',
    need: 'valuable',
    canCleanup: false,
    outdated: true,
    affectsUser: true,
    affectsDependency: true,
    requiresConfirmation: false,
    currentUsage: 'CoreApp InteractiveTerminal / LogTerminal 和 touch-music 依赖旧 xterm 包。',
    recommendation: '迁移到 @xterm/xterm 与 @xterm/addon-fit，或封装 TuffEx Terminal facade 后按需加载。',
    userValue: '终端和日志输出对高级用户有价值，但不是所有用户都需要完整交互终端。',
    frequency: 'medium',
    migrationTarget: '@xterm/xterm + @xterm/addon-fit；长期进入 TuffEx terminal facade。',
    benefit: '移除 deprecated 告警，降低维护风险，并可通过懒加载减少主 bundle 压力。',
    validation: [
      'rg -n "from [\\\'\\\"]xterm|xterm-addon-fit" apps packages plugins',
      'pnpm -C "apps/core-app" run typecheck:web',
      'pnpm -C "plugins/touch-music" run build',
    ],
    evidence: [
      'pnpm outdated 标记 xterm 与 xterm-addon-fit deprecated。',
      '源码引用位于 apps/core-app/src/renderer/src/components/terminal 和 plugins/touch-music/package.json。',
    ],
    risks: [
      '终端 CSS 包名和 theme API 可能变化。',
      '触发 packaged renderer bundle 行为变化，需要 UI smoke。',
    ],
    actions: [
      '先建 Terminal facade，保持现有 props/事件不变。',
      '替换包名与 import。',
      '确认 touch-music 是否真的使用终端；未使用则删除插件侧依赖。',
    ],
    alternatives: ['如果交互终端低频，可降级为 readonly log viewer。'],
    trend: '桌面效率工具更偏 command runner + task logs；完整终端应按需加载，避免默认成本。',
    timing: 'U3 第二批过时替换。',
  },
  {
    id: 'nexus-main',
    area: 'Nexus',
    item: 'Nexus 文档 / 生态 / Governance / Release metadata',
    status: 'keep',
    risk: 'high',
    need: 'required',
    canCleanup: false,
    outdated: false,
    affectsUser: true,
    affectsDependency: false,
    requiresConfirmation: false,
    currentUsage: 'Nuxt 公开站、文档、Provider Registry、Data Governance、release metadata、插件生态入口。',
    recommendation: '保留，清理只针对 dev cache、构建产物和可替代 UI 依赖；生产 deploy / D1 / R2 操作单独确认。',
    userValue: '承担对外可信度、生态入口和治理证据。',
    frequency: 'high',
    migrationTarget: '不迁移；继续对齐 Roadmap R1/R7。',
    benefit: '稳定 release metadata 和治理证据，避免公共站能力回退。',
    validation: ['pnpm -C "apps/nexus" run typecheck', 'pnpm -C "apps/nexus" run build', 'pnpm -C "apps/nexus" run check:api-routes'],
    evidence: [
      'apps/nexus/AGENTS.md 定义 Nexus 范围和 Cloudflare/D1/R2 高风险规则。',
      'Roadmap R1 / R7 均依赖 Nexus。',
    ],
    risks: [
      'Nuxt / Cloudflare 依赖升级会影响 SSR、Nitro、worker bundle。',
      'Governance evidence 不能用 local-only 冒充 production。',
    ],
    actions: [
      '先做 Nuxt / Cloudflare patch-minor 安全升级。',
      '清理 .nuxt/.output/.wrangler/tmp 与本地 D1/R2 dev state 前列出路径。',
    ],
    alternatives: ['无；Nexus 不能由静态文档替代，因为还承载 API 与治理证据。'],
    trend: '现代开源/商业桌面工具都把 docs、registry、release trust 和 admin governance 放到独立 web surface。',
    timing: 'U1/U2 后进入 patch-minor 升级。',
  },
  {
    id: 'nexus-fighting-design',
    area: 'Dependencies',
    item: 'fighting-design',
    status: 'replace',
    risk: 'medium',
    need: 'questionable',
    canCleanup: true,
    outdated: true,
    affectsUser: true,
    affectsDependency: true,
    requiresConfirmation: false,
    currentUsage: '当前搜索显示主要在 Nexus vp-search 中引用 FMessage，属于单点 UI 依赖。',
    recommendation: '替换为 TuffEx toast / status / local message facade，移除 fighting-design catalog 依赖。',
    userValue: '单个 message 组件价值低，不值得保留整套外部 UI 栈。',
    frequency: 'low',
    migrationTarget: 'TuffEx Toast / StatusBadge / 本地 message helper。',
    benefit: '减少 UI 体系分裂和 bundle/维护成本。',
    validation: ['rg -n "fighting-design|FMessage" apps/nexus', 'pnpm -C "apps/nexus" run typecheck', 'pnpm -C "apps/nexus" run build'],
    evidence: [
      'apps/nexus/package.json 声明 fighting-design。',
      'rg 只发现 apps/nexus/app/components/theme/components/vp-search.vue 引用 FMessage。',
    ],
    risks: ['替换后需要确认搜索错误提示、主题提示和 SSR 行为不变。'],
    actions: [
      '封装本地 message helper。',
      '替换 vp-search 调用。',
      '删除依赖并更新 lockfile。',
    ],
    alternatives: ['如果后续发现多处隐式使用，则先保留并收敛到 facade。'],
    trend: '成熟产品会减少多 UI kit 混用，保持设计系统一致。',
    timing: 'U3 依赖清理小切片。',
  },
  {
    id: 'tuffex-registry',
    area: 'TuffEx',
    item: 'TuffEx components registry',
    status: 'upgrade',
    risk: 'medium',
    need: 'valuable',
    canCleanup: false,
    outdated: true,
    affectsUser: false,
    affectsDependency: false,
    requiresConfirmation: false,
    currentUsage: 'TuffEx 实际组件丰富，但 packages/tuffex/components.json 只登记 button、avatar、form。',
    recommendation: '扩展 components.json 为真实 registry，服务 Nexus docs 与 tuff-analyse 可复用组件发现。',
    userValue: '间接提升开发体验、文档一致性和组件复用。',
    frequency: 'medium',
    migrationTarget: '生成式组件 registry，包含名称、分类、样式入口、demo、可用状态。',
    benefit: '减少手写组件目录漂移，支撑 shadcn 风格的可复用组件浏览。',
    validation: ['pnpm -C "packages/tuffex" run audit:exports', 'pnpm -C "packages/tuffex" run typecheck'],
    evidence: [
      'packages/tuffex/packages/components/src 下存在 DataTable、Drawer、Dialog、Tabs、CommandPalette、Badge 等大量组件。',
      'components.json 当前仅 3 个组件。',
    ],
    risks: [
      '直接手填 registry 容易漂移。',
      '组件导出和 style.css 入口需要和 build 产物一致。',
    ],
    actions: [
      '先让 tuff-analyse 使用少量 TuffEx 基础样式，不阻塞 registry。',
      '后续增加 registry 生成脚本。',
    ],
    alternatives: ['继续让 Nexus demo-registry 作为 docs 私有来源，但复用性较差。'],
    trend: 'shadcn、Radix、Nuxt UI 都强调 registry/recipe 化组件资产，便于跨项目复用。',
    timing: 'U4/U6，作为开发体验优化。',
  },
  {
    id: 'plugin-quickops-consolidation',
    area: 'Migration',
    item: 'QuickOps 与零散系统动作插件合并',
    status: 'monitor',
    risk: 'high',
    need: 'valuable',
    canCleanup: false,
    outdated: false,
    affectsUser: true,
    affectsDependency: false,
    requiresConfirmation: false,
    currentUsage: 'QuickOps official plugin 已承接大量本地工具；touch-quick-actions、touch-system-actions、touch-dev-utils 等存在功能重叠。',
    recommendation: '建立 capability matrix，把只读/确认型/高风险/网络 opt-in 工具统一到 QuickOps 或 QuickOps capability registry。',
    userValue: '用户只需要一个可靠命令入口，不需要记住多个重复插件。',
    frequency: 'high',
    migrationTarget: 'plugins/touch-quickops + CoreApp QuickOps typed host facade。',
    benefit: '减少重复入口，统一权限、确认、审计和 degraded reason。',
    validation: ['pnpm plugins:validate', 'pnpm -C "apps/core-app" exec vitest run "src/main/modules/quick-ops/**/*.test.ts"'],
    evidence: [
      'TODO 中记录 QuickOps 已覆盖 sessions、system info、diagnostics、disk/network/battery/proxy/public-ip/dns/file 等能力。',
      'plugins 中存在多个系统动作 / dev tools / text tools 小插件。',
    ],
    risks: [
      '误迁移高风险 shell 动作可能绕过 permission gate。',
      '用户已有插件入口习惯，不能无提示删除。',
    ],
    actions: [
      '先做只读矩阵，不删除插件。',
      '对重复能力增加 deprecation badge 和迁移建议。',
      '确认 telemetry/evidence 后再隐藏低频入口。',
    ],
    alternatives: ['保留插件，但统一 root results 命名和 permission reason。'],
    trend: 'Raycast、Alfred、PowerToys 都把工具能力聚合到 command palette，并通过 extension permission 控制风险。',
    timing: 'U4 功能清理专项，不能和依赖升级混做。',
  },
  {
    id: 'plugin-snippets-consolidation',
    area: 'Migration',
    item: 'Snippets 插件族统一',
    status: 'removeCandidate',
    risk: 'medium',
    need: 'valuable',
    canCleanup: true,
    outdated: false,
    affectsUser: true,
    affectsDependency: false,
    requiresConfirmation: false,
    currentUsage: 'touch-snippets、touch-code-snippets、touch-text-snippets 分散承担文本片段和代码片段能力。',
    recommendation: '合并为统一 snippets 插件，按语言、标签、触发词、最近使用排序。',
    userValue: '文本片段本身是高频能力，但多个碎片插件降低发现性。',
    frequency: 'medium',
    migrationTarget: 'plugins/touch-snippets 作为唯一 runtime，其他插件进入兼容 alias 或 catalog deprecation。',
    benefit: '减少插件数量和重复配置，提升搜索/管理体验。',
    validation: ['pnpm plugins:validate', 'pnpm -C "packages/test" run test'],
    evidence: [
      'plugins 目录存在 touch-snippets、touch-code-snippets、touch-text-snippets。',
      'packages/test 包含 snippets 相关测试。',
    ],
    risks: [
      '用户已有 snippet 数据格式不能丢。',
      '需要迁移 manifest aliases 和 search providers。',
    ],
    actions: [
      '先设计数据格式兼容层。',
      '保留旧插件 manifest 作为 alias 一段时间。',
      '写迁移说明和回滚策略。',
    ],
    alternatives: ['保留多插件，但在 store 中归为 Snippets family。'],
    trend: 'Raycast Snippets、TextExpander 都是统一库，不拆成多个入口。',
    timing: 'U4 中后段，等 QuickOps 矩阵后处理。',
  },
  {
    id: 'dependency-patch-minor-wave',
    area: 'Dependencies',
    item: 'Patch/minor 安全升级批次',
    status: 'upgrade',
    risk: 'medium',
    need: 'required',
    canCleanup: false,
    outdated: true,
    affectsUser: false,
    affectsDependency: true,
    requiresConfirmation: false,
    currentUsage: 'Vue、Nuxt、UnoCSS、Vue TSC、Sentry、DOMPurify、Wrangler、CodeMirror 等存在 patch/minor 更新。',
    recommendation: '先升级 patch/minor，配合 pnpm dedupe，解决安全和重复版本问题。',
    userValue: '间接提升安全性、构建稳定性和维护成本。',
    frequency: 'high',
    migrationTarget: 'pnpm catalog / overrides / package manifests 统一版本。',
    benefit: '降低 vulnerability 数量，减少 peer warning 和重复依赖。',
    validation: ['pnpm install --frozen-lockfile', 'pnpm dedupe --check', 'pnpm typecheck:all', 'pnpm test:targeted'],
    evidence: [
      'pnpm outdated 显示 Vue 3.5.33 -> 3.5.38、Nuxt 4.4.2 -> 4.4.8、UnoCSS 66.6.8 -> 66.7.2。',
      'pnpm audit 显示 DOMPurify <=3.4.10 有 moderate vulnerability，建议 >=3.4.11。',
    ],
    risks: [
      'Nuxt / Sentry / Rollup peer 组合可能改变 lockfile。',
      'pnpm dedupe 会重写 lockfile，需要独立切片。',
    ],
    actions: [
      '先按安全优先级处理 DOMPurify、undici、hono、nuxt、axios、vite/vitest。',
      '再做 UI/build patch-minor。',
      '所有 lockfile 变更单独审查。',
    ],
    alternatives: ['仅加 pnpm overrides 修安全包，但长期 catalog 会继续漂移。'],
    trend: '现代 monorepo 趋向用 catalog/constraints 统一依赖节奏，把安全修复和大版本迁移分开。',
    timing: 'U1 第一批。',
  },
  {
    id: 'dependency-major-wave',
    area: 'Dependencies',
    item: 'TypeScript 6 / Vite 8 / Vitest 4 / Electron 42 / LangChain 1.x',
    status: 'defer',
    risk: 'high',
    need: 'valuable',
    canCleanup: false,
    outdated: true,
    affectsUser: true,
    affectsDependency: true,
    requiresConfirmation: false,
    currentUsage: '核心工具链和 AI runtime 大版本均有新版本，但当前 AI Stable 和 release integrity 窗口不适合混入。',
    recommendation: '暂缓；每个大版本单独 PRD/切片，先完成 patch/minor 和安全修复。',
    userValue: '长期必要，但短期可能干扰稳定化。',
    frequency: 'medium',
    migrationTarget: '独立升级分支和兼容矩阵。',
    benefit: '避免把类型系统、打包器、测试运行器、Electron、AI SDK 变化互相叠加。',
    validation: ['pnpm quality:release', 'CoreApp packaged smoke', 'Nexus build', 'AI focused evidence'],
    evidence: [
      'pnpm outdated 显示 TypeScript 5.9.3 -> 6.0.3、Vite 7.3.2 -> 8.0.16、Vitest 3.2.4 -> 4.1.9、Electron 41.3.0 -> 42.4.1。',
      'LangChain core/langgraph/openai/anthropic 均存在 1.x 大版本。',
    ],
    risks: [
      'TypeScript 6 可能触发大量类型错误。',
      'Vite/Vitest 大版本会影响 test config、ESM、coverage 和 plugin 行为。',
      'Electron 大版本影响 native modules、packaging、security defaults。',
      'LangChain 1.x 可能影响 provider routing 和 AI evidence。',
    ],
    actions: [
      '建立大版本风险矩阵。',
      '每次只升级一个生态群。',
      '升级前冻结 baseline，升级后补迁移文档。',
    ],
    alternatives: ['只用 overrides 修 transitive vulnerability，不碰 direct major。'],
    trend: '大型桌面 monorepo 通常把 build/test/runtime/AI SDK 大版本拆成独立迁移窗口。',
    timing: 'U5 大版本升级窗口。',
  },
  {
    id: 'security-pnpm-audit',
    area: 'Security',
    item: 'pnpm audit vulnerability backlog',
    status: 'upgrade',
    risk: 'critical',
    need: 'required',
    canCleanup: false,
    outdated: true,
    affectsUser: true,
    affectsDependency: true,
    requiresConfirmation: false,
    currentUsage: '本地 pnpm audit 对 pnpm-lock.yaml 依赖树发现 101 个 vulnerability。',
    recommendation: '建立安全修复优先级：critical/high runtime 先处理，development-only 进入工具链升级批次。',
    userValue: '直接影响产品可信度、GitHub security posture 和 release 风险。',
    frequency: 'high',
    migrationTarget: 'pnpm overrides + direct dependency patch/minor + 大版本计划。',
    benefit: '降低 GitHub Dependabot open alerts 和 release 安全风险。',
    validation: ['pnpm audit --json', 'gh api repos/{owner}/{repo}/dependabot/alerts --paginate', 'pnpm quality:pr'],
    evidence: [
      'pnpm audit metadata: critical 2, high 26, moderate 53, low 20。',
      'GitHub Dependabot alerts 可读取，近期 open alerts 包含 undici、dompurify、nuxt、hono、axios、vite、vitest、shell-quote。',
    ],
    risks: [
      '部分漏洞在 transitive 依赖中，直接升级上游可能触发大版本。',
      'runtime 和 development scope 需要区分，避免把 dev-only 漏洞误判为用户风险。',
    ],
    actions: [
      '先处理 critical: shell-quote、vitest。',
      '再处理 high runtime: undici、axios、ws、tmp、js-cookie、devalue、langsmith、hono/nuxt 高危。',
      'DOMPurify 立即 patch 到 >=3.4.11。',
      '记录无法直接修复的 transitive 依赖来源。',
    ],
    alternatives: ['短期用 overrides，长期推动 direct packages 升级。'],
    trend: 'GitHub Advanced Security / Dependabot 已成为 release hygiene 的常态门禁，不能只在发布前临时清。',
    timing: '插入 U1，优先级高于普通体积清理。',
  },
]

export const upgradeGroups: UpgradeGroup[] = [
  {
    id: 'security-hotfix',
    phase: 'U1-Security',
    title: '安全热修批次',
    priority: 'P0',
    packages: ['dompurify', 'undici', 'hono', 'axios', 'vitest', 'shell-quote', 'ws', 'tmp', 'js-cookie'],
    target: '优先满足 patched versions，必要时使用 pnpm overrides。',
    risk: 'critical',
    strategy: '先 runtime critical/high，再 development critical/high；每次锁文件变更单独审查。',
    validation: ['pnpm audit --json', 'pnpm test:targeted', 'pnpm quality:pr'],
  },
  {
    id: 'patch-minor-ui-build',
    phase: 'U1-PatchMinor',
    title: 'UI / build patch-minor',
    priority: 'P1',
    packages: ['vue', 'nuxt', '@vitejs/plugin-vue', 'unocss', 'vue-tsc', '@vueuse/core', '@sentry/electron', '@sentry/nuxt', 'wrangler'],
    target: '在当前大版本内升级到 latest wanted/patch-minor。',
    risk: 'medium',
    strategy: '通过 catalog 统一版本，避免各包直接散写。',
    validation: ['pnpm typecheck:all', 'pnpm nexus:build', 'pnpm -C "apps/core-app" run typecheck'],
  },
  {
    id: 'deprecated-replacement',
    phase: 'U3-Replace',
    title: '弃用依赖替换',
    priority: 'P1',
    packages: ['xterm', 'xterm-addon-fit', 'unplugin-vue-router', '@types/glob', 'fighting-design'],
    target: '@xterm/*、TuffEx/local facade、删除或升级 typed router、移除单点外部 UI 依赖。',
    risk: 'medium',
    strategy: '先确认源码引用，再替换；正在使用的功能不直接删除。',
    validation: ['rg', 'pnpm plugins:validate', 'CoreApp/Nexus focused build'],
  },
  {
    id: 'major-migrations',
    phase: 'U5-Major',
    title: '大版本迁移窗口',
    priority: 'P3',
    packages: ['typescript', 'vite', 'vitest', 'electron', 'electron-vite', '@langchain/core', '@langchain/langgraph', '@sidebase/nuxt-auth'],
    target: '单生态独立切片，不混功能清理。',
    risk: 'high',
    strategy: '建立兼容矩阵与回滚点，先跑最小 reproducer，再进全量门禁。',
    validation: ['pnpm quality:release', 'packaged Electron smoke', 'AI evidence', 'Nexus production-like build'],
  },
]

export const securityAlerts: SecurityAlert[] = [
  {
    id: 'audit-summary',
    source: 'pnpm audit',
    packageName: 'all',
    severity: 'critical',
    scope: 'unknown',
    state: 'local',
    advisory: 'pnpm audit metadata',
    path: 'pnpm-lock.yaml',
    impact: '本地依赖树共有 101 个 vulnerability：critical 2、high 26、moderate 53、low 20。',
    recommendation: '将安全修复并入 U1，优先 critical/high runtime，development critical 也需处理。',
    priority: 'now',
  },
  {
    id: 'gh-shell-quote',
    source: 'GitHub Dependabot',
    packageName: 'shell-quote',
    severity: 'critical',
    scope: 'runtime',
    state: 'open',
    advisory: 'GHSA-w7jw-789q-3m8p',
    cve: 'CVE-2026-9277',
    path: 'pnpm-lock.yaml',
    impact: '命令解析相关 critical 告警；对桌面工具和插件 shell 能力尤其敏感。',
    recommendation: '优先定位依赖路径，升级直接依赖或使用 overrides；同时确认插件 shell 执行均走 permission gate 与 safe-shell。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/920',
  },
  {
    id: 'gh-vitest-critical',
    source: 'GitHub Dependabot',
    packageName: 'vitest',
    severity: 'critical',
    scope: 'development',
    state: 'open',
    advisory: 'GHSA-5xrq-8626-4rwp',
    cve: 'CVE-2026-47429',
    path: 'pnpm-lock.yaml',
    impact: '开发测试运行器 critical；不直接影响用户 runtime，但会影响 CI/本地执行安全。',
    recommendation: '优先评估 Vitest 3 可修版本；若必须升 Vitest 4，则独立 test-stack 迁移。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/919',
  },
  {
    id: 'gh-undici',
    source: 'GitHub Dependabot',
    packageName: 'undici',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: '多个 GHSA：SOCKS5 cross-origin、WebSocket DoS、Set-Cookie/header/cookie 解析问题',
    cve: 'CVE-2026-6734 / CVE-2026-12151 / CVE-2026-9679',
    path: 'pnpm-lock.yaml',
    impact: '通过 wrangler/miniflare 等链路进入 Nexus/Cloudflare dev/runtime 依赖；涉及请求路由、WebSocket DoS 和 header 注入。',
    recommendation: '升级到 undici patched line：7.28.0+ 或对应 6.27.0/8.x；优先通过 wrangler/miniflare patch-minor 或 overrides。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/952',
  },
  {
    id: 'gh-dompurify',
    source: 'GitHub Dependabot',
    packageName: 'dompurify',
    severity: 'medium',
    scope: 'runtime',
    state: 'open',
    advisory: 'GHSA-cmwh-pvxp-8882',
    path: 'pnpm-lock.yaml',
    impact: 'HTML sanitizer 状态污染风险；TuffEx/Nexus/CoreApp 均有 Markdown/HTML render 相关路径，需优先修。',
    recommendation: '升级 dompurify 到 >=3.4.11，复跑 Markdown sanitizer focused tests。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/950',
  },
  {
    id: 'gh-hono',
    source: 'GitHub Dependabot',
    packageName: 'hono',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: '多个 GHSA：JWT NumericDate、cache vary、CSS injection、routing 等',
    cve: 'CVE-2026-54290 / CVE-2026-44457 / CVE-2026-44459',
    path: 'pnpm-lock.yaml',
    impact: '通过 @modelcontextprotocol/sdk 等 transitive 进入 CoreApp；若启用 HTTP/JWT/cache 相关 server paths，需要修复。',
    recommendation: '优先升级 @modelcontextprotocol/sdk 或 override hono 到 patched version；确认未使用 vulnerable middleware 可作为风险说明但不应长期保留。',
    priority: 'next',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/946',
  },
  {
    id: 'gh-nuxt',
    source: 'GitHub Dependabot',
    packageName: 'nuxt',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: '多个 Nuxt GHSA',
    cve: 'CVE-2026-53721 / CVE-2026-53722',
    path: 'pnpm-lock.yaml',
    impact: 'Nexus SSR/worker/public docs runtime 相关；属于对外站点高优先级。',
    recommendation: '先升 Nuxt 4.4.x patch 到可修版本，复跑 Nexus typecheck/build/worker bundle check。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/941',
  },
  {
    id: 'gh-axios',
    source: 'GitHub Dependabot',
    packageName: 'axios',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: '多个 Axios GHSA',
    cve: 'CVE-2026-44486 / CVE-2026-44487 / CVE-2026-44488 / CVE-2026-44496',
    path: 'pnpm-lock.yaml',
    impact: '主要来自 touch-music 等插件网络请求路径；runtime 网络能力必须修。',
    recommendation: '升级 axios 到 patched version；若插件网络能力低价值，考虑迁移到统一 SDK network guard。',
    priority: 'now',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/918',
  },
  {
    id: 'gh-vite',
    source: 'GitHub Dependabot',
    packageName: 'vite',
    severity: 'high',
    scope: 'development',
    state: 'open',
    advisory: 'GHSA-fx2h-pf6j-xcff',
    cve: 'CVE-2026-53571',
    path: 'pnpm-lock.yaml',
    impact: '开发服务器安全风险；本地开发和 CI preview 风险高于 packaged 用户 runtime。',
    recommendation: '先确认 Vite 7 patched 版本是否覆盖；若需要 Vite 8，拆成 U5 大版本迁移。',
    priority: 'next',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/926',
  },
  {
    id: 'gh-form-data',
    source: 'GitHub Dependabot',
    packageName: 'form-data',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: 'GHSA-hmw2-7cc7-3qxx',
    cve: 'CVE-2026-12143',
    path: 'pnpm-lock.yaml',
    impact: 'HTTP multipart/form data transitive 风险；影响上传、API client 或 tooling 链路。',
    recommendation: '定位依赖路径并升级上游，必要时 override。',
    priority: 'next',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/930',
  },
  {
    id: 'gh-devalue-langsmith',
    source: 'GitHub Dependabot',
    packageName: 'devalue / langsmith',
    severity: 'high',
    scope: 'runtime',
    state: 'open',
    advisory: 'GHSA-77vg-94rm-hx3p / GHSA-3644-q5cj-c5c7',
    cve: 'CVE-2026-42570 / CVE-2026-45134',
    path: 'pnpm-lock.yaml',
    impact: 'Nuxt serialization 与 AI/observability transitive 风险，需跟随 Nexus/AI 依赖批次修。',
    recommendation: 'devalue 通过 Nuxt patch，langsmith 通过 LangChain/AI 依赖 patch 或 override。',
    priority: 'next',
    url: 'https://github.com/talex-touch/tuff/security/dependabot/887',
  },
]

export const trends: TrendNote[] = [
  {
    id: 'command-center',
    title: '命令中心聚合',
    products: ['Raycast', 'Alfred', 'PowerToys'],
    observation: '高频工具不再散落成多个入口，而是通过 command palette、extension permission、recent usage 聚合。',
    tuffImplication: 'QuickOps、PreviewSDK、系统动作、开发者工具应进入统一能力矩阵，保留插件扩展性但减少重复 surface。',
  },
  {
    id: 'local-first-security',
    title: 'Local-first 安全边界',
    products: ['Raycast', 'Arc', 'Obsidian', '1Password'],
    observation: '隐私数据源默认显式授权，本地索引可解释，secret 与 sync payload 严格分层。',
    tuffImplication: 'Browser data、File indexing、plugin secrets、sync payload 继续按 fail-closed、SQLite SoT、secure-store、degraded reason 收敛。',
  },
  {
    id: 'component-registry',
    title: '组件 registry 化',
    products: ['shadcn/ui', 'Nuxt UI', 'Radix Themes'],
    observation: '组件库不仅提供包，还提供可复制 recipe、registry metadata、文档 demo 与按需样式入口。',
    tuffImplication: 'TuffEx 应补全 components.json 和导出审计，让 tuff-analyse、Nexus docs、CoreApp 共用组件元数据。',
  },
  {
    id: 'security-continuous',
    title: '安全告警持续治理',
    products: ['GitHub Advanced Security', 'Snyk', 'Socket'],
    observation: '安全债不再发布前一次性处理，而是和 lockfile hygiene、catalog、CI gate 联动。',
    tuffImplication: 'tuff-analyse 后续应接半自动扫描，把 Dependabot open alerts、pnpm audit、runtime/dev scope 做成固定看板。',
  },
]
