# 兼容性/老旧代码扫描报告

本报告用于跟踪 core-app 中的兼容性、老旧与 deprecated/legacy 相关实现，按统一口径输出分类清单与复核记录。

## 扫描口径

- A. Deprecated/不推荐但仍在使用：显式标注 deprecated、legacy、obsolete 或类似说明，但仍在执行路径中。
- B. 兼容性/过渡性代码：用于版本门控、平台差异、旧协议/旧结构兼容或退路逻辑（fallback/shim/polyfill）。
- C. 其他老旧或风险项：不直接标注 deprecated/legacy，但呈现明显历史包袱或迁移残留的实现。

## 关键词清单（初版）

- deprecated
- legacy
- compat / compatibility
- shim
- fallback
- polyfill
- migration
- obsolete

## 搜索范围与原则

- 范围：`src/`、`resources/`、`scripts/`、`public/`、`docs/` 及相关配置文件。
- 形式：注释、JSDoc/TS 注解（含 `@deprecated`）、配置与脚本说明。
- 规则：关键词大小写不敏感；命中后需结合上下文判断归类。
