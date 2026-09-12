# Tuff v2.4.14-beta.38 更新说明

## 摘要

- Nexus 开发环境默认使用已构建的 TuffEx dist，减少文档站开发图依赖；编辑 TuffEx 源码时可显式切换到 source 模式。
- 补齐按需组件样式闭包，让 dist 模式下的组件及其依赖样式按需加载而不是提前加载整套样式。
- 修复图标样式层叠优先级与 Cloudflare 重复响应头解析，并增加对应回归检查。

## 变更内容

- 新增 TuffEx 开发模式、组件样式注入、图标 CSS specificity、重复 Link 头合并及 Nexus 构建预算的回归覆盖。
