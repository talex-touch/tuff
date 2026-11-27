<script setup lang="ts">
import type { AiChainStep, AiElementMessage } from '@tuffex-components/ai-elements'
import type { ContextChunk } from '@tuffex-components/context-cards'
import { computed, defineAsyncComponent, ref } from 'vue'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

const GalleryAttachmentTray = defineAsyncComponent(() => import('../GalleryAttachmentTray.vue'))
const GalleryChoiceCard = defineAsyncComponent(() => import('../GalleryChoiceCard.vue'))
const GalleryStreamElement = defineAsyncComponent(() => import('../GalleryStreamElement.vue'))
const GalleryStreamMarkdown = defineAsyncComponent(() => import('../GalleryStreamMarkdown.vue'))
const GalleryStreamText = defineAsyncComponent(() => import('../GalleryStreamText.vue'))
const GalleryThinkingOrb = defineAsyncComponent(() => import('../GalleryThinkingOrb.vue'))
const GalleryVoiceClip = defineAsyncComponent(() => import('../GalleryVoiceClip.vue'))

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      suiteAi: 'AI',
      typeSomething: '输入点什么…',
      delete: '删除',
      dialogTitle: '删除插件？',
      dialogMessage: '该操作无法撤销。',
      confirm: '确认',
      reviewing: '审阅中',
      aboutBody: '一套服务 Talex Touch 生态的 Vue 组件库。',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: '全部片段',
      contextChunk: {
        title: '按需引入',
        body: '新接入的应用和包优先使用子路径导入，默认避免业务 bundle 拉入包根入口和全量样式。',
        chars: '字符',
        source: 'README_ZHCN.md',
      },
      screenCursor: '正在打开「照片」',
      screenAria: '智能体屏幕',
      working: '处理中',
      searching: '检索中',
      typing: '正在输入…',
      composerTray: '上下文',
      connectApps: '连接应用',
      selectProject: '选择项目',
      requestApproval: '请求批准',
      unrestricted: '无限制访问',
      suggestions: [
        { id: 's1', text: '如何发布插件？' },
        { id: 's2', text: '怎样声明权限？' },
        { id: 's3', text: '支持哪些平台？' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: '读取清单', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: '执行构建', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 次工具调用',
      streamSentence: '开心果是这个月增长最快的口味，销量涨了 23%，核果类口味也在同一区间升温。',
      streamMarkdown: '### 开心果周报\n\n开心果本月**增长最快**，销量涨了 23%。\n\n- 核果类口味同步升温\n- 下周补货 `pistachio-base`',
      streamAnswer: '开心果这个月增长最快 [1]，建议：\n\n- 补货 `pistachio-base`\n- 周末加一场试吃',
      fineTune: {
        title: '微调',
        layoutLabel: '布局',
        layoutLabels: { row: '横向布局', col: '纵向布局', grid: '网格布局' },
        typeLabel: '类型',
        typePlaceholder: '选择类型',
        adjustLabel: '可调整',
        editedLabel: '已修改',
        fieldLabels: { width: '宽', height: '高', radius: '圆角', opacity: '不透明' },
        valueLabelFormatter: (label: string) => `${label}数值`,
      },
    }
  : {
      suiteAi: 'AI',
      typeSomething: 'Type something...',
      delete: 'Delete',
      dialogTitle: 'Delete plugin?',
      dialogMessage: 'This action cannot be undone.',
      confirm: 'Confirm',
      reviewing: 'Reviewing',
      aboutBody: 'A Vue component family powering the Talex Touch ecosystem.',
      installBody: 'pnpm add @talex-touch/tuffex',
      contextTitle: 'All chunks',
      contextChunk: {
        title: 'On-demand import',
        body: 'Use subpath imports for new app and package integrations. This keeps the package root and full stylesheet out of business bundles by default.',
        chars: 'characters',
        source: 'README.md',
      },
      screenCursor: 'Opening Photos',
      screenAria: 'Agent screen',
      working: 'Working',
      searching: 'Searching',
      typing: 'Typing…',
      composerTray: 'Context',
      connectApps: 'Connect apps',
      selectProject: 'Select a project',
      requestApproval: 'Request approval',
      unrestricted: 'Unrestricted access',
      suggestions: [
        { id: 's1', text: 'How do I publish a plugin?' },
        { id: 's2', text: 'How to declare permissions?' },
        { id: 's3', text: 'Which platforms are supported?' },
      ],
      toolRows: [
        { id: 'read', icon: 'read', label: 'Read manifest', chip: 'manifest.json', mono: true },
        { id: 'run', icon: 'run', label: 'Run build', chip: 'pnpm build', mono: true },
      ],
      toolSummary: '2 tool calls',
      streamSentence: 'Pistachio is your fastest-growing flavor, up 23% this month, and stone-fruit is trending in the same range.',
      streamMarkdown: '### Pistachio weekly\n\nPistachio is the **fastest-growing** flavor, up 23%.\n\n- Stone-fruit is warming up too\n- Restock `pistachio-base` next week',
      streamAnswer: 'Pistachio grew fastest this month [1], so:\n\n- Restock `pistachio-base`\n- Add a weekend tasting',
      fineTune: {
        title: 'Fine-tune',
        layoutLabel: 'Layout',
        layoutLabels: { row: 'Row layout', col: 'Column layout', grid: 'Grid layout' },
        typeLabel: 'Type',
        typePlaceholder: 'Select type',
        adjustLabel: 'Adjust',
        editedLabel: 'Edited',
        fieldLabels: { width: 'W', height: 'H', radius: 'Radius', opacity: 'Opacity' },
      },
    }))

const codeSample = 'export function greet(name: string) {\n  return \'Hello \' + name\n}\n'
// The StreamElement cell's one source, which its `[1]` resolves to.
const streamSources = [{ id: 'scoop', url: 'https://scoopdata.io/flavors/pistachio', title: 'Scoop Data' }]

const chatDraft = ref('')
// The ChatComposer specimen is the reference composer: a context tray that trades
// sides and a mode chip that morphs. Both are click-driven, so nothing loops.
const composerTray = ref<'top' | 'bottom'>('bottom')
const composerUnrestricted = ref(false)
const modeChipOn = ref(false)
const promptDraft = ref('')
const chatMessages = computed<AiElementMessage[]>(() => [
  { id: 'u1', role: 'user' as const, content: copy.value.suggestions[0]?.text ?? '', createdAt: 1_705_000_000_000 },
  { id: 'a1', role: 'assistant' as const, content: copy.value.aboutBody, createdAt: 1_705_000_001_000 },
])
const chatListMessages = computed(() => [
  { id: 'u1', role: 'user' as const, content: copy.value.suggestions[0]?.text ?? '', createdAt: 1_705_000_000_000 },
  { id: 'a1', role: 'assistant' as const, content: copy.value.aboutBody, createdAt: 1_705_000_001_000 },
])
const aiSampleMessage = computed(() => chatMessages.value[1] ?? chatMessages.value[0]!)
const traceRows = computed(() => [
  { id: 'read', primary: copy.value.toolRows[0]?.label ?? '', secondary: 'manifest.json', mono: true, status: 'done' as const },
  { id: 'run', primary: copy.value.toolRows[1]?.label ?? '', secondary: 'pnpm build', mono: true, status: 'active' as const },
])
const aiAgents = computed(() => [
  { id: 'chat', name: copy.value.suiteAi, description: copy.value.aboutBody, iconClass: 'i-carbon-chat', badgeText: 6 },
])
const taskRowItems = computed(() => [
  { id: 'verify', label: copy.value.reviewing, status: 'done' as const },
  { id: 'build', label: copy.value.working, status: 'running' as const },
])
const toolConfirmationInput = '{\n  "path": "src/main.ts"\n}'
const toolCall = {
  type: 'tool-call' as const,
  id: 'call-1',
  name: 'write_file',
  status: 'done' as const,
  input: toolConfirmationInput,
  output: 'ok',
}
const cotSteps = computed<AiChainStep[]>(() => [
  { id: 's1', kind: 'thinking', title: copy.value.searching, body: copy.value.aboutBody, status: 'done' },
  { id: 's2', kind: 'tool', title: copy.value.working, body: copy.value.installBody, status: 'active' },
])
const aiSources = [
  { id: 's1', url: 'https://github.com/talex-touch/talex-touch', title: 'talex-touch' },
  { id: 's2', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]
const contextChunks = computed<ContextChunk[]>(() => {
  const chunk = copy.value.contextChunk
  return [{
    id: 'c1',
    title: chunk.title,
    chars: `${chunk.body.length} ${chunk.chars}`,
    body: chunk.body,
    source: { name: chunk.source, badge: 'MD', tone: 'accent' },
  }]
})
const insightPages = computed(() => [
  { key: 'adoption', prose: copy.value.aboutBody, suggestion: copy.value.suggestions[0]?.text },
])
const fineTuneValues = {
  layout: 'grid' as const,
  width: 320,
  height: 180,
  radius: 14,
  opacity: 100,
  type: null,
}
const citeSources = [
  { id: 'repo', url: 'https://github.com/talex-touch/talex-touch' },
  { id: 'npm', url: 'https://www.npmjs.com/package/@talex-touch/tuffex' },
]
</script>

<template>
  <div class="docs-gallery__grid">
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('thinking-orb')">
        {{ cellLabel('ThinkingOrb', '思考指示球') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryThinkingOrb />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('matrix-loader')">
        {{ cellLabel('MatrixLoader', '球面矩阵加载器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryMatrixLoader />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('working-indicator')">
        {{ cellLabel('WorkingIndicator', '工作指示器') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxWorkingIndicator :label="copy.working" variant="drive" />
            <TxWorkingIndicator :label="copy.searching" variant="orbit" :show-elapsed="false" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('typing-indicator')">
        {{ cellLabel('TypingIndicator', '打字中') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row docs-gallery__row--loose">
            <TxTypingIndicator variant="dots" :text="copy.typing" />
            <TxTypingIndicator variant="ring" :show-text="false" :aria-label="copy.typing" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('suggestion-chips')">
        {{ cellLabel('SuggestionChips', '建议胶囊') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSuggestionChips :suggestions="copy.suggestions" layout="list" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('choice-card')">
        {{ cellLabel('ChoiceCard', '选项卡片') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 272px">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryChoiceCard />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('mode-chip')">
        {{ cellLabel('ModeChip', '模式芯片') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxModeChip
            :icon="modeChipOn ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
            :label="modeChipOn ? copy.unrestricted : copy.requestApproval"
            :tone="modeChipOn ? 'danger' : 'muted'"
            @click="modeChipOn = !modeChipOn"
          />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tool-chips')">
        {{ cellLabel('ToolChips', '工具调用流') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__block--wide">
            <TxToolChips
              :rows="copy.toolRows"
              :diffs="[{ file: 'index.ts', add: 12, del: 3 }]"
              :summary="copy.toolSummary"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('inline-citation')">
        {{ cellLabel('InlineCitation', '行内引用') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <TxInlineCitation
              v-for="source in citeSources"
              :key="source.id"
              :source="source"
              :appear="false"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('attachment-tray')">
        {{ cellLabel('AttachmentTray', '附件托盘') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryAttachmentTray />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('chat')">
        {{ cellLabel('Chat', '对话') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 195px; --docs-gallery-specimen-narrow: 219px">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxChatList :messages="chatListMessages" markdown />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('chat-composer')">
        {{ cellLabel('ChatComposer', '对话输入') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxChatComposer
              v-model="chatDraft"
              :min-rows="1"
              :max-rows="3"
              :placeholder="copy.typeSomething"
              :tray-placement="composerTray"
              :tray-label="copy.composerTray"
              v-bind="text.chatComposer"
            >
              <template #tray>
                <TxModeChip
                  v-if="composerTray === 'bottom'"
                  icon="i-carbon-plug"
                  :label="copy.connectApps"
                  @click="composerTray = 'top'"
                />
                <TxModeChip
                  v-else
                  icon="i-carbon-folder"
                  :label="copy.selectProject"
                  @click="composerTray = 'bottom'"
                />
              </template>
              <template #toolbar-left>
                <TxModeChip
                  :icon="composerUnrestricted ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
                  :label="composerUnrestricted ? copy.unrestricted : copy.requestApproval"
                  :tone="composerUnrestricted ? 'danger' : 'muted'"
                  @click="composerUnrestricted = !composerUnrestricted"
                />
              </template>
            </TxChatComposer>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('conversation-stream')">
        {{ cellLabel('ConversationStream', '对话流') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__stream">
            <TxConversationStream :items="chatMessages" :item-key="(item: AiElementMessage) => item.id">
              <template #item="{ item }">
                <p class="docs-gallery__muted">
                  {{ item.content }}
                </p>
              </template>
            </TxConversationStream>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('message-actions')">
        {{ cellLabel('MessageActions', '消息操作') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxMessageActions :copy-text="copy.installBody" regenerable v-bind="text.messageActions" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('prompt-bar')">
        {{ cellLabel('PromptBar', '提示栏') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxPromptBar v-model="promptDraft" :placeholder="copy.typeSomething" v-bind="text.promptBar" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('voice-clip')">
        {{ cellLabel('VoiceClip', '语音条') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryVoiceClip />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('agent-trace')">
        {{ cellLabel('AgentTrace', '智能体轨迹') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxAgentTrace :rows="traceRows" working default-open v-bind="text.agentTrace" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('agent-screen')">
        {{ cellLabel('AgentScreen', '智能体屏幕') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxAgentScreen
              :aria-label="copy.screenAria"
              :cursor="{ x: 46, y: 62, label: copy.screenCursor }"
            >
              <!-- A painted stand-in, as in the AgentScreen demo: the frame
                   takes any surface, and a gallery tile should not ship a
                   screenshot. -->
              <div class="docs-gallery__desktop">
                <span class="docs-gallery__desktop-window is-back" />
                <span class="docs-gallery__desktop-window is-front" />
              </div>
            </TxAgentScreen>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('agents')">
        {{ cellLabel('Agents', '智能体列表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxAgentsList :agents="aiAgents" v-bind="text.agentsList" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('approval-card')">
        {{ cellLabel('ApprovalCard', '审批卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxApprovalCard
              v-bind="text.approvalCard"
              :title="copy.dialogTitle"
              :questions="[{
                id: 'confirm',
                question: copy.dialogMessage,
                options: [{ value: 'yes', label: copy.confirm }, { value: 'no', label: copy.delete }],
              }]"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('task-rows')">
        {{ cellLabel('TaskRows', '任务行') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxTaskRows :rows="taskRowItems" v-bind="text.taskRows" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tool-call-card')">
        {{ cellLabel('ToolCallCard', '工具调用卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxToolCallCard :tool-call="toolCall" default-expanded v-bind="text.toolCallCard" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('tool-confirmation')">
        {{ cellLabel('ToolConfirmation', '工具确认') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxToolConfirmation
              tool-name="write_file"
              risk="write"
              :summary="copy.dialogMessage"
              :input="toolConfirmationInput"
              v-bind="text.toolConfirmation"
              :aria-label="text.toolConfirmationName"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('bot-avatar')">
        {{ cellLabel('BotAvatar', '机器人头像') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxBotAvatar type="clover" state="working" :size="64" :aria-label="text.botAvatars.clover" />
            <TxBotAvatar type="mech" state="default" :size="64" :aria-label="text.botAvatars.mech" />
            <TxBotAvatar type="star" state="working" :size="64" :aria-label="text.botAvatars.star" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('miko')">
        {{ cellLabel('Miko', '伴侣猫') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__stack docs-gallery__stack--center">
            <TxMiko state="idle" size="sm" />
            <TxMiko state="working" size="sm" />
            <TxMiko state="thinking" size="sm" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>


    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('ai-elements')">
        {{ cellLabel('AiElements', 'AI 元件') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxAiMessage :message="aiSampleMessage" :show-avatar="false" compact />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('chain-of-thought')">
        {{ cellLabel('ChainOfThought', '思维链') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxChainOfThought :steps="cotSteps" default-open v-bind="text.chainOfThought" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('code-stream')">
        {{ cellLabel('CodeStream', '代码流') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block docs-gallery__code">
            <TxCodeStream :code="codeSample" lang="ts" filename="greet.ts" lang-label="TypeScript" v-bind="text.codeStream" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('reasoning-disclosure')">
        {{ cellLabel('ReasoningDisclosure', '推理折叠') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxReasoningDisclosure :text="copy.aboutBody" :duration-ms="2400" default-open v-bind="text.reasoning" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('sources')">
        {{ cellLabel('Sources', '来源') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxSources :sources="aiSources" variant="stack" v-bind="text.sources" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('stream-element')">
        {{ cellLabel('StreamElement', '流式回答') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryStreamElement :markdown="copy.streamAnswer" :sources="streamSources" :locale="localeKey" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('stream-text')">
        {{ cellLabel('StreamText', '流式文字') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryStreamText :text="copy.streamSentence" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('stream-markdown')">
        {{ cellLabel('StreamMarkdown', '流式 Markdown') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 206px">
        <ClientOnly>
          <div class="docs-gallery__block">
            <GalleryStreamMarkdown :markdown="copy.streamMarkdown" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('context-cards')">
        {{ cellLabel('ContextCards', '上下文卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxContextCards :chunks="contextChunks" :title="copy.contextTitle" :total="32" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('context-indicator')">
        {{ cellLabel('ContextIndicator', '上下文用量') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <TxContextIndicator :used-tokens="48000" :max-tokens="128000" v-bind="text.contextIndicator" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('fine-tune-card')">
        {{ cellLabel('FineTuneCard', '微调卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxFineTuneCard :values="fineTuneValues" v-bind="copy.fineTune" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('insight-cards')">
        {{ cellLabel('InsightCards', '洞察卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxInsightCards :pages="insightPages" :title="copy.suiteAi" v-bind="text.insightCards" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('recommendation-card')">
        {{ cellLabel('RecommendationCard', '推荐卡') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxRecommendationCard v-bind="text.recommendationCard" :options="text.recommendationOptions" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>
