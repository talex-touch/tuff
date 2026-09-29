# 实施与验收计划

## 1. Writer 与 CPU 预算

- [x] 把 `SearchIndexWriter` 改为 1 个 active、2 个 admitted waiters；后台最多占 1 个等待位。
- [x] 保留 paused-window self-write、drain 和 shutdown 语义。
- [x] 给 fullScan fused Worker 指标增加 CPU 时间差值。
- [x] 用 35% 单核占空比计算 fullScan 休眠，并保留 250 ms 协作暂停和慢批次退避。
- [x] 运行 Writer 和 fullScan insert 的 focused tests。

## 2. fd 扫描后端

- [x] 添加 `@prebuilt-binary/fd@10.4.2` 和 lockfile。
- [x] 在 FileScanWorker 内实现 NUL 流解析、有界 stat、共享过滤、取消和 legacy fallback。
- [x] 保持 500 条 batch ack，不让 stdout 无界领先。
- [x] Electron Builder unpack fd 平台包；after-pack 校验目标二进制。
- [x] 归档 fd 的 MIT 和 Apache-2.0 许可证。
- [x] 用换行、Unicode、空格、深度、排除、符号链接、取消和异常退出 fixture 对比 fd 与 legacy 集合。

## 3. 默认关闭的内容索引

- [x] 将 `contentIndexingEnabled: false` 加入唯一的 FileIndex 默认设置。
- [x] 为 typed fileIndex Settings SDK 增加 get/update 事件和共享类型。
- [x] 在 fullScan、watch side effect、resume 和 embedding 入口统一检查设置。
- [x] 开启时从现有 metadata 分页恢复，不重新扫描磁盘。
- [x] 禁用时停止 intake，清空正文、文件 embedding、progress 和 FTS content，保留 metadata。
- [x] 清理后等待 reader visibility 并发布一次 commit；失败时保持设置为开启。
- [x] 内容关闭时限制文件 FTS 搜索列，避免历史正文残留命中。

## 4. 设置界面

- [x] 在文件索引基础分组增加“索引文件内容”开关。
- [x] 开启时显示 FlipDialog，说明资源成本、正文读取和关闭清理。
- [x] 增加中英文文案、loading、失败 toast 和“内容补齐中”状态文案。
- [x] 复用 `TuffBlockSwitch`、`FlipDialog` 和现有按钮，不新增 UI primitive。

## 5. fzf 风格有界评分

- [x] 文件 Provider 先并行取得精确、前缀和 FTS；全空时按选择性 token → n-gram 分阶段召回，避免全表 subsequence 进入热路径。
- [x] 把候选集合限制在 120 条。
- [x] 对文件名和路径应用进程内 fzf 风格评分，并让精确/前缀分数保持更高优先级。
- [x] 新查询继续使用现有 AbortSignal，取消后不发布结果。
- [x] 用 150,000 条合成索引运行 warm 查询探针，记录 P95 和 Top-K 对照。

## 6. 质量检查与真实验收

- [x] 运行受影响的 focused Vitest。
- [x] 运行 `pnpm -C apps/core-app run typecheck:node`。
- [x] 运行 `pnpm -C apps/core-app run typecheck:web`。
- [x] 运行 scoped lint 和 `git diff --check`。
- [x] 启动隔离 Electron，确认 fresh profile 默认关闭、确认弹窗、取消不落盘、启用后补齐和禁用后清理。
- [x] 查询隔离 SQLite，确认正文、embedding、progress、metadata 和配置 revision。
- [x] 在 100,000 文件 fixture 上采样 5 秒窗口 CPU、event-loop lag、RSS 和磁盘写入。
- [x] 构建 unpacked macOS arm64 app，验证 fd 资源路径、权限、版本、取消和 fallback。
- [x] 更新任务 PRD、搜索审计 backlog 和主进程规范中的已验证事实。未验证平台明确保留为缺口。

## 停止条件

如果 packaged `fd` 无法从签名资源定位，或 fd 与 legacy walker 的最终文件集合不一致，就保留 legacy walker 为默认并停止 fd 上线。不能通过放宽过滤、深度、符号链接或 root completion 语义换取速度。

如果正文清理无法在单写者和 mutation lease 内完成，就不暴露设置开关。不能把“UI 显示关闭、旧正文仍可搜索”作为降级路径。
