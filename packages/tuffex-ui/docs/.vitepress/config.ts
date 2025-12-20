import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')

export default defineConfig({
  title: 'TuffEx UI',
  description: '优雅的 Vue3 组件库，为每一次交互注入生命力',
  lang: 'zh-CN',

  vite: {
    resolve: {
      alias: {
        '@tuffex-ui': PACKAGE_ROOT,
      },
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'TuffEx UI',

    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/introduction' },
      { text: '组件', link: '/components/' },
      { text: '设计', link: '/design/colors' },
      {
        text: '生态',
        items: [
          { text: 'GitHub', link: 'https://github.com/talex-touch/touchx-ui' },
          { text: 'NPM', link: 'https://www.npmjs.com/package/@talex-touch/tuff-ui' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '介绍', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '安装', link: '/guide/installation' },
          ],
        },
        {
          text: '进阶',
          items: [
            { text: '主题定制', link: '/guide/theming' },
            { text: '暗色模式', link: '/guide/dark-mode' },
            { text: '国际化', link: '/guide/i18n' },
          ],
        },
      ],

      '/components/': [
        {
          text: '基础组件',
          items: [
            { text: '按钮 Button', link: '/components/button' },
            { text: '标签 Tag', link: '/components/tag' },
            { text: '状态徽标 StatusBadge', link: '/components/status-badge' },
          ],
        },
        {
          text: '表单组件',
          items: [
            { text: '输入框 Input', link: '/components/input' },
            { text: '开关 Switch', link: '/components/switch' },
            { text: '复选框 Checkbox', link: '/components/checkbox' },
            { text: '选择器 Select', link: '/components/select' },
          ],
        },
        {
          text: '布局组件',
          items: [
            { text: '分组块 GroupBlock', link: '/components/group-block' },
          ],
        },
        {
          text: '反馈组件',
          items: [
            { text: '进度条 ProgressBar', link: '/components/progress-bar' },
            { text: '进度 Progress', link: '/components/progress' },
          ],
        },
        {
          text: '覆盖层组件',
          items: [
            { text: '抽屉 Drawer', link: '/components/drawer' },
            { text: '对话框 Dialog', link: '/components/dialog' },
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
      message: '基于 MIT 许可证发布',
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
