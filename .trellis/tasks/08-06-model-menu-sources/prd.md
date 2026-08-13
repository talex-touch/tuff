# 模型菜单接入 pi 目录与应用内提供方模型

## Goal

Composer/顶栏的模型菜单当前在 pi 可用、路由可跑的情况下仍显示「没有可用的模型」。要求菜单识别两路来源并合并展示:pi 工具自己的模型目录 + 应用内配置的 AI 提供方模型;选中后经现有 `preferredProviderId` / `modelPreference` 链路生效。

## Background(根因,详见 research/pi-model-catalog.md)

- 菜单数据只来自 `getProviderModelOptions('text.chat')`,而各 provider 只靠手填 `models`;自动注册的 `pi-cli-default` 是 `models: []`,贡献 0 行。
- pi 的模型目录在 `~/.pi/agent`(`PI_CODING_AGENT_DIR`)的 `models.json`(自定义提供方,**含 apiKey 明文**)与 `models-store.json`(内置目录缓存);无枚举 CLI 命令,只能读文件。
- 发送链路已就绪:选中项 → `modelPreference[0]` → `pi --model <provider/id>`,无需改动。

## Requirements

1. **pi 模型来源**:pi CLI 存在时,`pi-cli-default` 的可选模型来自其目录文件(两文件合并、按 `provider/id` 形式展示与下发);pi 不存在或文件解析失败时该来源静默消失,不报错。
2. **应用内提供方来源**:已配置、具备 `text.chat` 能力的提供方按现有 `provider.models` 声明照常列出;本任务不做在线拉取 `/models`(记入 Notes 作后续任务)。
3. **机密处理(硬性)**:读取 pi 文件只提取模型/提供方元数据;`apiKey` 及任何凭据字段不进日志、不进 transport、不进 renderer;`auth.json` 一律不读。
4. **新鲜度**:pi 目录读取带缓存,以文件 mtime 失效;菜单打开即触发的现有 `load()` 语义保持。
5. **空态分层**:仅当两路来源都为空时才显示「没有可用的模型,先去配置一个 AI 提供方」;pi 在但应用内为空(或反之)时,列出存在的那一路,不显示误导性空态。

## Constraints

- 不改 `HomeModelMenu` 的交互结构(仍是一行 model + providerName;不引入分组头/搜索——列表规模不需要)。
- pi 文件格式不是公开契约:解析必须防御式,字段缺失跳过该条,warn 日志只打一次。
- 可用性判定第一版从宽:目录里列出的 pi 模型全部展示,凭据缺失让 pi 运行时报错并经现有 failure 链路回到会话(不预判 auth.json/env)。

## Acceptance Criteria

- [ ] 本机装有 pi 时,菜单出现 pi 目录内模型(含 `models.json` 自定义提供方与 `models-store.json` 内置目录),选中并发送后 pi spawn 参数含对应 `--model`。
- [ ] 无 pi 的机器:菜单不因此报错,应用内提供方模型照常展示。
- [ ] 应用内提供方声明的 `models` 与 pi 来源合并展示,互不覆盖。
- [ ] 机密不泄漏:单测断言 pi 目录读取结果与日志输出不含 `apiKey` 字段值(fixture 含假 key)。
- [ ] pi 目录文件缺失/损坏时静默降级,有一次性 warn,无用户可见错误。
- [ ] 空态分层按 Requirement 5 生效。
- [ ] `npm run typecheck` 通过;新增解析/合并逻辑有 vitest 覆盖。

## Notes

- 后续候选任务(不在本任务):应用内 OpenAI 兼容提供方在线拉取 `/v1/models` 填充列表;pi `--model :<thinking>` 后缀与推理强度联动。
