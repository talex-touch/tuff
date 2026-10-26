/*
 * The gallery's specimen data and the text its TuffEx components take as props,
 * in both page languages.
 *
 * TuffEx has no i18n of its own: every phrase a component renders or announces
 * is a prop with an English default, so a specimen that passes nothing speaks
 * English on the zh pages. An `en` entry left empty keeps the component's own
 * English. Entries are checked against the props each component really declares
 * (its exported `XxxProps` interface can lag behind: RatingProps has no
 * `starLabel`), so a misspelt name fails the type check instead of falling
 * through as an attribute nothing reads.
 */
import type { TxAgentTrace } from '@tuffex-components/agent-trace'
import type { TxAgentsList } from '@tuffex-components/agents'
import type { TxAllocationBar } from '@tuffex-components/allocation-bar'
import type { TxApprovalCard } from '@tuffex-components/approval-card'
import type { TxBreadcrumb } from '@tuffex-components/breadcrumb'
import type { TxCascader } from '@tuffex-components/cascader'
import type { TxChainOfThought } from '@tuffex-components/chain-of-thought'
import type { TxChatComposer } from '@tuffex-components/chat'
import type { TxCodeStream } from '@tuffex-components/code-stream'
import type { TxContextIndicator } from '@tuffex-components/context-indicator'
import type { DataTableProps } from '@tuffex-components/data-table'
import type { TxDatePicker } from '@tuffex-components/date-picker'
import type { DiffTableProps } from '@tuffex-components/diff-table'
import type { TxFileUploader } from '@tuffex-components/file-uploader'
import type { TxFilterChips } from '@tuffex-components/filter-chips'
import type { TxImageUploader } from '@tuffex-components/image-uploader'
import type { TxInsightCards } from '@tuffex-components/insight-cards'
import type { TxMessageActions } from '@tuffex-components/message-actions'
import type { TxNavBar } from '@tuffex-components/nav-bar'
import type { TxNumberInput } from '@tuffex-components/number-input'
import type { TxPagination } from '@tuffex-components/pagination'
import type { TxPicker } from '@tuffex-components/picker'
import type { TxPromptBar } from '@tuffex-components/prompt-bar'
import type { TxRating } from '@tuffex-components/rating'
import type { TxReasoningDisclosure } from '@tuffex-components/reasoning-disclosure'
import type { RecommendationOption, TxRecommendationCard } from '@tuffex-components/recommendation-card'
import type { TxSearchPanel } from '@tuffex-components/search-panel'
import type { TxSearchSelect } from '@tuffex-components/search-select'
import type { TxSelect } from '@tuffex-components/select'
import type { TxSensitiveInput } from '@tuffex-components/sensitive-input'
import type { TxSidebarNav } from '@tuffex-components/sidebar-nav'
import type { SortableListProps } from '@tuffex-components/sortable-list'
import type { TxSources } from '@tuffex-components/sources'
import type { TxSpinner } from '@tuffex-components/spinner'
import type { TxTag } from '@tuffex-components/tag'
import type { TxTaskRows } from '@tuffex-components/task-rows'
import type { TxToolCallCard } from '@tuffex-components/tool-call-card'
import type { TxToolConfirmation } from '@tuffex-components/tool-confirmation'
import type { TxTransfer } from '@tuffex-components/transfer'
import type { TxTree } from '@tuffex-components/tree'
import type { TxTreeSelect } from '@tuffex-components/tree-select'
import type { TxVersionCapsule } from '@tuffex-components/version-capsule'

/** The props a component declares, read off the component itself. */
type PropsOf<C> = C extends abstract new (...args: never[]) => { $props: infer P } ? Partial<P> : never

/** Names a sortable row by its plugin, so the live region never reads out a raw id. */
function pluginLabel(names: Record<string, string>) {
  return (item: { id: string }) => names[item.id] ?? item.id
}

const zhPlugins = {
  clipboard: '剪贴板',
  browser: '浏览器',
  actions: '快捷操作',
  windows: '窗口预设',
  scripts: '工作区脚本',
  system: '系统操作',
  intelligence: '智能问答',
}

const enPlugins = {
  clipboard: 'Clipboard',
  browser: 'Browser',
  actions: 'Quick actions',
  windows: 'Window presets',
  scripts: 'Workspace scripts',
  system: 'System actions',
  intelligence: 'Intelligence',
}

const zh = {
  plugins: zhPlugins,
  copyCommand: (command: string) => `复制：${command}`,

  /* ── Base suite ── */
  switches: { sync: '自动同步', compact: '紧凑模式', backup: '云端备份' },
  progress: { download: '下载进度', installed: '安装完成', failed: '同步失败', share: '各通道用户占比', loading: '加载中' },
  rating: { starLabel: (star: number) => `评 ${star} 星` } satisfies PropsOf<typeof TxRating>,
  tag: { closeAriaLabel: '移除标签' } satisfies PropsOf<typeof TxTag>,
  pagination: { ariaLabel: '分页', prevLabel: '上一页', nextLabel: '下一页' } satisfies PropsOf<typeof TxPagination>,
  select: { placeholder: '请选择' } satisfies PropsOf<typeof TxSelect>,
  cascaderOptions: [
    {
      value: 'plugins',
      label: '插件',
      children: [
        { value: 'clipboard', label: zhPlugins.clipboard, leaf: true },
        { value: 'browser', label: zhPlugins.browser, leaf: true },
      ],
    },
    { value: 'system', label: '系统', children: [{ value: 'shortcuts', label: '快捷键', leaf: true }] },
  ] satisfies PropsOf<typeof TxCascader>['options'],
  datePicker: { title: '选择日期', placeholder: '选择日期' } satisfies PropsOf<typeof TxDatePicker>,
  fileUploader: { buttonText: '选择文件', dropText: '将文件拖到这里', hintText: '或点击浏览' } satisfies PropsOf<typeof TxFileUploader>,
  themes: { light: '浅色', dark: '深色', auto: '自动' },
  views: { grid: '网格', list: '列表', kanban: '看板' },
  alerts: { mention: '提及', reply: '回复', archive: '归档', mute: '静音' },
  imageUploader: {
    uploadText: '上传',
    removeLabel: (name?: string) => (name ? `移除 ${name}` : '移除图片'),
  } satisfies PropsOf<typeof TxImageUploader>,
  numberInput: { decreaseLabel: '减小数值', increaseLabel: '增大数值' } satisfies PropsOf<typeof TxNumberInput>,
  // A drum needs rows above and below the centre to actually read as one; three
  // options only ever showed a flat, full list.
  pickerColumns: [{
    key: 'channel',
    options: [
      { value: 'stable', label: '稳定版' },
      { value: 'beta', label: '测试版' },
      { value: 'snapshot', label: '快照版' },
      { value: 'nightly', label: '每夜版' },
      { value: 'canary', label: '金丝雀版' },
      { value: 'lts', label: '长期支持版' },
      { value: 'edge', label: '前沿版' },
    ],
  }] satisfies PropsOf<typeof TxPicker>['columns'],
  searchSelectOptions: [
    { value: 'clipboard', label: zhPlugins.clipboard },
    { value: 'browser', label: zhPlugins.browser },
    { value: 'intelligence', label: zhPlugins.intelligence },
  ] satisfies PropsOf<typeof TxSearchSelect>['options'],
  sensitiveInput: {
    labels: {
      reveal: '点击查看',
      copy: '复制',
      copied: '已复制',
      hide: '隐藏值',
      show: '显示值',
      hidden: '值已隐藏',
      masked: '已遮蔽。',
      copySuccess: '已复制到剪贴板',
      instruction: '点击或按回车查看。',
      fallbackName: '敏感值',
    },
  } satisfies PropsOf<typeof TxSensitiveInput>,
  treeSelectNodes: [
    {
      key: 'general',
      label: '通用',
      children: [
        { key: 'appearance', label: '外观' },
        { key: 'language', label: '语言' },
      ],
    },
    { key: 'account', label: '账户', children: [{ key: 'profile', label: '个人资料' }] },
  ] satisfies PropsOf<typeof TxTreeSelect>['nodes'],
  breadcrumb: { ariaLabel: '面包屑导航' } satisfies PropsOf<typeof TxBreadcrumb>,
  navBar: { backLabel: '返回' } satisfies PropsOf<typeof TxNavBar>,
  sidebarNav: { ariaLabel: '工作区导航' } satisfies PropsOf<typeof TxSidebarNav>,
  uploads: { upload: '上传进度', synced: '同步完成' },
  spinner: { label: '加载中' } satisfies PropsOf<typeof TxSpinner>,
  tableColumns: [
    { key: 'name', title: '插件', dataIndex: 'name' },
    { key: 'channel', title: '通道', dataIndex: 'channel' },
  ] satisfies DataTableProps['columns'],
  tableRows: [
    { id: 1, name: zhPlugins.clipboard, channel: '稳定版' },
    { id: 2, name: zhPlugins.browser, channel: '测试版' },
    { id: 3, name: zhPlugins.intelligence, channel: '快照版' },
  ],
  filterChips: { ariaLabel: '组件状态筛选' } satisfies PropsOf<typeof TxFilterChips>,
  sortableList: {
    ariaLabel: '插件顺序',
    itemLabel: pluginLabel(zhPlugins),
    labels: {
      grabbed: '已拿起{item}，当前第 {position} 项，共 {size} 项。方向键移动，空格放下，Esc 取消。',
      moved: '{item}移到第 {position} 项，共 {size} 项。',
      dropped: '{item}已放在第 {position} 项，共 {size} 项。',
      cancelled: '已取消排序，{item}回到第 {position} 项，共 {size} 项。',
    },
  } satisfies Partial<SortableListProps>,
  transfer: {
    // A panel header leaves a title about 50px in the two-column grid.
    titles: ['可选', '已选'],
    addAriaLabel: '添加选中的插件',
    removeAriaLabel: '移除选中的插件',
    selectAllAriaLabel: '全选',
    emptyText: '暂无插件',
  } satisfies PropsOf<typeof TxTransfer>,
  transferData: [
    { key: 'clipboard', label: zhPlugins.clipboard },
    { key: 'browser', label: zhPlugins.browser },
    { key: 'actions', label: zhPlugins.actions },
  ] satisfies PropsOf<typeof TxTransfer>['data'],
  tree: { expandLabel: '展开', collapseLabel: '收起' } satisfies PropsOf<typeof TxTree>,
  treeNodes: [
    {
      key: 'plugins',
      label: '插件',
      children: [
        { key: 'clipboard', label: zhPlugins.clipboard, leaf: true },
        { key: 'browser', label: zhPlugins.browser, leaf: true },
      ],
    },
  ] satisfies PropsOf<typeof TxTree>['nodes'],

  /* ── Pro suite ── */
  versionCapsule: { historyLabel: '历史版本', downloadLabel: '下载此构建' } satisfies PropsOf<typeof TxVersionCapsule>,
  upgrade: '升级到 Pro',
  askAnything: '问点什么…',
  terminal: '终端输出',
  searchPanel: {
    listLabel: '搜索结果',
    emptyTitle: '没有匹配的结果',
    emptyDescription: '换个关键词再试一次',
    clearLabel: '清除搜索',
  } satisfies PropsOf<typeof TxSearchPanel>,
  searchPanelItems: [
    { id: 'clipboard', label: zhPlugins.clipboard },
    { id: 'browser', label: zhPlugins.browser },
    { id: 'actions', label: '新建插件' },
  ] satisfies PropsOf<typeof TxSearchPanel>['items'],
  staggerItems: [
    { icon: 'i-carbon-copy', label: '剪贴板' },
    { icon: 'i-carbon-earth', label: '浏览器' },
    { icon: 'i-carbon-flash', label: '操作' },
    { icon: 'i-carbon-window-base', label: '窗口' },
    { icon: 'i-carbon-terminal', label: '脚本' },
    { icon: 'i-carbon-machine-learning-model', label: 'AI' },
  ],
  logoStroke: 'Tuff 标志描边动画',
  widen: '加宽到 200px',

  /* ── AI suite ── */
  chatComposer: { sendButtonText: '发送' } satisfies PropsOf<typeof TxChatComposer>,
  messageActions: { label: '消息操作', copyLabel: '复制', copiedLabel: '已复制', regenerateLabel: '重新生成' } satisfies PropsOf<typeof TxMessageActions>,
  promptBar: { sendLabel: '发送' } satisfies PropsOf<typeof TxPromptBar>,
  agentTrace: { activeLabel: '思考中', doneLabel: '已思考' } satisfies PropsOf<typeof TxAgentTrace>,
  agentsList: { enabledTitle: '已启用', disabledTitle: '已停用', emptyText: '暂无智能体' } satisfies PropsOf<typeof TxAgentsList>,
  approvalCard: {
    ariaLabel: '审批问题',
    sendLabel: '发送答案',
    nextQuestionLabel: '下一题',
    nextLabel: '下一步',
    skipLabel: '跳过',
    prevLabel: '上一步',
    dismissLabel: '关闭',
    reopenLabel: '打开审批',
    sentLabel: '答案已发送',
    startOverLabel: '重新开始',
    customPlaceholder: '写点别的…',
    customLabel: '自定义答案',
    pagerLabelFormatter: (position: number) => `转到第 ${position} 题`,
  } satisfies PropsOf<typeof TxApprovalCard>,
  taskRows: { doneText: '已完成', errorText: '失败' } satisfies PropsOf<typeof TxTaskRows>,
  toolCallCard: { doneLabel: '完成', inputLabel: '输入' } satisfies PropsOf<typeof TxToolCallCard>,
  toolConfirmation: {
    allowLabel: '允许',
    denyLabel: '拒绝',
    rememberLabel: '本次会话内记住',
    riskLabels: { write: '写入数据' },
  } satisfies PropsOf<typeof TxToolConfirmation>,
  // Falls through to the root, which otherwise reads `write_file confirmation`.
  toolConfirmationName: '确认调用 write_file',
  botAvatars: { clover: 'Clover 机器人，工作中', mech: 'Mech 机器人，空闲', star: 'Star 机器人，工作中' },
  chainOfThought: { label: '思维链' } satisfies PropsOf<typeof TxChainOfThought>,
  codeStream: { copyLabel: '复制', copiedLabel: '已复制' } satisfies PropsOf<typeof TxCodeStream>,
  reasoning: {
    label: '思考过程',
    thinkingLabel: '思考中…',
    durationFormatter: (ms: number) => `思考了 ${(ms / 1000).toFixed(1)} 秒`,
  } satisfies PropsOf<typeof TxReasoningDisclosure>,
  sources: { labelFormatter: (count: number) => `引用了 ${count} 个来源` } satisfies PropsOf<typeof TxSources>,
  contextIndicator: { label: '上下文用量' } satisfies PropsOf<typeof TxContextIndicator>,
  insightCards: { previousLabel: '上一条洞察', nextLabel: '下一条洞察' } satisfies PropsOf<typeof TxInsightCards>,
  recommendationCard: {
    title: '装哪个发布通道？',
    alternativesLabel: '备选方案',
    otherOptionsLabel: '其他选项',
    acceptedLabel: '已采纳',
    acceptLabel: '采纳',
  } satisfies PropsOf<typeof TxRecommendationCard>,
  // `label` is the visible confidence wording beside the meter, not the option's name.
  recommendationOptions: [
    { key: 'stable', label: '置信度高', confidence: 'high', short: '稳定版 · 所有用户的默认通道', text: '适合日常使用，更新节奏平稳。', cta: '安装稳定版' },
    { key: 'beta', label: '置信度中', confidence: 'medium', short: '测试版 · 提前体验新特性', text: '新功能先到这里，偶尔会遇到还没打磨好的地方。', cta: '安装测试版' },
  ] satisfies RecommendationOption[],

  /* ── Data suite ── */
  allocationBar: { ariaLabel: '各发布通道用户占比' } satisfies PropsOf<typeof TxAllocationBar>,
  diffColumns: [
    { key: 'name', title: '插件', width: '55%' },
    { key: 'channel', title: '通道', width: '45%' },
  ] satisfies DiffTableProps['columns'],
  diffRows: [
    { key: 'clipboard', change: 'added', data: { name: zhPlugins.clipboard, channel: '稳定版' } },
    { key: 'legacy', change: 'removed', data: { name: '旧版', channel: '测试版' } },
  ] satisfies DiffTableProps['rows'],
}

const en = {
  plugins: enPlugins,
  copyCommand: (command: string) => `Copy: ${command}`,

  /* ── Base suite ── */
  switches: { sync: 'Auto sync', compact: 'Compact mode', backup: 'Cloud backup' },
  progress: { download: 'Download progress', installed: 'Install complete', failed: 'Sync failed', share: 'Users by channel', loading: 'Loading' },
  rating: {} satisfies PropsOf<typeof TxRating>,
  tag: {} satisfies PropsOf<typeof TxTag>,
  pagination: {} satisfies PropsOf<typeof TxPagination>,
  select: {} satisfies PropsOf<typeof TxSelect>,
  cascaderOptions: [
    {
      value: 'plugins',
      label: 'Plugins',
      children: [
        { value: 'clipboard', label: enPlugins.clipboard, leaf: true },
        { value: 'browser', label: enPlugins.browser, leaf: true },
      ],
    },
    { value: 'system', label: 'System', children: [{ value: 'shortcuts', label: 'Shortcuts', leaf: true }] },
  ] satisfies PropsOf<typeof TxCascader>['options'],
  datePicker: {} satisfies PropsOf<typeof TxDatePicker>,
  fileUploader: {} satisfies PropsOf<typeof TxFileUploader>,
  themes: { light: 'Light', dark: 'Dark', auto: 'Auto' },
  views: { grid: 'Grid', list: 'List', kanban: 'Kanban' },
  alerts: { mention: 'Mentions', reply: 'Replies', archive: 'Archive', mute: 'Mute' },
  imageUploader: {} satisfies PropsOf<typeof TxImageUploader>,
  numberInput: {} satisfies PropsOf<typeof TxNumberInput>,
  pickerColumns: [{
    key: 'channel',
    options: [
      { value: 'stable', label: 'Stable' },
      { value: 'beta', label: 'Beta' },
      { value: 'snapshot', label: 'Snapshot' },
      { value: 'nightly', label: 'Nightly' },
      { value: 'canary', label: 'Canary' },
      { value: 'lts', label: 'LTS' },
      { value: 'edge', label: 'Edge' },
    ],
  }] satisfies PropsOf<typeof TxPicker>['columns'],
  searchSelectOptions: [
    { value: 'clipboard', label: enPlugins.clipboard },
    { value: 'browser', label: enPlugins.browser },
    { value: 'intelligence', label: enPlugins.intelligence },
  ] satisfies PropsOf<typeof TxSearchSelect>['options'],
  sensitiveInput: {} satisfies PropsOf<typeof TxSensitiveInput>,
  treeSelectNodes: [
    {
      key: 'general',
      label: 'General',
      children: [
        { key: 'appearance', label: 'Appearance' },
        { key: 'language', label: 'Language' },
      ],
    },
    { key: 'account', label: 'Account', children: [{ key: 'profile', label: 'Profile' }] },
  ] satisfies PropsOf<typeof TxTreeSelect>['nodes'],
  breadcrumb: {} satisfies PropsOf<typeof TxBreadcrumb>,
  navBar: {} satisfies PropsOf<typeof TxNavBar>,
  sidebarNav: { ariaLabel: 'Workspace navigation' } satisfies PropsOf<typeof TxSidebarNav>,
  uploads: { upload: 'Upload progress', synced: 'Sync complete' },
  spinner: {} satisfies PropsOf<typeof TxSpinner>,
  tableColumns: [
    { key: 'name', title: 'Plugin', dataIndex: 'name' },
    { key: 'channel', title: 'Channel', dataIndex: 'channel' },
  ] satisfies DataTableProps['columns'],
  tableRows: [
    { id: 1, name: enPlugins.clipboard, channel: 'Stable' },
    { id: 2, name: enPlugins.browser, channel: 'Beta' },
    { id: 3, name: enPlugins.intelligence, channel: 'Snapshot' },
  ],
  filterChips: { ariaLabel: 'Component status filter' } satisfies PropsOf<typeof TxFilterChips>,
  sortableList: { ariaLabel: 'Plugin order', itemLabel: pluginLabel(enPlugins) } satisfies Partial<SortableListProps>,
  transfer: {
    // A panel header leaves a title about 50px in the two-column grid.
    titles: ['Source', 'Target'],
    addAriaLabel: 'Add the selected plugins',
    removeAriaLabel: 'Remove the selected plugins',
    emptyText: 'No plugins',
  } satisfies PropsOf<typeof TxTransfer>,
  transferData: [
    { key: 'clipboard', label: enPlugins.clipboard },
    { key: 'browser', label: enPlugins.browser },
    { key: 'actions', label: enPlugins.actions },
  ] satisfies PropsOf<typeof TxTransfer>['data'],
  tree: {} satisfies PropsOf<typeof TxTree>,
  treeNodes: [
    {
      key: 'plugins',
      label: 'Plugins',
      children: [
        { key: 'clipboard', label: enPlugins.clipboard, leaf: true },
        { key: 'browser', label: enPlugins.browser, leaf: true },
      ],
    },
  ] satisfies PropsOf<typeof TxTree>['nodes'],

  /* ── Pro suite ── */
  versionCapsule: {} satisfies PropsOf<typeof TxVersionCapsule>,
  upgrade: 'Upgrade to Pro',
  askAnything: 'Ask anything…',
  terminal: 'Terminal output',
  searchPanel: {} satisfies PropsOf<typeof TxSearchPanel>,
  searchPanelItems: [
    { id: 'clipboard', label: enPlugins.clipboard },
    { id: 'browser', label: enPlugins.browser },
    { id: 'actions', label: 'New plugin' },
  ] satisfies PropsOf<typeof TxSearchPanel>['items'],
  staggerItems: [
    { icon: 'i-carbon-copy', label: 'Clipboard' },
    { icon: 'i-carbon-earth', label: 'Browser' },
    { icon: 'i-carbon-flash', label: 'Actions' },
    { icon: 'i-carbon-window-base', label: 'Windows' },
    { icon: 'i-carbon-terminal', label: 'Scripts' },
    { icon: 'i-carbon-machine-learning-model', label: 'AI' },
  ],
  logoStroke: 'Tuff logo stroke animation',
  widen: 'Widen to 200px',

  /* ── AI suite ── */
  chatComposer: {} satisfies PropsOf<typeof TxChatComposer>,
  messageActions: {} satisfies PropsOf<typeof TxMessageActions>,
  promptBar: {} satisfies PropsOf<typeof TxPromptBar>,
  agentTrace: {} satisfies PropsOf<typeof TxAgentTrace>,
  agentsList: {} satisfies PropsOf<typeof TxAgentsList>,
  approvalCard: {} satisfies PropsOf<typeof TxApprovalCard>,
  taskRows: {} satisfies PropsOf<typeof TxTaskRows>,
  toolCallCard: {} satisfies PropsOf<typeof TxToolCallCard>,
  toolConfirmation: {} satisfies PropsOf<typeof TxToolConfirmation>,
  toolConfirmationName: 'write_file confirmation',
  botAvatars: { clover: 'Clover bot, working', mech: 'Mech bot, idle', star: 'Star bot, working' },
  chainOfThought: {} satisfies PropsOf<typeof TxChainOfThought>,
  codeStream: {} satisfies PropsOf<typeof TxCodeStream>,
  reasoning: {} satisfies PropsOf<typeof TxReasoningDisclosure>,
  sources: {} satisfies PropsOf<typeof TxSources>,
  contextIndicator: {} satisfies PropsOf<typeof TxContextIndicator>,
  insightCards: {} satisfies PropsOf<typeof TxInsightCards>,
  recommendationCard: { title: 'Which channel should you install?' } satisfies PropsOf<typeof TxRecommendationCard>,
  recommendationOptions: [
    { key: 'stable', label: 'High confidence', confidence: 'high', short: 'Stable · the default for everyone', text: 'Best for everyday use, with a steady update pace.', cta: 'Install Stable' },
    { key: 'beta', label: 'Medium confidence', confidence: 'medium', short: 'Beta · early access to new features', text: 'New features arrive here first, along with the odd rough edge.', cta: 'Install Beta' },
  ] satisfies RecommendationOption[],

  /* ── Data suite ── */
  allocationBar: { ariaLabel: 'Users by release channel' } satisfies PropsOf<typeof TxAllocationBar>,
  diffColumns: [
    { key: 'name', title: 'Plugin', width: '55%' },
    { key: 'channel', title: 'Channel', width: '45%' },
  ] satisfies DiffTableProps['columns'],
  diffRows: [
    { key: 'clipboard', change: 'added', data: { name: enPlugins.clipboard, channel: 'Stable' } },
    { key: 'legacy', change: 'removed', data: { name: 'Legacy', channel: 'Beta' } },
  ] satisfies DiffTableProps['rows'],
}

export const galleryText = { zh, en }
