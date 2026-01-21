# 依赖与执行顺序（Execution Sequence）

> 目标：基于现状与分组，给出线性执行顺序与阶段里程碑。

## 阶段划分（里程碑）

1. **基础能力**：需求来源、模板、去重、分组与现状对齐（已完成）
2. **迁移/改造**：影响核心架构与存储/IPC 的需求优先
3. **文档/验证**：Nexus 文档与官网内容整理
4. **收尾/运营**：发布管线、运维类任务

## 依赖矩阵（简化版）

| 任务 | 依赖 | 说明 |
| --- | --- | --- |
| 配置存储 SQLite/JSON 同步 | 基础能力 | 需要先完成需求对齐与现状评估 |
| Transport 全量迁移与异步 | 基础能力 | 先统一需求口径与风险评估 |
| Transport MessagePort 升级 | Transport 全量迁移 | 先完成基础迁移，再引入高频通道 |
| TouchSDK hooks 迁移 | Transport 全量迁移（可选） | 若 SDK 依赖 transport 需先统一通道 |
| Download 内部可见性 | 基础能力 | 依赖统一需求与现状评估 |
| SearchLogger 生命周期修复 | 基础能力 | 与 storage readiness 相关 |
| App Indexing 周期对比 | 基础能力 | 若已完成仅保留回归检查 |
| Nexus examples 统一入口 | 基础能力 | 依赖需求归档与内容清单 |
| Nexus 官网首页整改 | Nexus examples 统一入口 | 依赖内容矩阵与文案清单 |
| 自动发布与 Nexus 同步 | 文档与执行顺序确认 | 依赖 release notes 结构统一 |
| 插件 CLI 精炼 | 基础能力 | 依赖 PRD 与需求模板 |
| Tuffex 组件 3/4/5/7/8 | 基础能力 | 依赖组件范围清单 |
| stash 弹出恢复 | 无 | 运维独立任务，可随时执行 |

## 推荐执行顺序（线性）

1. 配置存储 SQLite/JSON 同步  
2. Transport 全量迁移与异步  
3. Transport MessagePort 升级  
4. TouchSDK hooks 迁移  
5. Download 内部可见性  
6. SearchLogger 生命周期修复  
7. App Indexing 周期对比（回归）  
8. 插件 CLI 精炼  
9. Tuffex 组件 3/4/5/7/8  
10. Nexus examples 统一入口  
11. Nexus 官网首页整改  
12. 自动发布与 Nexus 同步  
13. stash 弹出恢复  

## 参考

- `apps/core-app/docs/requirements/requirements-grouping.md:1`
- `apps/core-app/docs/requirements/requirements-coverage.md:1`
