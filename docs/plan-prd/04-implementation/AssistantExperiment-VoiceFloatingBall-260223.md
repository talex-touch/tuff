# Assistant 实验功能落地说明（260223）

> 状态：历史/待重写（实验能力，默认关闭）  
> 更新时间：2026-03-16  
> 适用范围：`apps/core-app`  
> 替代入口：`docs/plan-prd/TODO.md`、`docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`、`docs/plan-prd/01-project/CHANGES.md`

---

## 1. 背景与目标

本次落地聚焦三点：

1. 引入桌面 Assistant 入口（悬浮球）。
2. 引入语音唤醒与语音输入面板。
3. 让 Intelligence 开箱可用（默认绑定内置云端 AI provider）。

命名约定：

- 助手名：`阿洛 aler`
- 唤醒词：`阿洛` / `aler`

---

## 2. 关键决策（最终版）

1. **语音技术路线**
   - 不接入 Porcupine。
   - 采用浏览器语音识别能力：`SpeechRecognition / webkitSpeechRecognition`。

2. **默认可见性与启用策略**
   - 悬浮球默认关闭。
   - 语音唤醒默认关闭。
   - Assistant 实验总开关默认关闭。

3. **启动门禁（硬条件）**
   - 必须设置环境变量 `TUFF_ENABLE_ASSISTANT_EXPERIMENT=1`（或 `true`）；
   - 未设置时，主进程不加载 Assistant 模块。

4. **快捷键策略**
   - CoreBox 相关默认快捷键注册但默认禁用，不占用用户系统快捷键。

5. **Intelligence 默认可用性**
   - 默认启用 `tuff-nexus-default` provider；
   - 主进程加载配置时自动注入登录 token，未登录场景使用 `guest` 占位。

---

## 3. 当前生效逻辑（判定矩阵）

Assistant 功能实际可见/可用，需要同时满足：

1. 进程环境变量允许：`TUFF_ENABLE_ASSISTANT_EXPERIMENT=1`。
2. `appSetting.assistant.enabled === true`。
3. 悬浮球显示需要 `appSetting.floatingBall.enabled === true`。
4. 语音唤醒需要 `appSetting.voiceWake.enabled === true`。

任一条件不满足时：

- 不展示悬浮球；
- 不响应语音唤醒；
- 不打开语音面板入口。

---

## 4. 主要落地点（代码）

- 主进程装载门禁：
  - `apps/core-app/src/main/index.ts`
- Assistant 模块：
  - `apps/core-app/src/main/modules/assistant/module.ts`
- Assistant 渲染视图：
  - `apps/core-app/src/renderer/src/views/assistant/FloatingBall.vue`
  - `apps/core-app/src/renderer/src/views/assistant/VoicePanel.vue`
- 默认配置：
  - `packages/utils/common/storage/entity/app-settings.ts`
- Intelligence 默认 provider：
  - `apps/core-app/src/main/modules/ai/intelligence-config.ts`
  - `packages/utils/types/intelligence.ts`

---

## 5. 启动与调试方式

启用实验模块（开发环境）：

```bash
TUFF_ENABLE_ASSISTANT_EXPERIMENT=1 pnpm core:dev
```

未设置环境变量时，Assistant 模块不会加载，这是预期行为。

---

## 6. 后续待办（未闭环）

1. 在设置页补齐 Assistant 实验配置入口（总开关/悬浮球/语音唤醒）。
2. 增加语音能力可用性探测与降级提示（不同平台/内核差异）。
3. 增加最小回归测试：环境变量门禁、默认关闭态、手动开启链路。
