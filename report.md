# 滚动问题排查报告

## 现象
- Settings 页面滚动时“闪动一下就回弹”，无法稳定下拉查看后续内容。
- Console 未出现任何滚动诊断日志（已在 TxScroll 与 TouchScroll 添加一次性诊断打印）。

## 复现场景
- dev 模式（用户说明：dev 直接使用源文件）。
- Settings 页面（ViewTemplate + TouchScroll + TxScroll）。

## 结构链路
```
#app
└─ AppEntrance
   └─ AppLayout-Wrapper
      └─ DynamicLayout-Wrapper
         └─ AppLayout-Container
            └─ AppLayout-Main
               ├─ AppLayout-Aside
               └─ AppLayout-View
                  └─ ViewTemplate
                     └─ ViewTemplate-Wrapper (absolute, h-full)
                        └─ TouchScroll
                           └─ tx-scroll__wrapper
                              └─ tx-scroll__content
                                 └─ View-Container
                                    └─ AppSettings-Container
```

## 已做的调整（与滚动相关）
- `apps/core-app/src/renderer/src/components/base/template/ViewTemplate.vue`
  - ViewTemplate 内部结构改为 flex + min-height: 0，TouchScroll 增加 height: 100%。
  - View-Container 增加 padding，TouchScroll 使用 no-padding 避免双层 padding。
- `apps/core-app/src/renderer/src/views/layout/AppLayout.vue`
  - AppLayout-Main 增加 min-height: 0，AppLayout-Aside 固定宽度（避免挤占右侧）。
- `apps/core-app/src/renderer/src/styles/layout/_container-base.scss`
  - AppLayout-View 改为 flex: 1 + display:flex，保证右侧内容区高度可传递。
- `apps/core-app/src/renderer/src/components/base/TouchScroll.vue`
  - 添加 mounted + scroll 诊断打印（dev 下仅打印一次）。
- `packages/tuffex/packages/components/src/scroll/src/TxScroll.vue`
  - 添加滚动诊断打印（wheel 无位移也强制打印一次）。

## 当前问题
诊断日志未出现，说明：
1) 滚动事件没有打到 TouchScroll（被上层拦截），或  
2) 实际运行未使用修改后的源文件（尽管用户反馈 dev 用源文件）。

## 下一步建议
- 在 `ViewTemplate` 或 `AppLayout-View` 添加 capture 级别的 wheel/scroll 监听日志，确认事件是否进入滚动容器。
- 在 `TouchScroll` 内部打印 `rootEl` 是否存在、以及 `tx-scroll__wrapper`/`tx-scroll__content` 的实时高度。
- 如确认使用构建产物，需检查 tuffex 的本地 alias/链接方式（Vite resolve 或 pnpm workspace link）。

