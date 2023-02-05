import { defineConfigWithTheme } from "vitepress";

export default defineConfigWithTheme({
  title: 'TalexTouch',
  titleTemplate: ':title - Touch',
  base: '/talex-touch/',
  head: [['meta', { name: 'theme-color', content: '#0c9dff' }]],
  srcDir: './src',
  outDir: './dist',
  description: '一款触手可及的全应用',
  lang: 'zh-CN',
  lastUpdated: true,
  ignoreDeadLinks: true,
  markdown: {
    lineNumbers: true
  },
  themeConfig: {
    nav: [
      { text: '主页', link: '/' },
      { text: '引导', link: '/guide' },
      // { text: 'API', link: '/api' },
      { text: '插件', link: '/plugins/introduction' },
      { text: '关于', items: [
          { text: '更新日志', link: '/about/changelog' },
          { text: '制作团队', link: '/about/team' },
        ] }
    ],
    sidebar: [
      { text: '引导', link: '/guide' },
      {
        text: '使用',
        items: [

        ],
        collapsible: true
      },
      {
        text: '插件',
        items: [
          { text: '介绍', link: '/plugins/introduction' },
          { text: '前置脚本', link: '/plugins/preloadjs' },
          { text: 'api',  collapsible: true, items: [
              { text: 'event', link: '/plugins/api/event' },
            ] },
          { text: 'config',  collapsible: true, items: [
              { text: 'init.json', link: '/plugins/config/init' },
            ] },
        ],
        collapsible: true
      },
      { text: '更新日志', link: '/about/changelog' },
      { text: '制作团队', link: '/about/team' },
    ],
    footer: {
      message: 'Released under the <a style="font-weight: 600" href="https://github.com/talex-touch/talex-touch/blob/master/LICENSE">Mozilla Public License 2.0</a>.',
      copyright: 'Copyright © 2022-2023 <a style="font-weight: 600" href="https://github.com/TalexDreamSoul">TalexDreamSoul</a>'
    },
    editLink: {
      pattern: 'https://github.com/talex-touch/talex-touch/edit/master/docs/src/:path',
      text: '修订文档',
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/talex-touch/talex-touch' }
    ],
    lastUpdatedText: '上次更新时间',
    docFooter: {
      prev: '上一节',
      next: '下一节'
    }
  }
})