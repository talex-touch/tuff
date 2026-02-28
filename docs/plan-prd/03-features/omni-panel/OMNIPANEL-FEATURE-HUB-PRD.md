# OmniPanel Feature Hub PRD（260223）

> 状态：进行中（Wave-1~Wave-4 已落地，Wave-5 文档台账推进中）  
> 更新时间：2026-03-01  
> 适用范围：`apps/core-app` / `packages/utils`

---

## 1. 最终目标（Final Goal / North Star）

### 业务目标
1. 将 OmniPanel 从“固定 4 个快捷动作”升级为“可执行插件 Feature 的全景操作面板”。
2. 用户在任意应用选中文本后，可在 OmniPanel 一次完成“翻译/搜索/插件能力执行”。
3. 新装插件后（开启选项时）自动把首个可执行 Feature 装载到 OmniPanel，降低首次使用门槛。

### 工程目标
1. OmniPanel 的 Feature 执行链路复用现有插件触发通道，避免新增并行执行体系。
2. 配置、事件、类型定义保持单一来源，避免主进程/渲染层协议漂移。
3. 关键链路具备可观测性（耗时、失败原因、来源），可灰度、可回滚。

---

## 2. 范围与非目标（Scope / Non-goals）

### 本期范围（Scope）
1. 新增“通用设置”项：安装插件后自动装载首个 Feature 到 OmniPanel。
2. OmniPanel 支持 Feature 列表展示、搜索与执行（包含内置动作 + 插件动作）。
3. 文本上下文透传：选中文本可直接作为 Feature 输入（例如自动翻译）。

### 非目标（Non-goals）
1. 不替换 CoreBox 搜索引擎，不把 OmniPanel 变成 CoreBox 全量替代。
2. 不在本期实现复杂工作流编排（多步骤串联、条件分支、历史回放）。
3. 不在本期改动插件 Manifest 规范（优先兼容现有 Feature 定义）。

---

## 3. 用户故事与目标行为

1. **安装后即用**：用户安装插件后，如果开启“自动装载首个 Feature”，OmniPanel 立刻出现该插件可执行入口。  
2. **上下文执行**：用户在外部应用选中文本，触发 OmniPanel，点击“翻译”或插件 Feature 即可执行。  
3. **统一入口**：用户不需要先打开 CoreBox，再找插件功能；OmniPanel 可直接承接高频操作。

---

## 4. 方案设计（已定）

### 4.1 设置项落地（通用设置）

### 新增配置
- `appSetting.omniPanel.autoMountFirstFeatureOnPluginInstall: boolean`
- 默认值：`false`（避免改变现有用户行为）

### UI 位置
- `SettingSetup`（通用设置）新增开关项：  
  - 标题：安装插件后自动装载首个 Feature 到 OmniPanel  
  - 描述：启用后，安装成功的插件会把首个可执行 Feature 自动加入 OmniPanel

### 存储
- 路径：`app.omniPanel.autoMountFirstFeatureOnPluginInstall`
- 仍通过现有 `StorageEvents.app.save` 持久化。

---

### 4.2 OmniPanel Feature Hub 模型

### 数据模型（建议）
```ts
interface OmniPanelFeatureItem {
  id: string
  source: 'builtin' | 'plugin'
  pluginName?: string
  featureId?: string
  title: string
  subtitle?: string
  icon?: string
  acceptedInputTypes?: string[]
  pinned?: boolean
  createdAt: number
  updatedAt: number
}
```

### 来源
1. **builtin**：翻译、网页搜索、复制、CoreBox 搜索等内置动作。  
2. **plugin**：从插件 Feature 映射而来，可由安装自动注入或手动管理。

### 存储策略
- 本地 SoT：SQLite（或已有主配置持久化结构），禁止 JSON 明文旁路。
- 同步策略沿用现有 app setting / storage 通道，不新增跨端同步协议。

---

### 4.3 安装后自动装载首个 Feature

### 触发时机
- 监听 `PluginEvents.install.completed` 且 `status === 'success'`。

### 处理流程
1. 读取新设置开关；关闭则直接返回。  
2. 读取安装插件对象，筛选“可执行 Feature”（排除不可触发或纯配置项）。  
3. 选择第一个符合条件 Feature，写入 OmniPanelFeatureRegistry。  
4. 广播 OmniPanel 刷新事件（仅刷新，不自动弹窗）。

### 幂等与去重
- 唯一键建议：`pluginName + featureId`。  
- 已存在时只更新时间戳，不重复插入。

---

### 4.4 执行链路（类似 CoreBox，但聚焦快速动作）

### 原则
- **复用现有插件触发能力**，不新建第二套“插件执行引擎”。
- 主进程统一做 Feature 解析与安全校验，渲染层只负责交互与展示。

### 链路
1. OmniPanel 渲染层点击 Feature。  
2. 发送 `omni-panel:execute-feature`（typed event）。  
3. 主进程按来源分发：
   - builtin：执行内置 handler；
   - plugin：调用现有 `PluginEvents.api.triggerFeature` 对应能力。
4. 返回执行结果与错误码，渲染层展示成功/失败反馈。

---

### 4.5 上下文注入（选中文本 -> Feature 输入）

### 输入规则
- 统一注入 `TuffQuery`：
  - `text`: 捕获的选中文本
  - `inputs`: 至少包含 `text` 输入项（后续可扩展 image/files/html）

### 示例场景
1. 选中英文段落 -> OmniPanel -> 点击“快速翻译”。  
2. 选中 bug 日志 -> OmniPanel -> 点击插件“总结错误”Feature。  
3. 选中命令片段 -> OmniPanel -> 点击插件“命令解释”Feature。

### 兜底
- 无选中文本时，Feature 仍可执行，但标记 `hasSelection=false`，由 Feature 自行降级处理。

---

## 5. 质量约束（Quality Constraints）

1. **类型安全**：新增事件必须走 typed transport event；禁止裸字符串 IPC。  
2. **错误处理**：Feature 执行失败必须返回标准错误结构并给出用户可见提示。  
3. **性能预算**：  
   - 热启动显示：`< 120ms`  
   - 上下文注入 + 首次可交互：`< 300ms`  
4. **回归约束**：不影响现有 CoreBox 搜索/插件安装流程。  
5. **安全约束**：遵守现有权限中心策略，插件 Feature 执行不得绕过权限校验。

---

## 6. 验收标准（Acceptance Criteria）

### 功能验收
- [x] 通用设置开关可见、可持久化、重启后生效。
- [x] 开关开启时，安装插件后首个 Feature 自动出现在 OmniPanel。
- [x] OmniPanel 可执行 builtin + plugin Feature。
- [x] 选中文本可作为输入透传到 Feature（含翻译场景）。

### 质量验收
- [x] `typecheck:node` / `typecheck:web` 通过。
- [x] OmniPanel 相关新增单测覆盖：注册、去重、执行分发、无选中文本降级。
- [x] 执行失败有统一错误提示，不出现 silent failure。

### 文档验收
- [x] `README.md` / `TODO.md` / `docs/INDEX.md` 已同步 OmniPanel 条目。
- [x] 本文档与实现范围一致，无过期描述。

---

## 7. 回滚与兼容策略（Rollback / Compatibility）

1. 通过设置开关快速停用“安装后自动装载 Feature”。  
2. OmniPanel FeatureHub 入口支持主进程级别 feature flag（必要时可全量关闭）。  
3. 即使 FeatureHub 关闭，OmniPanel 仍保留当前内置动作能力，不影响基本可用性。  
4. 不变更现有插件 Manifest 字段，确保旧插件不需要改包即可兼容。

---

## 8. 实施拆解（建议顺序）

1. **M1 配置与事件**：新增设置项、事件协议、主进程安装后注入逻辑。  
2. **M2 面板能力**：OmniPanel 列表渲染、Feature 执行分发、失败提示。  
3. **M3 上下文增强**：选中文本注入、执行耗时日志、灰度开关与回归测试。

---

## 9. 受影响代码（预估）

- `packages/utils/common/storage/entity/app-settings.ts`
- `apps/core-app/src/renderer/src/views/base/settings/SettingSetup.vue`
- `apps/core-app/src/renderer/src/modules/lang/zh-CN.json`
- `apps/core-app/src/renderer/src/modules/lang/en-US.json`
- `apps/core-app/src/shared/events/omni-panel.ts`
- `apps/core-app/src/main/modules/omni-panel/index.ts`
- `apps/core-app/src/main/modules/plugin/plugin-module.ts`
- `apps/core-app/src/renderer/src/modules/plugin/plugin-install-listener.ts`
- `apps/core-app/src/renderer/src/views/omni-panel/OmniPanel.vue`
