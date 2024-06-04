/**
 * 顶部导航栏菜单
 *
 * @see Nav https://vitepress.vuejs.org/guide/theme-nav#nav
 */
export const nav = [
  { text: "Home", link: "/" },
  {
    text: "Document",
    activeMatch: "/docs/",
    link: "/docs/documents/index",
  },
  // { text: "Plugins", link: "/docs/plugins/introduction" },
  { text: 'API', link: '/docs/api' },
  { text: 'Q & A', link: '/q-a/index' },
  {
    text: "About",
    items: [
      { text: "Changelog", link: "/docs/about/changelog" },
      { text: "Team", link: "/docs/about/team" },
    ],
  },
];
