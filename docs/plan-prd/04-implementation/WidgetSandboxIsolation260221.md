# Widget 沙箱隔离与持久化收口计划 (v1.0)

> 状态: 历史/待重写（部分能力已落地，当前不作为 2.4.9 主线）  
> 更新时间: 2026-03-16  
> 适用范围: CoreBox widget（renderer）+ 插件运行时沙箱  
> 替代入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`、`docs/plan-prd/01-project/CHANGES.md`

## 背景

Widget 运行在渲染进程中，若直接暴露浏览器全局能力（localStorage、cookie、BroadcastChannel 等），容易导致插件间数据串读与越权访问。近期已完成基础隔离与持久化，但仍需扩大拦截范围并形成可回滚的策略。

## 1. 最终目标（Final Goal / North Star）

- **业务目标**：插件 Widget 在 CoreBox 内运行时互不读取彼此数据，且自身数据可安全持久化（重启后可恢复）。
- **工程目标**：建立统一的 Widget 沙箱隔离层，阻断跨插件访问面，确保敏感数据不落地明文且可快速回滚。

## 2. 范围与非目标（Scope / Non-goals）

### 2.1 范围

- localStorage / sessionStorage / document.cookie 按插件隔离，并通过 secure storage 持久化 localStorage + cookie。
- BroadcastChannel / indexedDB / caches 命名空间隔离。
- window/self/top/parent/opener/document.defaultView 等逃逸入口拦截。
- 扩大拦截范围（阶段性）：
  - navigator.clipboard / navigator.storage
  - history / location / postMessage
  - serviceWorker / sharedWorker
- 对高风险调用增加限额（频次/大小）与告警，并可在后续移除。

### 2.2 非目标

- 不引入完整 JS VM 沙箱或 Node 级隔离。
- 不调整插件权限中心的模型与 UI，仅复用现有授权能力。
- 不改变插件加载/编译链路。

## 3. 质量约束（Quality Constraints）

- **类型安全**：仅使用已有 typed transport / SDK；禁止新增 raw event 字符串分发。
- **错误处理**：拦截失败不得导致 CoreBox 崩溃；必要时仅输出 warning 并回退。
- **性能预算**：拦截层调用开销 < 1ms；持久化写入采用节流（>= 250ms）。
- **安全与数据**：遵守 Storage/Sync 规则；敏感数据不得明文落地；总配额需可控（如 512KB）。
- **回归验证**：对现有插件 widget 不引入不可逆行为变化，必要时提供快速回滚开关。

## 4. 验收标准（Acceptance Criteria）

### 功能验收
- 不同插件的 widget 无法互相读取 localStorage / cookie / indexedDB / caches / BroadcastChannel 数据。
- 同一插件内 widget 的持久化数据重启后可恢复。
- widget 无法通过 window/self/top/parent/opener/document.defaultView 获取真实窗口对象。

### 质量验收
- typecheck/lint 通过（或记录既有失败项）。
- 触发超限时行为符合预期（拒绝写入 + warning，不破坏其他数据）。

### 文档验收
- README / TODO / CHANGES 已同步；必要时补充 Nexus 开发文档说明。

## 5. 回滚与兼容策略（Rollback / Compatibility）

- 提供沙箱隔离开关（默认开启），出现回归时可快速禁用并回退到旧行为。
- secure storage key 变更时不做强制迁移，保留旧数据但不依赖读取。

## 6. 实施计划

- [x] 基础隔离：localStorage/sessionStorage/cookie + secure storage 持久化。
- [x] 命名空间隔离：BroadcastChannel / indexedDB / caches。
- [x] 窗口逃逸拦截：window/self/top/parent/opener/document.defaultView。
- [ ] 扩展拦截：navigator.clipboard/storage、history、location、postMessage。
- [ ] Worker 相关隔离：serviceWorker/sharedWorker 注册入口拦截。
- [ ] 调用限额与审计：为高风险调用追加频控/计数，并记录 audit 入口。
- [ ] 回滚开关：增加统一的沙箱策略开关与临时白名单机制。

## 7. 风险与依赖

- 兼容性风险：部分插件可能依赖 window/top 或 history/location，需要灰度与白名单策略。
- 安全存储不可用：需明确降级行为与告警策略。
- 权限中心协同：后续需对接权限模型，防止绕过授权。

## 验收清单
- [ ] 功能验收：核心功能按场景通过
- [ ] 质量验收：typecheck/lint/test 通过（或明确既有失败项）
- [ ] 性能验收：关键指标在预算范围内
- [ ] 安全验收：敏感数据与权限路径符合规则
- [ ] 文档验收：README/PRD/TODO/Nexus docs 已同步
