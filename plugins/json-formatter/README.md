# JSON Formatter

一个简洁高效的 JSON 格式化工具。

## 功能

- JSON 格式化 / 压缩
- JSON 验证
- JSON 转 YAML / XML
- JSON 转义 / 反转义
- JSON 扁平化
- JSON 对比
- 支持 JavaScript 表达式查询

## 开发

```bash
pnpm install
pnpm dev
```

## 构建

```bash
pnpm build
```

## 更新记录

- 2025-12-11: 修复 Monaco loader CDN 配置并在构建后自动矫正字体路径，避免插件内静态资源 404
- 2025-12-09: 移除 vue-i18n 相关 catalog 与自动导入，保持依赖列表干净
