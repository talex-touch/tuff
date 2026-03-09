import process from "node:process";
import type { ModuleOptions } from "@vite-pwa/nuxt";
import { appDescription, appName } from "../constants/index";

// 定义PWA作用域
const scope = "/";

// 配置PWA模块选项
export const pwa: ModuleOptions = {
  // 自动更新服务工作者
  registerType: "autoUpdate",
  // 设置作用域和基本路径
  scope,
  base: scope,
  // 清单信息配置
  manifest: {
    id: scope,
    scope,
    name: appName,
    short_name: appName,
    description: appDescription,
    theme_color: "#ffffff",
    // 不同尺寸和用途的图标
    icons: [
      {
        src: "pwa-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "pwa-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "maskable-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  },
  workbox: {
    maximumFileSizeToCacheInBytes: Number.parseInt(process.env.WORKBOX_MAX_FILE_SIZE || '5000000'),
    // 匹配模式，用于指定需要缓存的文件类型
    globPatterns: ["**/*.{js,css,html,txt,png,ico,svg}"],
    // 导航回退策略，避免对API请求的回退
    navigateFallbackDenylist: [/^\/api\//],
    // 默认回退页面
    navigateFallback: "/",
    // 自动清理过时的缓存
    cleanupOutdatedCaches: true,
    // 运行时缓存策略
    runtimeCaching: [
      {
        // Google Fonts缓存策略
        urlPattern: /^https:\/\/fonts.googleapis.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-cache",
          // 缓存有效期设置
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
          },
          // 可缓存的响应状态
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts.gstatic.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "gstatic-fonts-cache",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
  // 在路由规则中注册Web应用清单
  registerWebManifestInRouteRules: true,
  // 启用插件写入
  writePlugin: true,
  // 开发环境的导航回退设置
  devOptions: {
    enabled: process.env.VITE_PLUGIN_PWA === "true",
    navigateFallback: scope,
  },
};
