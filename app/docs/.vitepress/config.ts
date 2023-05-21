import { defineConfig } from "vitepress";
import { nav } from "./config/nav";
import { sidebar } from "./config/sidebar";
import { PluginTable } from "./plugin";
import type MarkdownIt from "markdown-it";

/**
 * 更多配置项参考：
 *
 * @see app-configs https://vitepress.vuejs.org/config/app-configs.html
 */
export default defineConfig({
  title: "TalexTouch",
  /**
   * 是否显示最后更新时间
   *
   * @see last-updated https://vitepress.vuejs.org/guide/theme-last-updated#last-updated
   */
  lastUpdated: true,
  /**
   * 缓存目录
   *
   * @see cacheDir https://vitepress.vuejs.org/config/app-configs#cachedir
   */
  cacheDir: "../../node_modules",
  /**
   * 主题配置
   *
   * @see theme-config https://vitepress.vuejs.org/guide/migration-from-vitepress-0#theme-config
   */
  themeConfig: {
    nav,
    sidebar,
    footer: {
      message:
        'Released under the <a style="font-weight: 600" href="https://github.com/talex-touch/talex-touch/blob/master/LICENSE">Mozilla Public License 2.0</a>.',
      copyright:
        'Copyright © 2022-2023 <a style="font-weight: 600" href="https://github.com/TalexDreamSoul">TalexDreamSoul</a>',
    },
    editLink: {
      pattern:
        "https://github.com/talex-touch/talex-touch/edit/master/docs/src/:path",
      text: "Edit on GitHub",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/talex-touch/talex-touch" },
    ],
    lastUpdatedText: "Last Updated",
    docFooter: {
      prev: "Previous Section",
      next: "Next Section",
    },
  },
  /**
   * 自定义 markdown 解析器
   *
   * @see markdown https://vitepress.vuejs.org/config/app-configs#markdown
   */
  markdown: {
    /**
     * 配置 Markdown-it 实例
     *
     * @param { Object } md markdown 实例
     */
    config: (md: MarkdownIt): void => {
      md.use(PluginTable);
    },
  },
});
