/**
 * 侧边栏菜单
 *
 * @see sidebar https://vitepress.vuejs.org/guide/theme-sidebar#sidebar
 */

const docs = [
  { text: "Introduction", link: "/docs/documents/index" },
  { text: "Get Started", link: "/docs/documents/start" },
  { text: "Account", link: "/docs/documents/account" },
  { text: "Customization", link: "/docs/documents/customization" },
  { text: "Plugin Market", link: "/docs/documents/plugin_market" },
  { text: "Sync", link: "/docs/documents/sync" }
];

const plugins = [
  { text: "What's", link: "/docs/plugins/introduction" },
  { text: "Setup", link: "/docs/plugins/setup" },
  { text: "Preload scripts", link: "/docs/plugins/preloadjs" },
  // { text: "Events", link: "/docs/plugins/events" },
  { text: "Permission", link: "/docs/plugins/permission" },
  { text: "Toast", link: "/docs/plugins/toast" },
  { text: "Snippets", link: "/docs/plugins/snippets" },
  // { text: "Storage", link: "/docs/plugins/storage" },
  // { text: "I18n", link: "/docs/plugins/i18n" },
  // { text: "Theme", link: "/docs/plugins/theme" },
  // { text: "Utils", link: "/docs/plugins/utils" },
  { text: "Widget", link: "/docs/plugins/widget" },
  { text: "Publish", link: "/docs/plugins/publish" },
  {
    text: "api",
    collapsible: true,
    items: [{ text: "event", link: "/docs/plugins/api/event" }],
  },
  {
    text: "config",
    collapsible: true,
    items: [{ text: "init.json", link: "/docs/plugins/config/init" }],
  },
];

export const sidebar = [
  {
    text: "Guidance",
    collapsible: true,
    link: "/docs/documents/index",
    items: docs,
  },
  {
    text: "Plugins",
    collapsible: true,
    link: "/docs/plugins/introduction",
    items: plugins,
  },
  {
    text: "About",
    collapsible: true,
    link: "/docs/about/changelog",
    items: [
      { text: "Changelog", link: "/docs/about/changelog" },
      { text: "Team", link: "/docs/about/team" },
    ],
  },
];
