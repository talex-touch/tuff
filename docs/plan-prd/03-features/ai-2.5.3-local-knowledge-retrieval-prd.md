# PRD: Tuff 2.5.3 本地知识检索与上下文构建

> 更新时间：2026-05-16
> 状态：Planned / Direction Locked
> 目标版本：2.5.3

## 1. 最终目标

2.5.3 将本地知识检索作为 Tuff Intelligence 的独立能力线：用户可以把本地文档、网页摘录、插件知识与桌面上下文转换为可检索的结构化知识，并由 Context Builder 只把最相关片段送入模型上下文。

工程目标是先复用 SQLite / FTS5 / metadata 建立稳定本地索引，不把 embeddings 或向量数据库作为第一优先级；后续再把 `embedding.generate`、`search.rerank` 作为增强能力接入。

## 2. 产品方向

- 检索先于生成：先解决资料解析、分块、索引、过滤、引用与上下文拼接，再接入更重的语义召回。
- SQLite 为本地 SoT：`documents` / `chunks` / metadata / FTS5 作为 MVP 主路径。
- Hybrid search 分阶段落地：关键词 / FTS5 / metadata 先稳定，embeddings 和 rerank 后续增强。
- Context Builder 独立于模型运行时：本能力不依赖 2.5.5 本地模型 runtime，可服务 Nexus / 云端 / 本地模型。
- 输出必须可引用：回答使用的上下文片段要带来源、标题、路径/URL、chunk id 与时间信息。

## 3. 范围与非目标

### Stable 范围

- 本地知识 schema：`documents`、`chunks`、chunk metadata、来源类型、权限标签、时间戳与内容 hash。
- FTS5 全文索引：支持关键词、短语、前缀召回与 metadata 过滤。
- Context Builder：按 token 预算、来源去重、时间/权限过滤拼接上下文。
- 引用片段输出：检索结果和模型上下文都保留 source/chunk/citation metadata。
- 最近路径接入：优先服务 CoreBox AI Ask、Workflow `Use Model`、OmniPanel Writing Tools。

### Beta / Experimental

- Embeddings 语义召回：复用现有 `embedding.generate` capability，为 chunks 生成可选向量。
- Rerank：复用 `search.rerank` capability 对候选 chunk 重排。
- 权限图 / 引用图：记录文档之间的引用关系、插件来源与访问策略。
- Tantivy / HNSW / sqlite-vss：仅在 FTS5 + embeddings 应用层扫描不能满足规模和性能时评估。

### 非目标

- 不把上传即 embedding 即 vector db 作为 MVP。
- 不在 2.5.3 引入独立向量数据库服务。
- 不把模型权重、业务明文上下文或检索结果写入同步 JSON。
- 不实现 ASR、TTS、图片/音频/视频生成。

## 4. 接口方向

文档层面锁定后续实现接口，不在本 PR 直接改代码：

```ts
interface LocalKnowledgeEngine {
  indexDocument(input: IndexDocumentInput): Promise<IndexDocumentResult>
  indexChunk(input: IndexChunkInput): Promise<IndexChunkResult>
  search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult>
  buildContext(input: BuildContextInput): Promise<BuildContextResult>
}
```

MVP `search` 必须支持 query、limit、sourceType、timeRange、permissionScope 与 metadata filters；`buildContext` 必须支持 token budget、dedupe、citation 与 maxChunks。

## 5. 质量与安全约束

- Storage：SQLite 是唯一权威源；JSON 只允许密文同步载荷或引用。
- Security：权限标签必须在检索和 Context Builder 两层生效，禁止把无权限 chunk 拼入上下文。
- Runtime：检索失败必须返回明确 `unavailable/degraded + reason`，不得返回伪成功空上下文。
- Performance：索引、embedding 与 rerank 不得进入首屏 critical path；批处理必须有 backoff 与进度状态。
- Privacy：审计记录 source/chunk/provider/model/trace 等元数据，不记录完整业务明文。
- Transport：新增接口必须使用 typed transport / domain SDK，不新增 raw channel。

## 6. 验收清单

- [ ] 未配置 embeddings 时，FTS5 + metadata 检索可独立完成最近路径召回。
- [ ] Context Builder 可在 token budget 内返回带 citation 的上下文片段。
- [ ] 权限/来源/时间过滤在 search 和 buildContext 两层生效。
- [ ] embeddings / rerank 不可用时系统降级为关键词检索，并展示 degraded reason。
- [ ] 索引与检索性能有可观测日志，不阻塞 CoreApp 启动。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 7. 关联入口

- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地模型运行时：`./ai-2.5.5-local-model-runtime-prd.md`
- ASR Provider Runtime：`./ai-2.5.8-asr-provider-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
