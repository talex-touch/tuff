# 使用 fd + fzf 的有界文件索引与可选内容索引

## Goal

把 Tuff 文件搜索拆成默认低成本的“文件名与路径索引”和用户明确选择的“文件内容索引”。使用 `fd` 加速并约束初始文件枚举，使用 fzf 兼容的路径模糊匹配提升文件名召回，同时为扫描、持久化、FTS 写入和内容解析建立端到端硬背压。默认状态不得持续占满一个 CPU 核心，也不得在用户不知情时读取文件正文。

## User Value

- 安装或升级后，Tuff 能先以可预测的资源占用提供文件名、路径、类型和时间等基础搜索。
- 只有用户理解高 CPU、内存、磁盘读取和索引体积风险并主动确认后，才读取并索引文件正文。
- 初次扫描、增量更新和内容补齐不能通过无界队列拖慢 CoreBox、设置保存、退出或其他交互路径。
- 文件名模糊搜索获得接近 fzf 的容错和排序体验，但继续保留 Tuff 的权限、过滤、元数据、操作和结果协议。

## Confirmed Facts

- 签名 `2.4.14-beta.53` 在 clean profile 上扫描 30 分钟仍未完成；进程组 CPU 平均 109.3%，最后 5 分钟 98.9%，产生 10.8 GiB 写入。上一轮已在当前工作树修复冷插入 FTS 的 O(N²) 删除探测，但已安装 beta.53 不包含该修复。
- 改造前的正常 fullScan fused 写链逐批 `await`，AIMD 批大小为 2–10，每批至少协作暂停 100 ms；SearchIndex Worker 物理执行并发为 1。内容 enrichment 为 `maxInFlight=1`、`maxPendingBatches=2`。
- `SearchIndexWriter` admission、worker client pending map 和 worker 内部队列仍无全局硬容量；多个生产者可以在串行 Worker 前积压。
- 当前内容 enrichment 会读取文件、调用 parser、最多持久化约 200k 字正文，并更新 FTS；用户设置里没有独立的内容索引开关。
- `FileIndexSettings` 是主进程拥有的设备本地配置。Settings SDK 已存在 typed `fileIndex` domain，不需要新增 raw IPC。
- `fd` 是 MIT OR Apache-2.0 的 Rust 文件枚举 CLI，支持绝对路径、NUL 分隔、类型/深度/排除规则、线程上限和流式输出。它默认使用自己的 hidden、ignore 和并行策略，不能直接作为 Tuff 的过滤真相。
- `fzf` 是 MIT 的 Go 模糊查找工具。它适合对候选文本做高速模糊匹配，但其终端 UI、shell action 和默认 walker 不属于 Tuff 产品边界；将完整文件全集在每次按键时重新传给一个 CLI 进程不可接受。

## Product Decisions

- **D1 — 基础索引始终开启：** 文件名、绝对路径、扩展名、大小和时间等元数据继续由 Tuff 索引，保证默认即可搜索本地文件。
- **D2 — 内容索引默认关闭：** 新 profile 以及缺少该字段的历史配置均解析为关闭。关闭状态不得读取正文，不得生成文件内容 embeddings。
- **D3 — fd 只负责枚举：** Tuff 继续拥有根目录、深度、排除、权限、规范化、checkpoint、watch 和最终准入语义。
- **D4 — fzf 只负责有界候选的路径模糊匹配（已确认）：** 不承载终端 UI，不执行文件操作，不成为业务数据源，不覆盖精确/前缀/语义等既有搜索优先级。
- **D5 — 资源安全优先于首扫完成时间：** 可以让冷扫描更久，但不能用持续单核占用、无界内存或交互卡顿换吞吐。

## Requirements

### R1 — 全局硬背压

- SearchIndex Writer 在向 Worker 提交前必须有统一 admission 容量；物理执行最多 1 个请求，最多保留 2 个等待请求。
- 必须为 reset、shutdown、checkpoint 和实时 watch 增量保留前进能力；后台 fullScan、enrichment、backfill 和 cleanup 不能提前灌满 Worker 队列。
- 达到容量时生产者必须等待、合并或保持 durable deferred，不能丢写入，也不能继续堆积内存 Promise。
- pause、drain、shutdown 和 paused-window self-write 语义保持成立；关闭必须拒绝并唤醒所有等待者。

### R2 — 可度量的后台 CPU 预算

- metadata fullScan/FTS 后台写入必须按 Worker 实际线程 CPU 时间执行 duty-cycle 限速，而不是只依赖固定 sleep 或批次数。
- 参考目标为滚动 5 秒窗口内不超过单核 35% 的后台 CPU 配额；单次不可抢占的数据库操作仍必须通过批次 AIMD 控制在有界时间内。
- 限速不能作用于用户发起的实时 watch 增量、设置开关控制操作或退出清理。

### R3 — fd 流式文件枚举

- fd 必须随应用按受支持的 OS/arch 打包、校验和签名；生产环境不依赖用户的 PATH 或系统安装。
- 调用必须固定为文件类型、绝对路径、NUL 输出、无颜色、不跟随符号链接，并显式设置最大深度和线程硬上限。首选线程数通过 1 与 2 的 A/B 决定，生产硬上限为 2。
- 为避免 fd 默认 ignore 语义改变搜索覆盖，Tuff 必须显式接收 hidden/no-ignore 输入，再使用唯一的共享过滤器做最终准入；条件性目录规则仍由 Tuff 判断。
- stdout 必须流式消费；stat 并发与待发布批次数必须有界。现有 500 条 batch acknowledgement 继续向 fd 子进程传播背压。
- AbortSignal、退出和 root 切换必须终止子进程并回收 stdout/stderr；fd 缺失、启动失败、非零退出或不支持的平台必须回退现有 walker，不能得到部分成功快照。

### R4 — fzf 兼容的文件名与路径模糊匹配

- fzf 匹配只作用于 Tuff 已准入、已归属到当前 provider、数量有上限的候选集。
- 不允许每次按键启动 fzf 进程，不允许每次按键把完整文件全集重新复制给 fzf，也不允许暴露 fzf TUI、shell、preview 或 execute 能力。
- 精确匹配、短语、前缀和现有业务排序信号继续优先；fzf 分数只能作为文件名/路径 fuzzy 阶段的排序信号。
- 新查询必须取消或废弃旧查询，旧结果不得覆盖当前 CoreBox 会话。
- 最终实现可以复用经许可证核验的 fzf 匹配算法或等价的长期驻留 native scorer；具体技术形态由后续 `design.md` 在基准后确定。

### R5 — 内容索引设置

- 文件索引设置新增设备本地布尔项 `contentIndexingEnabled`，规范默认值为 `false`；主进程、设置读取、历史配置归一化和所有直接消费者必须使用同一默认源。
- 设置页在文件索引区域展示“索引文件内容”开关，并明确说明：会读取支持的本地文件正文，显著增加 CPU、内存、磁盘读取和索引体积；配置较低或不需要正文搜索时不要开启。
- 开启不能由一次普通误触立即生效，必须经过显式高资源确认；确认文案同时说明隐私范围和关闭后的清理行为。
- 中英文文案进入现有 `settings.settingFileIndex` catalog；控件复用现有设置行、switch 和确认对话框，不新增一套视觉原语。

### R6 — 关闭内容索引时完全停止正文处理

- fullScan、watch、resume 和 schema/backfill 路径均不得向 parser/enrichment Worker 调度正文任务。
- 文件名、路径、扩展名、时间、大小、图标和基础 FTS 搜索保持可用。
- fullScan 与 enrichment 阶段隔离：fullScan 活跃时只允许记录 durable pending；只有 fullScan 完成、暂停或取消并释放扫描 lease 后才允许恢复正文补齐。

### R7 — 开启时从已有元数据补齐

- 开启后直接分页读取现有 `files` 行并恢复 pending enrichment，不得为了内容索引重新枚举整棵磁盘目录。
- 补齐遵守全局 admission、CPU 配额、文件大小/类型过滤、取消和 checkpoint 语义。
- UI 必须能区分“基础索引完成”和“内容补齐中”，不能把高资源后台工作伪装成已完成。

### R8 — 禁用时清除已索引正文

- 禁用必须先阻止新正文任务，取消尚未执行的 enrichment，等待或安全终止已提交批次。
- 在 source mutation lease 内清空 `files.content`、文件内容 embeddings 和 `file_index_progress`，并通过单次有界 writer 操作清空 `search_index.content`；不得删除文件 metadata 行或重新枚举磁盘。
- 清理完成后发布一次可见的 index commit，使已打开的 CoreBox 不再返回正文命中。
- 清理失败时设置不能显示为成功关闭；必须给出可重试错误，并保持能够继续完成清理的 durable 状态。

### R9 — 覆盖与实时一致性

- fd snapshot 与现有 watcher 必须共享 roots、最大深度、路径规范化和最终过滤政策。
- 在扫描期间发生的新增、修改、重命名和删除必须通过现有 watch/reconcile 高水位机制最终收敛。
- 文件路径中的换行、非 ASCII、空格、符号链接、权限拒绝和超长路径不能破坏 NUL 协议或导致扫描挂死。

### R10 — 打包、许可与回退

- 归档 fd 的 MIT/Apache-2.0 许可文本、版本和来源；若复用 fzf 代码或打包其二进制，同时归档 fzf MIT 许可和版权声明。
- packaged app 必须从签名资源定位二进制；asar 内路径、开发态覆盖和不受支持平台的 fallback 都要有明确诊断。
- 不得静默下载二进制，不得运行用户 PATH 中同名程序，不得让环境变量覆盖进入正式默认路径；测试覆盖可以使用显式环境变量注入。

## Acceptance Criteria

- [x] **AC1 / R5:** fresh profile 与缺少字段的历史配置都显示内容索引关闭；显式 `true/false` 往返保存后保持原值，重启不漂移。
- [x] **AC2 / R5:** 开启操作展示中英文高资源与隐私确认；取消不写配置、不读取正文，确认后才进入内容补齐状态。
- [x] **AC3 / R6:** 内容索引关闭时，对包含可解析文档的隔离目录完成 fullScan；parser/read 调用为 0、`files.content` 为空、文件 embeddings 为 0、enrichment Worker 无活动批次，同时文件名与路径查询仍返回正确文件。
- [x] **AC4 / R7:** 在已有 metadata 数据库上开启内容索引，不调用目录枚举；支持的文件正文被分页补齐，取消/重启后从 durable progress 恢复。
- [x] **AC5 / R8:** 从已有正文索引切换为关闭后，不丢失 metadata 行；`files.content`、文件 embeddings、正文 progress 和 FTS content 均清空，旧正文查询不再命中，路径查询仍命中。
- [x] **AC6 / R1:** 压力探针同时提交 fullScan、watch、checkpoint 和 maintenance 写入时，Worker 侧始终最多 1 active，admission 等待最多 2；实时增量不会被后台队列无限期阻塞，pause/self-write/shutdown 均有界结束。
- [ ] **AC7 / R2:** Apple Silicon 参考机 clean-profile metadata-only 100k 扫描的 5 秒进程组采样达到 median ≤50%、P95 ≤80%，没有可归因于索引的 >250ms 主线程 event-loop lag；扫描结束后空闲 CPU 回到 ≤5%。任何未满足项必须按实测报告，不能用较小 fixture 代替。
  - 2026-09-29 packaged arm64 实测完成 100,000 行：有效 5 秒窗口 CPU median 36.60%、P95 40.44%，峰值进程组 RSS 1,447.34 MiB；250 ms 的 10k 无休眠 pilot 为 median 37.56%、P95 67.74%，扫描期间没有单核饱和。
  - 本机在长跑中多次系统休眠；恢复后的 >250 ms lag 诊断指向系统恢复或 `storage.polling`，10k 清醒 pilot 无 `Perf:EventLoop` 慢日志，未发现索引写批本身阻塞主线程的证据。
  - **AC7 保持未勾选**：扫描结束后，带 CDP 的 60 秒 idle CPU median 26.74%、P95 31.70%；另一次无 CDP、静默启动 packaged 样本为 median 50.05%、P95 55.56%。无 CDP 的 10 秒分解为 GPU 26.59%、主 renderer 16.83%、第二 renderer 3.19%、main 1.29%，文件扫描/解析 Worker 均 offline；这是现有渲染/GPU 基线，不在本任务内伪装成索引通过。
- [x] **AC8 / R3/R9:** 相同合成树上 fd 与 legacy walker 的最终准入文件集合、深度边界和过滤结果完全一致；新增/重命名/删除最终收敛。fd 失败或中途退出不会发布部分 root completion，并能由 legacy walker 完整恢复。
- [x] **AC9 / R3:** fd 扫描期间内存中的未确认路径不超过既定 batch/stat 上限；取消后子进程、pipe、Worker 和临时状态全部释放。
- [x] **AC10 / R4:** 150k 文件规模下，fzf fuzzy 阶段不启动 per-query 子进程、不复制完整语料，warm P95 在 CoreBox 80ms fast window 内；精确/前缀基准结果不降级，路径 typo/非连续字符基准的 Top-K 质量不低于现有实现。
- [x] **AC11 / R10:** source-built Electron 与至少一个签名 macOS arm64 包验证 fd 资源定位、版本、许可、取消和 fallback；Windows/Linux 未实测的平台必须明确标注，不能外推通过。
  - 本地 Developer ID 签名副本 `codesign --verify --deep --strict` 通过，Team ID `2L5YC85FQ7`；签名包内 `fd 10.4.2` 真正完成首扫（日志 `backend: fd`）。真实 watcher 收敛：add 1,158 ms、rename 850 ms、delete 423 ms。
  - 本轮没有公证，`spctl` 对手工签名副本报告 `Unnotarized Developer ID`；这不是发布验收。Windows/Linux 和 macOS x64 未实测，macOS x64 在当前预编译包版本明确回退 legacy walker。
- [x] **AC12:** focused tests、CoreApp node/renderer typecheck、scoped lint、`git diff --check` 通过；真实 Electron 设置页确认文案、落盘 revision、开关后的索引数据库状态均已验证。
  - 最终 focused 集合 21 files / 234 tests 通过；补充 packaged worker/runtime-copy 3 files / 24 tests 通过。node typecheck、renderer typecheck、scoped ESLint、`build:vite` 和 `git diff --check` 均通过。
  - 最终修正复跑：CoreApp 10 files / 177 tests、Utils 2 files / 15 tests 全通过；node/web typecheck、两组 scoped ESLint、`build:vite`、`git diff --check` 通过。真实 bundled `fd` 对 4,120 个独立目录执行扫描，在遍历缓存超过 4,096 上限后仍正确准入 4,119 个文件、排除指定目录且 `errorCount=0`；运行烟测同时覆盖非有限 CPU 指标、Unicode 大小写边界和整体进度投影。

## Out of Scope

- 替换 CoreBox UI 为 fzf 终端界面，开放 fzf shell/preview/execute 行为，或让 fzf 直接打开文件。
- 使用 fd/fzf 取代 Tuff 的权限、过滤、provider、watch、checkpoint、结果对象和操作协议。
- 配置真实 embedding Provider 后的向量生成与 semanticRecall 命中验收；本任务只保证正文索引默认关闭、显式开启及关闭清理生命周期。
- 发布 Beta、修改自动更新策略、删除用户文件或清空文件 metadata 索引。
- 为追求首扫速度重新提高无界并发，或取消已经验证的 250 ms 协作让出与 ordered publication。
