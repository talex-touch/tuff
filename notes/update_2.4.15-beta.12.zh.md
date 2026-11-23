# Tuff v2.4.15-beta.12 更新说明

## 摘要

- 搜索索引存储瘦身与稳定性修复：退役未使用的关键词与元数据索引、清理冗余扩展属性及孤立/过期文件向量，并修复 `SQLITE_BUSY` 永久锁死、查询后退出超时与维护任务缺乏退避的问题。
- OMP CLI 运行时接入：`profile:cli:omp` 正式接入基于 ACP 的 `OmpAgentRuntimeHost`，支持活动 MCP 服务配置传递与对话工作区实时文本/推理增量流。
- 桌面端弹窗彻底收敛与生命周期加固：移除最后 4 个 CoreApp 遗留弹窗封装并全面统一至 TuffEx 弹窗组件，修复叠加模糊快照、样式覆盖、按钮重复点击与外部注销残留问题。
- Nexus 服务端 Worker 体积优化与 CI 门禁：精简 `client.precomputed.mjs` 清单并从 SSR Worker 中剥离图表分块，Worker 可执行 gzip 体积降至 2.35 MiB 并在 CI 中强制校验预算。
- 依赖与工程安全基线更新：升级 `vue-router` 至 `^5.5.0`、`@electron/asar` 至 `^4.3.2`、macOS 原生 crate `objc2` 至 `=0.6.5` 及多项安全 Cargo/ESLint/GitHub Actions 依赖，并续期审计白名单与豁免项。

## 变更内容

- 搜索索引存储清理与迁移预检完善：停止创建并异步退役零调用的关键词与元数据 SQLite 索引，将 `search_keyword_postings` 纳入迁移预检与分库拓扑校验；停止写入未读取的 `file_extensions.keywords` 记录，启动维护阶段按有界分批清理历史残留与孤立/切换模型后的过期文件向量，并确保文件索引清理在分库写入模式下遵循 fail-closed 路由。
- 搜索运行时稳定性修复：将 `SQLITE_BUSY` 瞬时扫描失败识别为可重试降级而非永久故障锁死，避免后续监听与重建被跳过；`core-box:search:query` 推送改用面向调用方的单向通知，消除查询后退出时的 8 秒 `before-quit` 超时；为 `IndexMaintenanceRunner` 补充指数退避机制以抑制连续失败重试风暴。
- `profile:cli:omp` 接入 `OmpAgentRuntimeHost`：`AiCliOrchestrator` 在 `profile:cli:omp` 调度配置下路由至 `OmpAgentRuntimeHost` 与 `OmpAcpClient`，支持只读桥接当前启用的 MCP 服务配置、实时文本与推理增量输出以及超时/取消/中断控制，同时继续严格遵守调度器决定执行器的隔离约束。
- CoreApp 遗留弹窗移除与 TuffEx 弹窗加固：删除 `TBlowDialog`、`TBottomDialog`、`TPopperDialog`、`TouchTip` 四个遗留封装，全部收敛至 `@talex-touch/tuffex/dialog`；为叠加 `TxBlowDialog` 增加 `#app` 模糊快照引用计数并保留无关内联样式，防重入保护按钮加载态与定时器清理，并在 `DialogManager` 外部注销时彻底卸载 DOM 容器。
- Nexus Cloudflare SSR Worker 体积治理：重写 `client.precomputed.mjs` 裁剪逻辑以移除不可达的演示组件与静态资源键，通过 `import.meta.server` 边界将 `@talex-touch/tuffex/charts` 移出 SSR Worker，使 Worker 可执行 gzip 体积降至 2.35 MiB（预算上限 2.70 MiB），并在 CI 中接入阻塞式体积预算检查。
- 依赖与 CI 维护升级：在应用与插件中将 `vue-router` 升级至 `^5.5.0`，升级 `@electron/asar` 至 `^4.3.2`、`packages/tuff-native` 的 `objc2` 至 `=0.6.5` 以及 `napi`/`serde_json`/`tokio` 与 `@electron-toolkit/eslint-config-prettier`；续期 Electron 生产审计白名单与 `json-formatter` 安全豁免，更新 GitHub Actions 版本并为 `apps/tuff-analyse` 补齐包级 lint 脚本。
