import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presetIcons, presetUno } from 'unocss'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vitepress'

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')

export default defineConfig({
  title: 'TuffEx',
  description: '优雅的 Vue3 组件库，为每一次交互注入生命力',
  lang: 'zh-CN',

  ignoreDeadLinks: true,

  vite: {
    plugins: [
      UnoCSS({
        presets: [
          presetUno(),
          presetIcons({
            scale: 1.2,
            warn: true,
          }),
        ],
      }),
    ],
    resolve: {
      alias: {
        '@tuffex': PACKAGE_ROOT,
      },
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    sourceBase: 'https://github.com/talex-touch/tuff/blob/main/',
    logo: '/logo.svg',
    siteTitle: 'TuffEx',

    nav: [
      { text: '首页', link: '/' },
      { text: '组件', link: '/components/' },
      { text: '设计', link: '/design/colors' },
      {
        text: '生态',
        items: [
          { text: 'GitHub', link: 'https://github.com/talex-touch/touchx-ui' },
          { text: 'NPM', link: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
        ],
      },
    ],

    sidebar: {
      '/components/': [
        {
          text: '基础',
          items: [
            { text: '按钮 Button', link: '/components/button' },
            { text: '图标 Icon', link: '/components/icon' },
            { text: '头像 Avatar', link: '/components/avatar' },
            { text: '头像变体 AvatarVariants', link: '/components/avatar-variants' },
            { text: '描边容器 OutlineBorder', link: '/components/outline-border' },
            { text: '角标容器 CornerOverlay', link: '/components/corner-overlay' },
            { text: '标签 Tag', link: '/components/tag' },
            { text: '状态徽标 StatusBadge', link: '/components/status-badge' },
          ],
        },
        {
          text: '表单',
          items: [
            { text: '输入框 Input', link: '/components/input' },
            { text: '代码编辑器 CodeEditor', link: '/components/code-editor' },
            { text: '搜索输入框 SearchInput', link: '/components/search-input' },
            { text: '搜索选择器 SearchSelect', link: '/components/search-select' },
            { text: '表单 Form', link: '/components/form' },
            { text: '标签输入 TagInput', link: '/components/tag-input' },
            { text: '复选框 Checkbox', link: '/components/checkbox' },
            { text: '单选框 Radio', link: '/components/radio' },
            { text: '开关 Switch', link: '/components/switch' },
            { text: '选择器 Select', link: '/components/select' },
            { text: '滚轮选择 Picker', link: '/components/picker' },
            { text: '日期选择 DatePicker', link: '/components/date-picker' },
            { text: '树形 Tree', link: '/components/tree' },
            { text: '树选择器 TreeSelect', link: '/components/tree-select' },
            { text: '级联选择 Cascader', link: '/components/cascader' },
            { text: '滑块 Slider', link: '/components/slider' },
            { text: '分段滑块 SegmentedSlider', link: '/components/segmented-slider' },
          ],
        },
        {
          text: '数据展示',
          items: [
            { text: '卡片 Card', link: '/components/card' },
            { text: '卡片项 CardItem', link: '/components/card-item' },
            { text: '数据表格 DataTable', link: '/components/data-table' },
            { text: '空状态 Empty', link: '/components/empty' },
            { text: '空态引导 EmptyState', link: '/components/empty-state' },
            { text: '空白页 BlankSlate', link: '/components/blank-slate' },
            { text: '加载态 LoadingState', link: '/components/loading-state' },
            { text: '未选择 NoSelection', link: '/components/no-selection' },
            { text: '无数据 NoData', link: '/components/no-data' },
            { text: '搜索空态 SearchEmpty', link: '/components/search-empty' },
            { text: '离线 OfflineState', link: '/components/offline-state' },
            { text: '权限不足 PermissionState', link: '/components/permission-state' },
            { text: '指标卡片 StatCard', link: '/components/stat-card' },
            { text: 'Markdown渲染 MarkdownView', link: '/components/markdown-view' },
          ],
        },
        {
          text: '导航',
          items: [
            { text: '导航栏 NavBar', link: '/components/nav-bar' },
            { text: '标签页 Tabs', link: '/components/tabs' },
            { text: '底部导航 TabBar', link: '/components/tab-bar' },
            { text: '文字提示 Tooltip', link: '/components/tooltip' },
            { text: '弹出层 Popover', link: '/components/popover' },
            { text: '下拉菜单DropdownMenu', link: '/components/dropdown-menu' },
            { text: '右键菜单 ContextMenu', link: '/components/context-menu' },
          ],
        },
        {
          text: '布局',
          items: [
            { text: '容器 Container', link: '/components/container' },
            { text: '栅格 Grid', link: '/components/grid' },
            { text: '分割面板 Splitter', link: '/components/splitter' },
            { text: '堆叠 Stack', link: '/components/stack' },
            { text: '弹性布局 Flex', link: '/components/flex' },
            { text: '分组块 GroupBlock', link: '/components/group-block' },
            { text: '滚动 Scroll', link: '/components/scroll' },
            { text: '虚拟列表 VirtualList', link: '/components/virtual-list' },
            { text: '网格布局 GridLayout', link: '/components/grid-layout' },
            { text: '布局骨架 LayoutSkeleton', link: '/components/layout-skeleton' },
            { text: '智能体列表Agents', link: '/components/agents' },
          ],
        },
        {
          text: '反馈',
          items: [
            { text: '进度条 ProgressBar', link: '/components/progress-bar' },
            { text: '进度 Progress', link: '/components/progress' },
            { text: '加载 Spinner', link: '/components/spinner' },
            { text: '加载遮罩 LoadingOverlay', link: '/components/loading-overlay' },
            { text: '骨架屏 Skeleton', link: '/components/skeleton' },
            { text: '提示 Toast', link: '/components/toast' },
          ],
        },
        {
          text: '覆盖层',
          items: [
            { text: '抽屉 Drawer', link: '/components/drawer' },
            { text: '对话框 Dialog', link: '/components/dialog' },
            { text: '命令面板 CommandPalette', link: '/components/command-palette' },
          ],
        },
        {
          text: '动效',
          items: [
            { text: '自适应尺寸 AutoSizer', link: '/components/auto-sizer' },
            { text: '过渡 Transition', link: '/components/transition' },
            { text: '文本变换 TextTransformer', link: '/components/text-transformer' },
            { text: '交融 Fusion', link: '/components/fusion' },
            { text: '依次进入 Stagger', link: '/components/stagger' },
            { text: '拖拽排序 SortableList', link: '/components/sortable-list' },
          ],
        },
        {
          text: 'AI',
          items: [
            { text: '消息列表 Chat', link: '/components/chat' },
            { text: '消息输入 ChatComposer', link: '/components/chat-composer' },
            { text: '打字中TypingIndicator', link: '/components/typing-indicator' },
            { text: '图片上传 ImageUploader', link: '/components/image-uploader' },
            { text: '文件上传 FileUploader', link: '/components/file-uploader' },
            { text: '图片预览 ImageGallery', link: '/components/image-gallery' },
          ],
        },
        {
          text: '视觉',
          items: [
            { text: '玻璃拟态 GlassSurface', link: '/components/glass-surface' },
            { text: '渐变模糊 GradualBlur', link: '/components/gradual-blur' },
            { text: '渐变边框 GradientBorder', link: '/components/gradient-border' },
            { text: '扫光 GlowText', link: '/components/glow-text' },
          ],
        },
      ],

      '/design/': [
        {
          text: '设计规范',
          items: [
            { text: '颜色', link: '/design/colors' },
            { text: '排版', link: '/design/typography' },
            { text: '间距', link: '/design/spacing' },
            { text: '阴影', link: '/design/shadows' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/talex-touch/touchx-ui' },
    ],

    footer: {
      message: '基于MIT 许可证发布',
      copyright: 'Copyright © 2024-present TalexDreamSoul',
    },

    outline: {
      label: '本页目录',
      level: [2, 3],
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇',
    },

    lastUpdated: {
      text: '最后更新于',
    },

    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
  },
})
