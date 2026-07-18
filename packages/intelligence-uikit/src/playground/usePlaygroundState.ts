import type {
  TxAiMessageModel,
  TxAiRichBlockModel,
  TxAiToolStatus,
} from "../types";
import { computed, onBeforeUnmount, ref } from "vue";

type MockPhase = "empty" | "waiting" | "streaming" | "tool" | "done" | "error";
type MockBranch = "success" | "error";
type MockSession = "conversation" | "tools" | "markdown";
interface MockTimelineStep {
  label: string;
  description: string;
  phase: MockPhase;
  messages: TxAiMessageModel[];
}

interface MockSessionConfig {
  id: MockSession;
  title: string;
  heading: string;
  eyebrow: string;
  prompt: string;
  adapterName: string;
  adapterDescription: string;
  suggestions: string[];
  citations: Array<{ title: string; description: string }>;
}

const sessionConfigs: MockSessionConfig[] = [
  {
    id: "conversation",
    title: "Conversation extraction",
    heading: "Chat generation mockup",
    eyebrow: "AI conversation surface",
    prompt: "把 AI 聊天体验抽成一组可以复用的 AI UI Kit，并保留动画调试入口。",
    adapterName: "Conversation Adapter",
    adapterDescription: "blocks normalized",
    suggestions: [
      "拆出消息 hover 工具栏",
      "补齐 markdown 段落 reveal",
      "模拟 tool-call collapse",
    ],
    citations: [
      { title: "ChatItem.vue", description: "message blocks" },
      { title: "ThChat.vue", description: "scroll behavior" },
      { title: "MilkdownRender.vue", description: "rich content" },
    ],
  },
  {
    id: "tools",
    title: "Tool result cards",
    heading: "Tool result mockup",
    eyebrow: "AI tool execution surface",
    prompt:
      "模拟一次工具调用，从运行中、结果卡、错误卡到最终状态都要能调动画。",
    adapterName: "Tool Adapter",
    adapterDescription: "tool states",
    suggestions: ["展开工具调用详情", "切换错误结果卡", "调试运行中 shimmer"],
    citations: [
      { title: "run-event-card.ts", description: "tool event shell" },
      { title: "TxAiToolCall.vue", description: "status display" },
      { title: "TxAiResultCard.vue", description: "result surface" },
    ],
  },
  {
    id: "markdown",
    title: "Markdown streaming",
    heading: "Markdown streaming mockup",
    eyebrow: "AI content rendering surface",
    prompt:
      "模拟 markdown 内容逐段生成，并测试逐字 fade in / fade out、代码块和引用块的出现节奏。",
    adapterName: "Markdown Adapter",
    adapterDescription: "stream renderer",
    suggestions: ["调试逐字 fade", "调试段落 reveal", "检查代码块进入"],
    citations: [
      { title: "TxAiMarkdown.vue", description: "markdown shell" },
      { title: "TxAiStreamText.vue", description: "character fade" },
      { title: "TxMarkdownView.vue", description: "base renderer" },
    ],
  },
];

const phaseOptions: Array<{ label: string; value: MockPhase }> = [
  { label: "流式", value: "streaming" },
  { label: "工具", value: "tool" },
  { label: "完成", value: "done" },
  { label: "错误", value: "error" },
];

export function usePlaygroundState() {
  const mockStartedAt = Date.now() - 240_000;
  const activeSession = ref<MockSession>("conversation");
  const branch = ref<MockBranch>("success");
  const timelineIndex = ref(3);
  const isPlaying = ref(false);
  const draft = ref("");
  let playTimer: ReturnType<typeof setInterval> | undefined;

  const activeSessionConfig = computed(() => {
    return (
      sessionConfigs.find((item) => item.id === activeSession.value) ??
      sessionConfigs[0]
    );
  });

  function createUserMessage(): TxAiMessageModel {
    return {
      id: "user-1",
      role: "user",
      content: activeSessionConfig.value.prompt,
      createdAt: mockStartedAt,
    };
  }

  function createAssistantMessage(
    status: TxAiMessageModel["status"],
    blocks: TxAiRichBlockModel[] = [],
  ): TxAiMessageModel {
    return {
      id: "assistant-1",
      role: "assistant",
      status,
      createdAt: mockStartedAt + 90_000,
      blocks,
    };
  }

  function createThinkingBlock(
    kind: "planning" | "thinking" | "thought",
    content: string,
    status: TxAiToolStatus = "success",
  ): TxAiRichBlockModel {
    return {
      id: kind,
      type: "card",
      name:
        kind === "planning"
          ? "规划中"
          : kind === "thinking"
            ? "思考中"
            : "思考内容",
      status,
      content,
      meta: { kind },
    };
  }

  function createPlanBlock(
    variant: "partial" | "full",
    status: TxAiToolStatus = "success",
  ): TxAiRichBlockModel {
    const session = activeSession.value;
    const title =
      session === "tools"
        ? "### 工具结果切片"
        : session === "markdown"
          ? "### Markdown 渲染切片"
          : "### 迁移切片";
    const lines =
      session === "tools"
        ? [
            "- ToolCall 层展示 running、success、error、cancelled。",
            "- ResultCard 层承接结构化结果、摘要和二次操作。",
            "- Error branch 需要保留红色语义和可恢复交互。",
          ]
        : session === "markdown"
          ? [
              "- StreamText 层负责逐字 fade in / fade out。",
              "- Markdown 层负责段落、引用、列表和代码块渲染。",
              "- Reveal 层负责内容渐显和段落级进入。",
            ]
          : [
              "- Foundation 层负责 reveal、stream text、thinking、loading hint。",
              "- Conversation 层负责消息、滚动跟随、停止生成和输入区域。",
              "- Content 层承接 markdown、code block、tool/card/error blocks。",
            ];

    return {
      id: "plan",
      type: "markdown",
      status,
      content: [
        title,
        "",
        ...lines.slice(0, variant === "full" ? 3 : 2),
        "",
        variant === "full"
          ? "> 当前内容稳定，适合调试 hover、collapse 和 completed state。"
          : "> 正在生成内容，适合调试段落进入、流式 cursor 和 markdown reveal。",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  function createToolBlock(status: TxAiToolStatus): TxAiRichBlockModel {
    const session = activeSession.value;
    return {
      id: "tool-search",
      type: "tool",
      name:
        session === "tools"
          ? "Tool result pipeline"
          : session === "markdown"
            ? "Markdown stream parser"
            : "Conversation block timeline",
      status,
      content:
        status === "running"
          ? session === "tools"
            ? "执行 mock 工具调用，等待结构化结果和错误分支。"
            : session === "markdown"
              ? "解析 markdown token，等待段落和代码块进入。"
              : "整理 ChatItem blocks、suggest-card、tool card 与 run event card 的抽象边界。"
          : session === "tools"
            ? "工具结果已归一化为 TxAiResultCard 输入。"
            : session === "markdown"
              ? "Markdown token 已归一化为内容 block。"
              : "已归档为 TxAiRichBlock 的兼容输入。",
    };
  }

  function createCodeBlock(): TxAiRichBlockModel {
    const session = activeSession.value;
    return {
      id: "code",
      type: "code",
      content:
        session === "tools"
          ? [
              "const result = normalizeToolResult(toolEvent)",
              "const status = mapToolStatus(toolEvent.state)",
              "",
              "return <TxAiResultCard tone={status} />",
            ].join("\n")
          : session === "markdown"
            ? [
                "const chars = Array.from(streamText)",
                "const blocks = parseMarkdownTokens(tokens)",
                "",
                'return <TxAiStreamText motion="fade" streaming />',
              ].join("\n")
            : [
                "const blocks = mapAIChatBlocksToAiBlocks(conversationBlocks)",
                "const message = mapAIChatMessageToAiMessage(conversationMessage)",
                "",
                "return <TxAiConversation messages={messages} generating />",
              ].join("\n"),
      meta: { language: "ts" },
    };
  }

  function createResultBlock(): TxAiRichBlockModel {
    if (branch.value === "error") {
      return {
        id: "error",
        type: "error",
        content:
          "工具卡模拟失败：用于调试 error state、红色语义和进入/退出动画。",
      };
    }

    return {
      id: "run-card",
      type: "card",
      name:
        activeSession.value === "tools"
          ? "tool_result_card"
          : activeSession.value === "markdown"
            ? "markdown_stream_result"
            : "ai_run_event_card",
      content:
        activeSession.value === "tools"
          ? "工具返回 2 个结果字段，1 个错误分支已准备。"
          : activeSession.value === "markdown"
            ? "4 段内容已进入，逐字 fade 动画可调。"
            : "3 个 blocks 已归一化，2 个动画入口等待实现。",
    };
  }

  const timelineSteps = computed<MockTimelineStep[]>(() => {
    const userMessage = createUserMessage();
    const planningText =
      activeSession.value === "tools"
        ? "正在拆分工具调用状态，先覆盖运行中、成功、失败和取消四种节点。"
        : activeSession.value === "markdown"
          ? "正在拆分 markdown stream 的显示节奏，先确定逐字、逐段、代码块三层动画。"
          : "正在拆分 AI 聊天页的可复用边界，先确定消息、内容、工具调用三条主线。";
    const thinkingText =
      activeSession.value === "tools"
        ? "对比 run event card 和 result card 的职责，工具数据只做展示映射，不引入业务请求。"
        : activeSession.value === "markdown"
          ? "逐字 fade 需要保留空格、标点和换行节奏，同时尊重 reduced motion。"
          : "对比 ThChat、ChatItem、MilkdownRender 的职责，避免把 AI 业务状态带进 UI Kit。";
    const thoughtText =
      activeSession.value === "tools"
        ? "工具卡负责状态语义、摘要和结果壳层；错误分支独立进入，方便调红色状态和恢复操作。"
        : activeSession.value === "markdown"
          ? "字符层处理 fade in / fade out；markdown 层处理语义结构；两者避免互相抢布局。"
          : "消息容器只处理滚动、贴底、停止生成；block renderer 只处理展示形态；动画通过 class 和 motion prop 扩展。";
    const planningBlock = createThinkingBlock("planning", planningText);
    const planningRunningBlock = createThinkingBlock(
      "planning",
      planningText,
      "running",
    );
    const thinkingBlock = createThinkingBlock("thinking", thinkingText);
    const thinkingRunningBlock = createThinkingBlock(
      "thinking",
      thinkingText,
      "running",
    );
    const thoughtBlock = createThinkingBlock("thought", thoughtText);
    const thoughtRunningBlock = createThinkingBlock(
      "thought",
      thoughtText,
      "running",
    );
    const planPartialStreaming = createPlanBlock("partial", "running");
    const planFull = createPlanBlock("full");
    const planFullStreaming = createPlanBlock("full", "running");
    const runningTool = createToolBlock("running");
    const finalTool = createToolBlock(
      branch.value === "error" ? "error" : "success",
    );
    const status = branch.value === "error" ? "error" : "done";
    const finalPhase = branch.value === "error" ? "error" : "done";

    return [
      {
        label: "Start",
        description: "空会话，只保留输入区",
        phase: "empty",
        messages: [],
      },
      {
        label: "用户消息",
        description: "用户消息气泡进入",
        phase: "waiting",
        messages: [userMessage],
      },
      {
        label: "规划中",
        description: "助手消息壳出现，展示规划中的轻量卡片",
        phase: "waiting",
        messages: [
          userMessage,
          createAssistantMessage("waiting", [planningRunningBlock]),
        ],
      },
      {
        label: "思考中",
        description: "思考状态继续递增，适合调 dots 和呼吸动画",
        phase: "waiting",
        messages: [
          userMessage,
          createAssistantMessage("waiting", [
            planningBlock,
            thinkingRunningBlock,
          ]),
        ],
      },
      {
        label: "思考内容",
        description: "思考内容展开，适合调折叠/展开/渐显",
        phase: "waiting",
        messages: [
          userMessage,
          createAssistantMessage("waiting", [
            planningBlock,
            thinkingBlock,
            thoughtRunningBlock,
          ]),
        ],
      },
      {
        label: "计划草稿",
        description: "markdown 计划开始流式出现",
        phase: "streaming",
        messages: [
          userMessage,
          createAssistantMessage("streaming", [
            planningBlock,
            thinkingBlock,
            thoughtBlock,
            planPartialStreaming,
          ]),
        ],
      },
      {
        label: "计划完整",
        description: "markdown 内容补齐，适合调段落递进",
        phase: "streaming",
        messages: [
          userMessage,
          createAssistantMessage("streaming", [
            planningBlock,
            thinkingBlock,
            thoughtBlock,
            planFullStreaming,
          ]),
        ],
      },
      {
        label: "工具调用",
        description: "工具卡进入并保持 running",
        phase: "tool",
        messages: [
          userMessage,
          createAssistantMessage("streaming", [
            planningBlock,
            thinkingBlock,
            thoughtBlock,
            planFull,
            runningTool,
          ]),
        ],
      },
      {
        label: "代码块",
        description: "代码块在工具卡下方展开",
        phase: "tool",
        messages: [
          userMessage,
          createAssistantMessage("streaming", [
            planningBlock,
            thinkingBlock,
            thoughtBlock,
            planFull,
            runningTool,
            createCodeBlock(),
          ]),
        ],
      },
      {
        label: branch.value === "error" ? "错误结束" : "完成",
        description:
          branch.value === "error"
            ? "错误块替代最终结果卡"
            : "最终结果卡和 success 状态可见",
        phase: finalPhase,
        messages: [
          userMessage,
          createAssistantMessage(status, [
            planningBlock,
            thinkingBlock,
            thoughtBlock,
            planFull,
            finalTool,
            createCodeBlock(),
            createResultBlock(),
          ]),
        ],
      },
    ];
  });

  const activeStep = computed(
    () => timelineSteps.value[timelineIndex.value] ?? timelineSteps.value[0],
  );
  const phase = computed<MockPhase>(() => activeStep.value.phase);
  const messages = computed<TxAiMessageModel[]>(
    () => activeStep.value.messages,
  );
  const timelineProgress = computed(
    () => `${timelineIndex.value + 1}/${timelineSteps.value.length}`,
  );
  const toolStatus = computed<TxAiToolStatus>(() => {
    if (phase.value === "error") return "error";
    if (phase.value === "done") return "success";
    if (phase.value === "empty") return "pending";
    return "running";
  });
  const generating = computed(
    () =>
      phase.value === "waiting" ||
      phase.value === "streaming" ||
      phase.value === "tool",
  );
  const workspacePhase = computed<MockPhase>(() => phase.value);
  const modeLabel = "Mock timeline";
  const currentStepLabel = computed(
    () =>
      `${timelineProgress.value} · ${activeStep.value.label} · ${activeStep.value.description}`,
  );
  const composerAttachments = computed(() => [
    {
      id: "a1",
      label: `${activeSessionConfig.value.title.toLowerCase().replaceAll(" ", "-")}.ts`,
      kind: "ts",
    },
    {
      id: "a2",
      label:
        activeSession.value === "markdown"
          ? "TxAiStreamText.vue"
          : activeSession.value === "tools"
            ? "TxAiResultCard.vue"
            : "ChatItem.vue",
      kind: "vue",
      pending: phase.value === "tool",
    },
  ]);

  function stopPlayback() {
    if (playTimer) {
      clearInterval(playTimer);
      playTimer = undefined;
    }
    isPlaying.value = false;
  }

  function playFromStart() {
    stopPlayback();
    timelineIndex.value = 0;
    isPlaying.value = true;

    playTimer = setInterval(() => {
      if (timelineIndex.value >= timelineSteps.value.length - 1) {
        stopPlayback();
        return;
      }

      timelineIndex.value += 1;
    }, 1100);
  }

  function resetTimeline() {
    stopPlayback();
    timelineIndex.value = 0;
  }

  function nextTimelineStep() {
    stopPlayback();
    timelineIndex.value = Math.min(
      timelineIndex.value + 1,
      timelineSteps.value.length - 1,
    );
  }

  function completeTimeline() {
    stopPlayback();
    timelineIndex.value = timelineSteps.value.length - 1;
  }

  function selectPhase(nextPhase: MockPhase) {
    stopPlayback();
    if (nextPhase === "error") branch.value = "error";
    if (nextPhase === "done") branch.value = "success";

    const targetIndex = timelineSteps.value.findIndex(
      (step) => step.phase === nextPhase,
    );
    timelineIndex.value =
      targetIndex >= 0 ? targetIndex : timelineSteps.value.length - 1;
  }

  function selectBranch(nextBranch: MockBranch) {
    branch.value = nextBranch;
    if (timelineIndex.value === timelineSteps.value.length - 1)
      timelineIndex.value = timelineSteps.value.length - 1;
  }

  function selectSession(session: MockSession) {
    stopPlayback();
    activeSession.value = session;
    branch.value = "success";
    timelineIndex.value = 3;
    draft.value = "";
  }

  function sendDraft(payload?: { text: string }) {
    const text = (payload?.text ?? draft.value).trim();
    if (!text) return;

    draft.value = "";
    timelineIndex.value = Math.min(
      timelineIndex.value + 1,
      timelineSteps.value.length - 1,
    );
  }

  onBeforeUnmount(stopPlayback);

  return {
    activeSession,
    activeSessionConfig,
    activeStep,
    branch,
    composerAttachments,
    completeTimeline,
    currentStepLabel,
    draft,
    generating,
    isPlaying,
    messages,
    modeLabel,
    nextTimelineStep,
    phase,
    phaseOptions,
    playFromStart,
    resetTimeline,
    selectBranch,
    selectPhase,
    selectSession,
    sendDraft,
    sessionConfigs,
    stopPlayback,
    timelineIndex,
    timelineSteps,
    toolStatus,
    workspacePhase,
  };
}
