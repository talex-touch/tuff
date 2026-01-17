# Nexus TuffexUI 统一迁移 PRD（精简版）

## 背景
Dashboard 与 Marketplace 存在多套基础组件和弹层实现，维护成本高且样式重复，计划用 TuffexUI 统一高频组件体系。

## 目标
- 统一基础组件与弹层体系，降低重复维护成本
- 交互与信息结构不回退
- 黑白主基调不变，颜色/圆角/阴影做轻度统一

## 范围
- 试点页面
  - [`apps/nexus/app/pages/dashboard/plugins.vue`](apps/nexus/app/pages/dashboard/plugins.vue)
  - [`apps/nexus/app/pages/dashboard/updates.vue`](apps/nexus/app/pages/dashboard/updates.vue)
  - [`apps/nexus/app/pages/market.vue`](apps/nexus/app/pages/market.vue)
- 覆盖组件：按钮、输入/搜索、抽屉、模态、开关；Toast/标签/徽章/状态保持 Nexus 实现
- 兼容策略：按钮/输入/Drawer/Modal/Switch 以 Tuffex 为参考基准，其余保持 Nexus 视觉

## 非范围
- Landing/动效密集区域不改
  - [`apps/nexus/app/components/tuff/`](apps/nexus/app/components/tuff/)

## 组件映射（MVP）
- TouchButton → TxButton / TxFlatButton
- Search / MarketSearch → TxSearchInput / TxInput
- Create/Version/PluginDetail/Update Drawer → TxDrawer
- ReviewModal → TxModal
- ToastContainer + useToast → Nexus ToastHost（保持 useToast API，内部自实现）
- PluginListItem / MarketItem 标记 → Nexus Tag / Badge / StatusBadge（封装层自实现）
- DarkToggle → TxSwitch

## 技术方案
- Nuxt 插件接入 TuffexUI（全局样式引入，必要时 client-only）
  - 插件文件: [`apps/nexus/app/plugins/tuffex.ts`](apps/nexus/app/plugins/tuffex.ts)
- UI 封装层：统一 props/语义，业务页面不直连 Tuffex
  - 目录: [`apps/nexus/app/components/ui/`](apps/nexus/app/components/ui/)

## 实施步骤
1) 接入层（插件 + 样式）
2) 建立封装层（Button/Input/Drawer/Modal/Toast/Tag/Switch）
3) 迁移 Dashboard（plugins + updates）
4) 迁移 Marketplace（market）
5) Token 对齐（颜色/圆角/阴影）
6) 回归验证（交互/焦点/滚动锁定/遮罩/性能）

## 验收标准
- 试点页面功能一致、交互无回退
- 统一通过封装层接入（不直接依赖 Tuffex API）
- Toast/Modal/Drawer 在 3 个页面稳定使用
- Landing/Docs 视觉不受影响

## 风险与对策
- 样式冲突：封装层 + 局部样式隔离
- 样式优先级：Nexus 视觉优先，冲突记录见 `./nexus-tuffexui-style-conflicts.md`
- SSR/水合差异：必要时 client-only 加载
