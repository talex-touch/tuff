<script lang="ts">
import { computed, defineComponent, reactive, ref, watch } from 'vue'
import { instantiateCommandPreset } from './_shared/command-presets'
import { renderPromptTemplatePreview } from './_shared/prompt-template-preview'

interface CustomAiCommand {
  id: string
  name: string
  description?: string
  aliases: string[]
  promptTemplate: string
  promptVariables?: Record<string, unknown>
  version?: string
  enabled?: boolean
}

interface RegistryLimits {
  commands?: number
  aliases?: number
  templateChars?: number
  variableBytes?: number
}

interface RegistryPayload {
  schemaVersion?: number
  configFile?: string
  commands?: CustomAiCommand[]
  presets?: CustomAiCommand[]
  registeredCount?: number
  rejectedCount?: number
  canEdit?: boolean
  status?: string
  operationMessage?: string
  limits?: RegistryLimits
}

interface HostKeyEventEnvelope {
  key?: string
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  eventId?: string | number
}

function createEmptyCommand(): CustomAiCommand {
  return {
    id: '',
    name: '',
    description: '',
    aliases: [],
    promptTemplate: '',
    promptVariables: {},
    version: '1.0.0',
    enabled: true,
  }
}

function cloneCommand(command: CustomAiCommand): CustomAiCommand {
  return {
    ...command,
    aliases: Array.isArray(command.aliases) ? [...command.aliases] : [],
    promptVariables:
      command.promptVariables && typeof command.promptVariables === 'object'
        ? JSON.parse(JSON.stringify(command.promptVariables))
        : {},
  }
}

function parseAliases(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,，]/)
        .map(alias => alias.trim())
        .filter(Boolean),
    ),
  )
}

export default defineComponent({
  name: 'CommandRegistry',
  props: {
    item: { type: Object, required: true },
    payload: {
      type: Object as () => RegistryPayload | undefined,
      required: false,
    },
    hostKeyEvent: {
      type: Object as () => HostKeyEventEnvelope | null | undefined,
      required: false,
    },
  },
  emits: ['host-action'],
  setup(props, { emit }) {
    const commands = ref<CustomAiCommand[]>([])
    const selectedId = ref('')
    const originalId = ref('')
    const creating = ref(false)
    const deleteArmed = ref(false)
    const aliasText = ref('')
    const variablesText = ref('{}')
    const clientError = ref('')
    const presetId = ref('')
    const importInput = ref<HTMLInputElement | null>(null)
    const draft = reactive<CustomAiCommand>(createEmptyCommand())

    const limits = computed<Required<RegistryLimits>>(() => ({
      commands: Number(props.payload?.limits?.commands) || 20,
      aliases: Number(props.payload?.limits?.aliases) || 8,
      templateChars: Number(props.payload?.limits?.templateChars) || 4000,
      variableBytes: Number(props.payload?.limits?.variableBytes) || 4096,
    }))
    const starterPresets = computed<CustomAiCommand[]>(() =>
      Array.isArray(props.payload?.presets)
        ? props.payload.presets.map(cloneCommand)
        : [],
    )
    const canEdit = computed(() => props.payload?.canEdit === true)
    const canCreate = computed(
      () => canEdit.value && commands.value.length < limits.value.commands,
    )
    const statusTone = computed(() =>
      props.payload?.status === 'error' ? 'error' : 'ready',
    )
    const statusTitle = computed(() =>
      statusTone.value === 'error' ? '配置需要处理' : '注册表已就绪',
    )
    const statusDetail = computed(
      () =>
        props.payload?.operationMessage
        || `${props.payload?.registeredCount ?? commands.value.length} 个已注册，${props.payload?.rejectedCount ?? 0} 个已跳过`,
    )
    const selectedCommand = computed(() =>
      commands.value.find(command => command.id === selectedId.value),
    )
    const hasSelection = computed(
      () => creating.value || Boolean(selectedCommand.value),
    )
    const promptPreview = computed(() => {
      const variables = parseVariables()
      const preview = renderPromptTemplatePreview(
        draft.promptTemplate,
        variables || {},
      )
      return {
        ...preview,
        valid: variables !== null,
      }
    })

    function applyDraft(command: CustomAiCommand, isNew = false) {
      const next = cloneCommand(command)
      draft.id = next.id
      draft.name = next.name
      draft.description = next.description || ''
      draft.aliases = [...next.aliases]
      draft.promptTemplate = next.promptTemplate
      draft.promptVariables = { ...(next.promptVariables || {}) }
      draft.version = next.version || '1.0.0'
      draft.enabled = true
      aliasText.value = next.aliases.join(', ')
      variablesText.value = JSON.stringify(next.promptVariables || {}, null, 2)
      originalId.value = isNew ? '' : next.id
      creating.value = isNew
      deleteArmed.value = false
      clientError.value = ''
    }

    function syncCommands(nextCommands: CustomAiCommand[]) {
      commands.value = nextCommands.map(cloneCommand)
      const preferredId = selectedId.value
      const selected = commands.value.find(
        command => command.id === preferredId,
      )
      if (selected) {
        selectedId.value = selected.id
        applyDraft(selected)
        return
      }
      if (commands.value.length > 0) {
        selectedId.value = commands.value[0].id
        applyDraft(commands.value[0])
        return
      }
      selectedId.value = ''
      applyDraft(createEmptyCommand(), true)
    }

    watch(
      () => props.payload?.commands,
      value => syncCommands(Array.isArray(value) ? value : []),
      { immediate: true, deep: true },
    )

    function selectCommand(command: CustomAiCommand) {
      selectedId.value = command.id
      applyDraft(command)
    }

    function startCreate() {
      if (!canCreate.value) {
        if (canEdit.value) {
          clientError.value = `命令数量已达到 ${limits.value.commands} 个上限。`
        }
        return
      }
      selectedId.value = ''
      applyDraft(createEmptyCommand(), true)
    }

    function startFromPreset() {
      const preset = starterPresets.value.find(
        item => item.id === presetId.value,
      )
      if (!preset)
        return
      if (!canCreate.value) {
        clientError.value = `命令数量已达到 ${limits.value.commands} 个上限。`
        presetId.value = ''
        return
      }

      try {
        const command = instantiateCommandPreset(preset, commands.value)
        selectedId.value = ''
        applyDraft(command, true)
      }
      catch {
        clientError.value = '无法为该模板生成唯一命令，请检查现有 ID 与别名。'
      }
      finally {
        presetId.value = ''
      }
    }

    function parseVariables(): Record<string, unknown> | null {
      try {
        const parsed = JSON.parse(variablesText.value || '{}')
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          return null
        if (
          new TextEncoder().encode(JSON.stringify(parsed)).byteLength
            > limits.value.variableBytes
        ) {
          return null
        }
        return parsed
      }
      catch {
        return null
      }
    }

    function validateDraft(): CustomAiCommand | null {
      const id = draft.id.trim().toLowerCase()
      const name = draft.name.trim()
      const description = String(draft.description || '').trim()
      const aliases = parseAliases(aliasText.value)
      const promptTemplate = draft.promptTemplate.trim()
      const version = String(draft.version || '').trim() || '1.0.0'
      const promptVariables = parseVariables()

      if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(id)) {
        clientError.value
          = 'ID 只能使用小写字母、数字和连字符，最长 48 个字符。'
        return null
      }
      if (!name || name.length > 64) {
        clientError.value = '名称不能为空，且最长 64 个字符。'
        return null
      }
      if (description.length > 160) {
        clientError.value = '描述最长 160 个字符。'
        return null
      }
      if (
        aliases.length === 0
        || aliases.length > limits.value.aliases
        || aliases.some(alias => alias.length > 48 || alias.startsWith('/'))
      ) {
        clientError.value = `别名需要 1-${limits.value.aliases} 个，单项最长 48 个字符且不要以 / 开头。`
        return null
      }
      if (
        !promptTemplate
        || promptTemplate.length > limits.value.templateChars
      ) {
        clientError.value = `Prompt 不能为空，且最长 ${limits.value.templateChars} 个字符。`
        return null
      }
      if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
        clientError.value = '版本需要使用 1.0.0 形式。'
        return null
      }
      if (!promptVariables) {
        clientError.value = `变量必须是 JSON object，且不超过 ${limits.value.variableBytes} bytes。`
        return null
      }
      const duplicateId = commands.value.some(
        command => command.id === id && command.id !== originalId.value,
      )
      if (duplicateId) {
        clientError.value = '该命令 ID 已存在。'
        return null
      }
      const otherAliases = new Set(
        commands.value
          .filter(command => command.id !== originalId.value)
          .flatMap(command =>
            command.aliases.map(alias => alias.toLocaleLowerCase()),
          ),
      )
      if (aliases.some(alias => otherAliases.has(alias.toLocaleLowerCase()))) {
        clientError.value = '别名与其它自定义命令冲突。'
        return null
      }

      clientError.value = ''
      return {
        id,
        name,
        description,
        aliases,
        promptTemplate,
        promptVariables,
        version,
        enabled: true,
      }
    }

    function saveCommand() {
      if (!canEdit.value)
        return
      const command = validateDraft()
      if (!command)
        return
      emit('host-action', {
        actionId: 'save-custom-ai-command',
        payload: { originalId: originalId.value, command },
      })
    }

    function deleteCommand() {
      if (!canEdit.value || !originalId.value)
        return
      if (!deleteArmed.value) {
        deleteArmed.value = true
        return
      }
      emit('host-action', {
        actionId: 'delete-custom-ai-command',
        payload: { commandId: originalId.value },
      })
    }

    function reloadRegistry() {
      emit('host-action', {
        actionId: 'reload-custom-ai-commands',
        payload: {},
      })
    }

    function openConfigFolder() {
      emit('host-action', {
        actionId: 'open-custom-ai-command-folder',
        payload: {},
      })
    }

    function triggerImport() {
      importInput.value?.click()
    }

    async function importRegistry(event: Event) {
      const input = event.target as HTMLInputElement
      const file = input.files?.[0]
      if (!file)
        return
      try {
        const registryDocument = JSON.parse(await file.text())
        if (
          !registryDocument
          || typeof registryDocument !== 'object'
          || Array.isArray(registryDocument)
        ) {
          throw new Error('invalid')
        }
        emit('host-action', {
          actionId: 'import-custom-ai-commands',
          payload: { document: registryDocument },
        })
        clientError.value = ''
      }
      catch {
        clientError.value = '导入失败：请选择有效的 JSON 配置文件。'
      }
      finally {
        input.value = ''
      }
    }

    function exportRegistry() {
      const document = {
        version: props.payload?.schemaVersion || 1,
        commands: commands.value.map(cloneCommand),
      }
      const blob = new Blob([JSON.stringify(document, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = props.payload?.configFile || 'ai-commands.json'
      link.click()
      URL.revokeObjectURL(url)
    }

    watch(
      () => props.hostKeyEvent?.eventId,
      () => {
        const event = props.hostKeyEvent
        if (!event)
          return
        const modifier = event.metaKey || event.ctrlKey
        if (modifier && event.key?.toLocaleLowerCase() === 's')
          saveCommand()
        if (modifier && event.key?.toLocaleLowerCase() === 'n')
          startCreate()
      },
    )

    return {
      commands,
      selectedId,
      originalId,
      draft,
      aliasText,
      variablesText,
      clientError,
      presetId,
      importInput,
      canEdit,
      statusTone,
      statusTitle,
      statusDetail,
      hasSelection,
      starterPresets,
      canCreate,
      creating,
      deleteArmed,
      limits,
      promptPreview,
      selectCommand,
      startCreate,
      startFromPreset,
      saveCommand,
      deleteCommand,
      reloadRegistry,
      openConfigFolder,
      triggerImport,
      importRegistry,
      exportRegistry,
    }
  },
})
</script>

<template>
  <section class="CommandRegistry" aria-label="自定义 AI 命令编辑器">
    <header class="CommandRegistry__header">
      <div class="CommandRegistry__status" :data-tone="statusTone">
        <strong>{{ statusTitle }}</strong>
        <span>{{ statusDetail }}</span>
      </div>
      <div class="CommandRegistry__toolbar" aria-label="注册表操作">
        <button type="button" @click="reloadRegistry">
          重新加载
        </button>
        <button type="button" @click="openConfigFolder">
          打开目录
        </button>
        <button type="button" @click="triggerImport">
          导入
        </button>
        <button type="button" @click="exportRegistry">
          导出
        </button>
        <input
          ref="importInput"
          class="CommandRegistry__fileInput"
          type="file"
          accept="application/json,.json"
          @change="importRegistry"
        >
      </div>
    </header>

    <div v-if="!canEdit" class="CommandRegistry__notice" role="alert">
      当前配置含无效或冲突条目。请导入有效配置，或打开目录修复 JSON 后重新加载。
    </div>

    <div class="CommandRegistry__workspace">
      <aside class="CommandRegistry__list" aria-label="自定义命令列表">
        <div class="CommandRegistry__listHeader">
          <span>命令 {{ commands.length }}/{{ limits.commands }}</span>
          <button type="button" :disabled="!canCreate" @click="startCreate">
            新建
          </button>
        </div>
        <label
          v-if="starterPresets.length"
          class="CommandRegistry__presetPicker"
        >
          <span>从入门模板新建</span>
          <select
            v-model="presetId"
            :disabled="!canCreate"
            aria-label="选择 AI 命令入门模板"
            @change="startFromPreset"
          >
            <option value="">选择模板…</option>
            <option
              v-for="preset in starterPresets"
              :key="preset.id"
              :value="preset.id"
              :title="preset.description"
            >
              {{ preset.name }}
            </option>
          </select>
          <small>仅填充可编辑草稿，确认后再保存。</small>
        </label>
        <div v-if="commands.length" class="CommandRegistry__listItems">
          <button
            v-for="command in commands"
            :key="command.id"
            type="button"
            class="CommandRegistry__listItem"
            :class="{ 'is-active': selectedId === command.id && !creating }"
            :aria-pressed="selectedId === command.id && !creating"
            @click="selectCommand(command)"
          >
            <strong>{{ command.name }}</strong>
            <span>{{ command.aliases.join(' / ') }}</span>
          </button>
        </div>
        <p v-else class="CommandRegistry__empty">
          还没有自定义命令。新建后可直接从 CoreBox 运行。
        </p>
      </aside>

      <form class="CommandRegistry__form" @submit.prevent="saveCommand">
        <div class="CommandRegistry__formHeading">
          <div>
            <strong>{{ creating ? '新建命令' : '编辑命令' }}</strong>
            <span>保存后立即更新 CoreBox 动态 feature</span>
          </div>
          <span class="CommandRegistry__shortcut">⌘/Ctrl + S</span>
        </div>

        <fieldset :disabled="!canEdit || !hasSelection">
          <div class="CommandRegistry__row CommandRegistry__row--split">
            <label>
              <span>命令 ID</span>
              <input
                v-model="draft.id"
                autocomplete="off"
                placeholder="formal-polish"
              >
            </label>
            <label>
              <span>版本</span>
              <input
                v-model="draft.version"
                autocomplete="off"
                placeholder="1.0.0"
              >
            </label>
          </div>

          <label>
            <span>名称</span>
            <input
              v-model="draft.name"
              autocomplete="off"
              placeholder="正式润色"
            >
          </label>

          <label>
            <span>描述</span>
            <input
              v-model="draft.description"
              autocomplete="off"
              maxlength="160"
              placeholder="说明这个命令会如何处理当前文本"
            >
          </label>

          <label>
            <span>别名</span>
            <input
              v-model="aliasText"
              autocomplete="off"
              :placeholder="`逗号分隔，最多 ${limits.aliases} 个`"
            >
            <small>不要加 / 前缀；内置命令与其它自定义命令的别名不可重复。</small>
          </label>

          <label>
            <span>Prompt Template</span>
            <textarea
              v-model="draft.promptTemplate"
              :maxlength="limits.templateChars"
              rows="5"
              placeholder="Rewrite the input for {{audience}}. Return only the result."
            />
            <small>{{ draft.promptTemplate.length }}/{{
              limits.templateChars
            }}
              characters</small>
          </label>

          <label>
            <span>Prompt Variables (JSON)</span>
            <textarea
              v-model="variablesText"
              rows="4"
              spellcheck="false"
              placeholder="{ &quot;audience&quot;: &quot;customers&quot; }"
            />
            <small>仅接受 JSON object，最大
              {{ limits.variableBytes }} bytes。</small>
          </label>

          <section
            class="CommandRegistry__promptPreview"
            :data-tone="
              !promptPreview.valid
                ? 'error'
                : promptPreview.missingVariables.length
                  ? 'warning'
                  : 'ready'
            "
            aria-live="polite"
          >
            <header>
              <strong>System Prompt 预览</strong>
              <span>{{ promptPreview.variableNames.length }} 个模板变量</span>
            </header>
            <pre v-if="promptPreview.valid">{{
              promptPreview.rendered || '尚未输入 Prompt Template。'
            }}</pre>
            <p v-else>
              修正 Prompt Variables JSON 后显示确定性预览。
            </p>
            <small
              v-if="
                promptPreview.valid && promptPreview.missingVariables.length
              "
            >
              未提供：{{
                promptPreview.missingVariables.join(', ')
              }}。运行时会将缺失值渲染为空文本。
            </small>
            <small
              v-else-if="
                promptPreview.valid && promptPreview.variableNames.length
              "
            >
              变量已全部解析；保存后该文本将作为 system message 注入。
            </small>
            <small v-else-if="promptPreview.valid">
              模板不含变量；保存后将原样作为 system message 注入。
            </small>
          </section>
        </fieldset>

        <p v-if="clientError" class="CommandRegistry__error" role="alert">
          {{ clientError }}
        </p>

        <footer class="CommandRegistry__formActions">
          <button
            v-if="!creating && originalId"
            type="button"
            class="is-danger"
            :disabled="!canEdit"
            @click="deleteCommand"
          >
            {{ deleteArmed ? '确认删除' : '删除' }}
          </button>
          <button
            type="submit"
            class="is-primary"
            :disabled="!canEdit || !hasSelection"
          >
            保存命令
          </button>
        </footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.CommandRegistry {
  --registry-surface: var(--tx-background-color, rgba(20, 22, 28, 0.98));
  --registry-panel: color-mix(
    in srgb,
    var(--tx-background-color, #16181f) 84%,
    white 4%
  );
  --registry-panel-strong: color-mix(
    in srgb,
    var(--tx-background-color, #16181f) 72%,
    white 8%
  );
  --registry-border: var(--tx-border-color, rgba(255, 255, 255, 0.12));
  --registry-text: var(--tx-text-color-primary, rgba(255, 255, 255, 0.92));
  --registry-muted: var(--tx-text-color-secondary, rgba(255, 255, 255, 0.58));
  --registry-accent: var(--tx-color-primary, #5b8cff);
  --registry-danger: var(--tx-color-danger, #ef6a72);
  display: flex;
  min-height: 440px;
  max-height: min(680px, 76vh);
  flex-direction: column;
  overflow: hidden;
  color: var(--registry-text);
  background: var(--registry-surface);
  border: 1px solid var(--registry-border);
  border-radius: 12px;
}

.CommandRegistry button,
.CommandRegistry input,
.CommandRegistry select,
.CommandRegistry textarea {
  font: inherit;
}

.CommandRegistry button {
  min-height: 30px;
  padding: 5px 10px;
  color: var(--registry-text);
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--registry-border);
  border-radius: 7px;
}

.CommandRegistry button:hover:not(:disabled) {
  border-color: color-mix(
    in srgb,
    var(--registry-accent) 55%,
    var(--registry-border)
  );
  background: color-mix(in srgb, var(--registry-accent) 10%, transparent);
}

.CommandRegistry button:active:not(:disabled) {
  transform: translateY(1px);
}

.CommandRegistry button:focus-visible,
.CommandRegistry input:focus-visible,
.CommandRegistry select:focus-visible,
.CommandRegistry textarea:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--registry-accent) 78%, white 12%);
  outline-offset: 2px;
}

.CommandRegistry button:disabled,
.CommandRegistry fieldset:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.CommandRegistry__header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--registry-border);
}

.CommandRegistry__status {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.CommandRegistry__status strong {
  font-size: 13px;
}

.CommandRegistry__status span {
  overflow: hidden;
  font-size: 11px;
  color: var(--registry-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CommandRegistry__status[data-tone='error'] strong,
.CommandRegistry__error {
  color: var(--registry-danger);
}

.CommandRegistry__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.CommandRegistry__fileInput {
  display: none;
}

.CommandRegistry__notice {
  padding: 9px 14px;
  font-size: 11px;
  color: color-mix(in srgb, var(--registry-danger) 82%, var(--registry-text));
  background: color-mix(in srgb, var(--registry-danger) 9%, transparent);
  border-bottom: 1px solid
    color-mix(in srgb, var(--registry-danger) 28%, transparent);
}

.CommandRegistry__workspace {
  display: grid;
  grid-template-columns: minmax(170px, 0.34fr) minmax(0, 1fr);
  min-height: 0;
  flex: 1;
}

.CommandRegistry__list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  background: var(--registry-panel);
  border-right: 1px solid var(--registry-border);
}

.CommandRegistry__listHeader {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  font-size: 11px;
  color: var(--registry-muted);
  border-bottom: 1px solid var(--registry-border);
}

.CommandRegistry__presetPicker {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--registry-border);
}

.CommandRegistry__presetPicker span,
.CommandRegistry__presetPicker small {
  color: var(--registry-muted);
  font-size: 9px;
  line-height: 1.4;
}

.CommandRegistry__presetPicker select {
  width: 100%;
  min-height: 32px;
  box-sizing: border-box;
  padding: 5px 8px;
  border: 1px solid var(--registry-border);
  border-radius: 7px;
  background: var(--registry-panel-strong);
  color: var(--registry-text);
  font-size: 11px;
}

.CommandRegistry__listItems {
  display: grid;
  gap: 4px;
  padding: 6px;
  overflow: auto;
}

.CommandRegistry__listItem {
  display: grid;
  gap: 3px;
  width: 100%;
  min-height: 48px;
  padding: 8px 9px !important;
  text-align: left;
  border-color: transparent !important;
}

.CommandRegistry__listItem strong,
.CommandRegistry__listItem span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.CommandRegistry__listItem strong {
  font-size: 12px;
}

.CommandRegistry__listItem span {
  font-size: 10px;
  color: var(--registry-muted);
}

.CommandRegistry__listItem.is-active {
  background: color-mix(
    in srgb,
    var(--registry-accent) 13%,
    var(--registry-panel-strong)
  );
  border-color: color-mix(
    in srgb,
    var(--registry-accent) 34%,
    transparent
  ) !important;
}

.CommandRegistry__empty {
  max-width: 22ch;
  margin: auto;
  padding: 24px 14px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--registry-muted);
  text-align: center;
}

.CommandRegistry__form {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  overflow: auto;
}

.CommandRegistry__formHeading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.CommandRegistry__formHeading > div {
  display: grid;
  gap: 2px;
}

.CommandRegistry__formHeading strong {
  font-size: 14px;
}

.CommandRegistry__formHeading span,
.CommandRegistry__shortcut {
  font-size: 10px;
  color: var(--registry-muted);
}

.CommandRegistry fieldset {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  border: 0;
}

.CommandRegistry label {
  display: grid;
  gap: 5px;
  font-size: 11px;
  color: var(--registry-muted);
}

.CommandRegistry input,
.CommandRegistry textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 9px;
  color: var(--registry-text);
  resize: vertical;
  background: var(--registry-panel-strong);
  border: 1px solid var(--registry-border);
  border-radius: 7px;
}

.CommandRegistry input {
  min-height: 34px;
}

.CommandRegistry textarea {
  min-height: 74px;
  line-height: 1.45;
}

.CommandRegistry input::placeholder,
.CommandRegistry textarea::placeholder {
  color: color-mix(in srgb, var(--registry-muted) 72%, transparent);
}

.CommandRegistry label small {
  font-size: 9px;
  line-height: 1.4;
  color: var(--registry-muted);
}

.CommandRegistry__promptPreview {
  display: grid;
  gap: 7px;
  padding: 10px;
  border: 1px solid var(--registry-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--registry-panel-strong) 88%, transparent);
}

.CommandRegistry__promptPreview header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.CommandRegistry__promptPreview header strong {
  color: var(--registry-text);
  font-size: 11px;
}

.CommandRegistry__promptPreview header span,
.CommandRegistry__promptPreview small {
  color: var(--registry-muted);
  font-size: 9px;
}

.CommandRegistry__promptPreview pre,
.CommandRegistry__promptPreview p {
  min-height: 42px;
  max-height: 132px;
  margin: 0;
  overflow: auto;
  color: var(--registry-text);
  font:
    500 11px/1.55 ui-monospace,
    SFMono-Regular,
    Menlo,
    Monaco,
    Consolas,
    monospace;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.CommandRegistry__promptPreview[data-tone='warning'] {
  border-color: color-mix(in srgb, #d6a23d 48%, var(--registry-border));
}

.CommandRegistry__promptPreview[data-tone='warning'] small {
  color: color-mix(in srgb, #d6a23d 76%, var(--registry-text));
}

.CommandRegistry__promptPreview[data-tone='error'] {
  border-color: color-mix(
    in srgb,
    var(--registry-danger) 48%,
    var(--registry-border)
  );
}

.CommandRegistry__promptPreview[data-tone='error'] p {
  color: var(--registry-danger);
}

.CommandRegistry__row--split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(110px, 0.36fr);
  gap: 10px;
}

.CommandRegistry__error {
  margin: 0;
  font-size: 11px;
}

.CommandRegistry__formActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 2px;
}

.CommandRegistry button.is-primary {
  color: white;
  background: var(--registry-accent);
  border-color: var(--registry-accent);
}

.CommandRegistry button.is-danger {
  margin-right: auto;
  color: var(--registry-danger);
  border-color: color-mix(
    in srgb,
    var(--registry-danger) 42%,
    var(--registry-border)
  );
}

@media (max-width: 720px) {
  .CommandRegistry {
    max-height: 78vh;
  }

  .CommandRegistry__workspace {
    grid-template-columns: 1fr;
    overflow: auto;
  }

  .CommandRegistry__list {
    max-height: 180px;
    border-right: 0;
    border-bottom: 1px solid var(--registry-border);
  }

  .CommandRegistry__form {
    overflow: visible;
  }

  .CommandRegistry__row--split {
    grid-template-columns: 1fr;
  }
}
</style>
