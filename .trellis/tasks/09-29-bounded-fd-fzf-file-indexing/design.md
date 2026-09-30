# fd、fzf 与内容索引的技术设计

## 目标

本任务在现有文件索引体系内完成四项改造：限制 SearchIndex Writer 的入场容量；用随应用打包的 `fd` 枚举全量扫描；让文件名和路径使用有界的 fzf 风格评分；把正文读取改成默认关闭的用户选项。

实现继续复用现有单写者、mutation lease、checkpoint、watch、过滤器和 typed Settings SDK。新实现不增加第二套索引数据库，也不把文件操作交给外部 CLI。

## 数据流

### 基础索引

```text
watch roots
  → FileScanWorker
  → bundled fd（可用时）
  → NUL 路径流
  → Tuff 共享目录/文件过滤器
  → 有界 stat 池
  → 500 条 batch + ack
  → fullScan fused persistence + FTS
  → scan_progress checkpoint
```

`fd` 只枚举路径。Tuff 继续决定深度、排除项、符号链接、路径规范化和最终准入。`fd` 启动失败或异常退出时，同一次扫描改走现有 walker。已发布的重复 batch 由主键 upsert 收敛；root completion 只在 fallback 完成后写入。

### 正文索引

```text
contentIndexingEnabled
  false → metadata 写入结束，不调 parser，不生成 embedding
  true  → metadata commit → durable pending → bounded enrichment
       → files.content + search_index.content + optional embedding
```

开启时直接分页读取现有 `files` 和 `file_index_progress`。关闭时先阻止新 enrichment，再取消等待批次并排空已提交工作。随后在 source mutation lease 内清空正文、文件 embedding、正文进度和 FTS content。最后发布一次文件源 commit。

### 搜索

```text
精确 keyword / prefix / FTS
  → 全空时：选择性数字/字母 token FTS → n-gram recall
  → 最多 120 个已准入文件候选
  → filename/path fzf-style scorer
  → 精确、前缀和现有业务分数仍优先，最多返回 50 个文件
```

fzf 风格评分在进程内运行。评分考虑连续字符、词边界、路径分隔符和 gap 惩罚。它不启动查询子进程，也不复制完整文件语料。文件热路径不再并行执行 `lookupBySubsequence`：该查询在 4,036,303 条 keyword rows 上会把 warm P95 推到 1.2 s。精确/FTS 全空时先用数字或字母 run 做选择性 FTS，再用最多 8 个 n-gram seed 的复合索引等值查询提供 typo 与非连续字符候选。150,000 行、无 `sqlite_stat1` 的最终实测为 median 1.36 ms、P95 32.20 ms、max 37.03 ms。

## 关键合同

### Writer admission

`SearchIndexWriter` 同时只运行 1 个物理写请求。内部 admission 队列最多保留 2 个请求，其中后台请求最多占 1 个等待位。超出容量的生产者等待共享 capacity pulse，不进入 Worker pending map。

队列优先调度普通写入，再调度后台写入。fullScan 和 enrichment 标记为后台；watch、checkpoint、reset、设置清理和 shutdown 保持普通或控制优先级。

`withPausedAdmission` 保留现有 AsyncLocalStorage 自写绕行。暂停期间不启动外部排队请求。暂停持有者可在 active 槽空闲时直接写入。关闭会拒绝 admission 队列，并唤醒所有等待 capacity 的调用方。

### CPU 配额

fused fullScan Worker 优先用 `process.threadCpuUsage()` 返回每批线程 CPU 差值；旧运行时没有该 API 时才回退 `process.cpuUsage()`。节流器以 35% 单核占空比计算最小休眠：

```text
required period = worker CPU time / 0.35
sleep = max(0, required period - batch wall time)
```

最终休眠取 CPU 配额、250 ms 协作暂停和慢批次退避三者最大值。该配额只用于 fullScan；watch、设置清理和退出不经过它。200 ms 的 production-like 10k pilot 为 median 55.75%，未达 50% 门槛；250 ms pilot 降至 median 37.56%、P95 67.74%，因此生产值取 250 ms，不用开发态 DevTools 样本定标。

100,000 行 packaged 长跑的有效窗口为 median 36.60%、P95 40.44%，峰值 RSS 1,447.34 MiB。机器休眠后的 lag 被 perf 诊断归到系统恢复或 `storage.polling`；10k 清醒 pilot 没有慢 event-loop 日志。扫描结束后，带 CDP 的进程组 idle median 为 26.74%；无 CDP 静默启动样本反而为 50.05%。后者分解为 GPU 26.59%、主 renderer 16.83%、第二 renderer 3.19%、main 1.29%，索引 Worker 全部 offline。实现满足扫描 CPU 预算，不能把既有渲染/GPU idle 基线写成索引已解决。

### fd 生命周期

`@prebuilt-binary/fd@10.4.2` 是普通运行时依赖。平台包由它的 optional dependencies 解析。生产代码只解析包内二进制，不读取用户 PATH，也不下载文件。

调用参数固定为文件类型、hidden、no-ignore、absolute-path、NUL 输出、无颜色、不跟随符号链接、最大深度和 1 个 fd 搜索线程。Tuff 侧 metadata 检查并发为 2。测试环境可以显式注入 fixture 二进制。

stdout 按 NUL 增量解析。每批路径经过共享过滤器和有界 stat 池，再等待现有 batch ack。取消会终止子进程、关闭 pipe 并等待退出。stderr 只转成计数和稳定错误码，不记录用户路径。

开发态与 packaged app 都从依赖包解析二进制。上游平台包安装后的文件模式实测不可执行，所以 CoreApp postinstall 会修复当前平台的 executable 位；after-pack 在签名前再次修复并校验。Electron Builder 必须 unpack 平台包，使 `spawn` 获得真实文件路径。resolver 把 `app.asar` 路径幂等映射到 `app.asar.unpacked`；file-scan Worker 只能引用 worker-safe 的 traversal/path 模块，不能通过 `files/utils.ts` 拉入 Electron。after-pack 同时校验 MIT 与 Apache-2.0 许可证。

### 设置与失败语义

共享事件类型只暴露 `contentIndexingEnabled` 和内容索引状态。主进程拥有默认值 `false`。历史配置缺字段时也解析为 `false`，并写回规范化配置。

启用顺序：先用 `saveMainConfigDurable` 保存 `true`，成功后再启动 existing-row resume。禁用顺序：暂时抑制 enrichment，完成清理和可见 commit，再用 durable 保存写入 `false`。清理或 durable 保存失败时继续保留 `true`，恢复 enrichment，并把错误返回设置页。

设置页只做镜像。开启先显示中英文确认，说明正文读取、资源消耗、隐私范围和关闭清理。取消确认不发设置更新。关闭不需要第二次确认，但要显示 loading 和失败 toast。

## 兼容与回退

- macOS arm64、Linux x64/arm64、Windows x64/arm64 使用预编译 `fd` 平台包。
- 缺少平台包、二进制不可执行、spawn 失败或进程异常退出时回退 legacy walker。
- 当前依赖没有 macOS x64 平台包；macOS x64 明确走 legacy walker，不能标记为 fd 验收通过。
- FTS 查询默认保持包含 content。文件 Provider 在内容索引关闭时使用排除 content 的列过滤，避免历史残留正文命中。
- 没有数据库 schema 变更。升级和回滚都使用现有表。

## 可见性与一致性

内容清理使用 SearchIndex Writer 的单写连接。清理后通过 SourceScopedIndexWriterRouter 的公开提交入口执行 reader visibility barrier，再推进 commit revision。打开的 CoreBox 通过现有 index-committed 通知刷新。

扫描期间 watch 继续记录增量。fd snapshot 和 watcher 共用根目录、深度常量、路径规范化与最终过滤器。根完成标记仍由 fullScan run service 写入。

## 回滚

回滚源码即可恢复 legacy walker、原评分和原 enrichment 行为。新增设置字段留在 JSON 中不会破坏旧版本。数据库清理只删除可重建的正文、embedding 和 progress，不删除 metadata 或用户文件。
