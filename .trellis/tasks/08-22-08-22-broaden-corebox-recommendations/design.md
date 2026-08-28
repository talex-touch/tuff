# 技术设计

## 数据流

```text
Search provider item -> usage/new-install signal -> RecommendationEngine candidate
  -> ItemRebuilder by stable source/id -> ranked recommendation -> CoreBox
```

## 边界

- 应用自身过滤属于应用结果重建边界：用当前 executable path 与已知正式/开发 bundle id 判定，避免显示名和版本变化绕过。
- 文件 source 归一只处理既有 Everything、Spotlight、Linux/Windows shell 文件 Provider，统一交给 file-provider 重建。
- MainWindowProvider 与 SystemActionsProvider 继续拥有项目定义和执行语义；新增的重建 API 只按稳定 itemId 返回同一生产项。
- ItemRebuilder 负责 source 路由，不复制 Provider 文案、图标、动作或权限。
- ContextActions/preview 等动态项没有可安全重建的上下文，保持不可推荐。

## 回滚

修改均为加法 Provider 重建与候选过滤收敛；回滚恢复旧 source 路由和 file 过滤，不涉及数据库迁移或持久数据变换。
