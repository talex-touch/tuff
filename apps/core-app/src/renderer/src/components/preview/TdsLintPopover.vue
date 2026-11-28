<script lang="ts" name="TdsLintPopover" setup>
import type { TdsLintIssue, TdsLintSeverity } from '~/modules/tds-lint'
import { TxPopover } from '@talex-touch/tuffex/popover'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { SHELL_MENU_CARD } from '~/components/shell/shell-menu-panel'
import {
  buildTdsAutoFixTracker,
  formatLintIssuesForAi,
  summarizeLintIssues
} from '~/modules/tds-lint'

const props = withDefaults(
  defineProps<{
    issues: readonly TdsLintIssue[]
    antiSlop?: boolean
    autoFix?: boolean
    autoFixOnError?: boolean
    contentDigest?: string
    frameId?: string
    displayPath?: string
    aiActionsEnabled?: boolean
    sending?: boolean
    placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
    open?: boolean
  }>(),
  {
    antiSlop: true,
    autoFix: undefined,
    autoFixOnError: undefined,
    contentDigest: '',
    frameId: '',
    displayPath: '',
    aiActionsEnabled: false,
    sending: false,
    placement: 'bottom-end',
    open: undefined
  }
)

const emit = defineEmits<{
  (event: 'update:antiSlop', value: boolean): void
  (event: 'update:autoFix', value: boolean): void
  (event: 'update:autoFixOnError', value: boolean): void
  (event: 'update:open', value: boolean): void
  (
    event: 'send-to-ai',
    payload: { prompt: string; issues: TdsLintIssue[]; autoFix?: boolean; contentDigest?: string }
  ): void
  (
    event: 'auto-fix',
    payload: { prompt: string; issues: TdsLintIssue[]; contentDigest: string }
  ): void
  (event: 'select-issue', issue: TdsLintIssue): void
}>()

const { t } = useI18n()

const internalOpen = ref(false)
const internalAutoFix = ref(false)
const autoFixTracker = buildTdsAutoFixTracker()

const popoverOpen = computed<boolean>({
  get: () => (props.open !== undefined ? props.open : internalOpen.value),
  set: (value) => {
    internalOpen.value = value
    emit('update:open', value)
  }
})

const effectiveAutoFix = computed<boolean>(() => {
  if (props.autoFix !== undefined) return props.autoFix
  if (props.autoFixOnError !== undefined) return props.autoFixOnError
  return internalAutoFix.value
})

const normalizedContentDigest = computed<string>(() => props.contentDigest.trim())

const showAutoFixToggle = computed<boolean>(
  () => props.aiActionsEnabled && Boolean(normalizedContentDigest.value)
)

const counts = computed(() => summarizeLintIssues(props.issues))

const pillTone = computed<'ok' | 'error' | 'warning'>(() => {
  if (counts.value.errors > 0) return 'error'
  if (counts.value.warnings > 0 || counts.value.infos > 0) return 'warning'
  return 'ok'
})

const pillIconClass = computed(() => {
  if (pillTone.value === 'error') return 'i-ri-error-warning-line'
  if (pillTone.value === 'warning') return 'i-ri-alert-line'
  return 'i-ri-shield-check-line'
})

const pillCountText = computed(() => {
  if (counts.value.total === 0) return '0'
  return String(counts.value.total)
})

const triggerAriaLabel = computed(() =>
  counts.value.total === 0
    ? t('home.tdsLint.okBadge', 'TDS OK')
    : t('home.tdsLint.triggerLabel', { count: counts.value.total })
)

function severityLabel(severity: TdsLintSeverity): string {
  if (severity === 'error') return t('home.tdsLint.severityError', 'Error')
  if (severity === 'warning') return t('home.tdsLint.severityWarning', 'Warning')
  return t('home.tdsLint.severityInfo', 'Info')
}

function severityIcon(severity: TdsLintSeverity): string {
  if (severity === 'error') return 'i-ri-close-circle-line'
  if (severity === 'warning') return 'i-ri-alert-line'
  return 'i-ri-information-line'
}

function toggleAntiSlop(): void {
  emit('update:antiSlop', !props.antiSlop)
}

function toggleAutoFix(): void {
  if (!showAutoFixToggle.value) return
  const next = !effectiveAutoFix.value
  internalAutoFix.value = next
  emit('update:autoFix', next)
  emit('update:autoFixOnError', next)
}

watch(
  [
    effectiveAutoFix,
    () => props.aiActionsEnabled,
    normalizedContentDigest,
    () => props.issues,
    () => props.sending,
    () => props.frameId,
    () => props.displayPath
  ],
  () => {
    if (!props.aiActionsEnabled || !effectiveAutoFix.value || !normalizedContentDigest.value) return
    const decision = autoFixTracker.consume({
      enabled: true,
      contentDigest: normalizedContentDigest.value,
      issues: props.issues,
      frameId: props.frameId,
      displayPath: props.displayPath,
      inFlight: props.sending
    })
    if (!decision.shouldTrigger) return
    emit('auto-fix', {
      prompt: decision.prompt,
      issues: decision.errorIssues,
      contentDigest: decision.digest
    })
    emit('send-to-ai', {
      prompt: decision.prompt,
      issues: decision.errorIssues,
      autoFix: true,
      contentDigest: decision.digest
    })
  },
  { immediate: true }
)

function handleSendToAi(): void {
  if (props.sending || props.issues.length === 0) return
  const prompt = formatLintIssuesForAi(props.issues, props.displayPath)
  if (!prompt) return
  emit('send-to-ai', {
    prompt,
    issues: [...props.issues]
  })
}

function handleSelectIssue(issue: TdsLintIssue): void {
  emit('select-issue', issue)
}
</script>

<template>
  <TxPopover
    v-model="popoverOpen"
    trigger="click"
    :placement="placement"
    :offset="6"
    :match-reference-width="false"
    :min-width="312"
    :panel-radius="12"
    :panel-padding="10"
    :panel-card="SHELL_MENU_CARD"
    panel-background="refraction"
  >
    <template #reference>
      <button
        type="button"
        class="TdsLintPopover-Trigger"
        :class="[`is-${pillTone}`, { 'is-open': popoverOpen }]"
        :aria-expanded="popoverOpen"
        :aria-label="triggerAriaLabel"
        :title="triggerAriaLabel"
        data-testid="tds-lint-trigger"
      >
        <span class="TdsLintPopover-TriggerIcon" aria-hidden="true">
          <span :class="pillIconClass" />
        </span>
        <span class="TdsLintPopover-TriggerCount" data-testid="tds-lint-count">
          {{ pillCountText }}
        </span>
      </button>
    </template>

    <div class="TdsLintPopover-Panel" data-testid="tds-lint-popover">
      <header class="TdsLintPopover-Header">
        <div class="TdsLintPopover-TitleRow">
          <span class="TdsLintPopover-Title">
            {{ t('home.tdsLint.title', 'TDS Visual Lint') }}
          </span>
          <span
            class="TdsLintPopover-SummaryBadge"
            :class="`is-${pillTone}`"
            role="status"
            aria-live="polite"
            data-testid="tds-lint-summary"
          >
            <template v-if="counts.total === 0">
              {{ t('home.tdsLint.okBadge', 'TDS OK') }}
            </template>
            <template v-else>
              {{ t('home.tdsLint.issueCount', { count: counts.total }) }}
            </template>
          </span>
        </div>

        <button
          type="button"
          role="switch"
          class="TdsLintPopover-SwitchBtn TdsLintPopover-AntiSlopBtn"
          :class="{ 'is-checked': antiSlop }"
          :aria-checked="antiSlop"
          data-testid="tds-lint-antislop-toggle"
          @click="toggleAntiSlop"
        >
          <span class="TdsLintPopover-SwitchLabel">
            {{ t('home.tdsLint.antiSlopToggle', 'Anti-AI-slop rules') }}
          </span>
          <span class="TdsLintPopover-SwitchTrack" aria-hidden="true">
            <span class="TdsLintPopover-SwitchThumb" />
          </span>
        </button>

        <button
          v-if="showAutoFixToggle"
          type="button"
          role="switch"
          class="TdsLintPopover-SwitchBtn TdsLintPopover-AutoFixBtn"
          :class="{ 'is-checked': effectiveAutoFix }"
          :aria-checked="effectiveAutoFix"
          :title="
            t(
              'home.tdsLint.autoFixHint',
              'Automatically sends one repair pass per frame change when errors appear'
            )
          "
          data-testid="tds-lint-autofix-toggle"
          @click="toggleAutoFix"
        >
          <span class="TdsLintPopover-SwitchLabel">
            {{ t('home.tdsLint.autoFixToggle', 'Auto-fix errors (1-pass)') }}
          </span>
          <span class="TdsLintPopover-SwitchTrack" aria-hidden="true">
            <span class="TdsLintPopover-SwitchThumb" />
          </span>
        </button>
      </header>

      <div v-if="counts.errors > 0 || counts.warnings > 0" class="TdsLintPopover-Breakdown">
        <span v-if="counts.errors > 0" class="TdsLintPopover-Chip is-error">
          <span class="i-ri-close-circle-line" aria-hidden="true" />
          <span>{{ t('home.tdsLint.errorCount', { count: counts.errors }) }}</span>
        </span>
        <span v-if="counts.warnings > 0" class="TdsLintPopover-Chip is-warning">
          <span class="i-ri-alert-line" aria-hidden="true" />
          <span>{{ t('home.tdsLint.warningCount', { count: counts.warnings }) }}</span>
        </span>
      </div>

      <div v-if="issues.length === 0" class="TdsLintPopover-Empty" data-testid="tds-lint-empty">
        <span class="i-ri-checkbox-circle-line TdsLintPopover-EmptyIcon" aria-hidden="true" />
        <span class="TdsLintPopover-EmptyText">
          {{ t('home.tdsLint.allClear', 'No visual quality issues detected.') }}
        </span>
      </div>

      <ul v-else class="TdsLintPopover-List" role="list">
        <li
          v-for="(issue, idx) in issues"
          :key="`${issue.ruleId}:${issue.line ?? 0}:${issue.column ?? 0}:${issue.selector ?? idx}`"
          class="TdsLintPopover-Item"
          :class="`is-${issue.severity}`"
          data-testid="tds-lint-issue"
          :data-rule-id="issue.ruleId"
        >
          <div class="TdsLintPopover-ItemMeta">
            <span class="TdsLintPopover-Severity" :class="`is-${issue.severity}`">
              <span :class="severityIcon(issue.severity)" aria-hidden="true" />
              <span>{{ severityLabel(issue.severity) }}</span>
            </span>
            <code class="TdsLintPopover-RuleId">{{ issue.ruleId }}</code>
            <button
              v-if="issue.line !== undefined"
              type="button"
              class="TdsLintPopover-LineBtn"
              data-testid="tds-lint-issue-line"
              @click="handleSelectIssue(issue)"
            >
              L{{ issue.line }}
            </button>
            <span v-else-if="issue.selector" class="TdsLintPopover-Selector">
              {{ issue.selector }}
            </span>
          </div>
          <p class="TdsLintPopover-Message">{{ issue.message }}</p>
          <p class="TdsLintPopover-Hint">{{ issue.fixHint }}</p>
        </li>
      </ul>

      <footer v-if="aiActionsEnabled && issues.length > 0" class="TdsLintPopover-Footer">
        <button
          type="button"
          class="TdsLintPopover-SendBtn"
          :disabled="sending"
          data-testid="tds-lint-send-ai"
          @click="handleSendToAi"
        >
          <span class="i-ri-sparkling-line" aria-hidden="true" />
          <span>{{ t('home.tdsLint.sendToAi', 'Send to AI to fix') }}</span>
        </button>
      </footer>
    </div>
  </TxPopover>
</template>

<style lang="scss" scoped>
.TdsLintPopover-Trigger {
  display: inline-flex;
  flex: none;
  gap: 4px;
  align-items: center;
  height: 24px;
  padding: 0 7px;
  border: none;
  border-radius: var(--shell-radius-full);
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &.is-ok {
    background: var(--shell-success-soft);
    color: var(--shell-success);
    box-shadow: inset 0 0 0 1px var(--shell-success-border);
  }

  &.is-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
    box-shadow: inset 0 0 0 1px var(--shell-warning-border);
  }

  &.is-error {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
    box-shadow: inset 0 0 0 1px var(--shell-danger-border);
  }

  &:hover,
  &.is-open {
    filter: brightness(0.97);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.TdsLintPopover-TriggerIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
}

.TdsLintPopover-TriggerCount {
  line-height: 1;
}

.TdsLintPopover-Panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 312px;
  color: var(--shell-text-primary);
}

.TdsLintPopover-Header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.TdsLintPopover-TitleRow {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.TdsLintPopover-Title {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: var(--shell-font-weight-semibold);
}

.TdsLintPopover-SummaryBadge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: var(--shell-radius-full);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;

  &.is-ok {
    background: var(--shell-success-soft);
    color: var(--shell-success);
  }

  &.is-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  &.is-error {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }
}

.TdsLintPopover-SwitchBtn {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface);
  color: var(--shell-text-regular);
  font: inherit;
  font-size: var(--shell-fs-sm);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:hover {
    background: var(--shell-surface-2);
    color: var(--shell-text-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.TdsLintPopover-SwitchLabel {
  text-align: left;
}

.TdsLintPopover-SwitchTrack {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  width: 28px;
  height: 16px;
  padding: 2px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-border-strong);
  box-sizing: border-box;

  .TdsLintPopover-SwitchBtn.is-checked & {
    background: var(--shell-primary);
  }
}

.TdsLintPopover-SwitchThumb {
  width: 12px;
  height: 12px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-bg);
  transform: translateX(0);
  transition: transform var(--shell-duration-fast) var(--shell-ease-out);

  .TdsLintPopover-SwitchBtn.is-checked & {
    transform: translateX(12px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}

.TdsLintPopover-Breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.TdsLintPopover-Chip {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 7px;
  border-radius: var(--shell-radius-sm);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);
  font-variant-numeric: tabular-nums;

  &.is-error {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }

  &.is-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }
}

.TdsLintPopover-Empty {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px 10px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-success-soft);
  color: var(--shell-success);
  font-size: var(--shell-fs-sm);
}

.TdsLintPopover-EmptyIcon {
  flex: none;
  font-size: 16px;
}

.TdsLintPopover-EmptyText {
  line-height: 1.4;
}

.TdsLintPopover-List {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 264px;
  overflow-y: auto;
}

.TdsLintPopover-Item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-bg);
  box-shadow: inset 0 0 0 1px var(--shell-border);
}

.TdsLintPopover-ItemMeta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.TdsLintPopover-Severity {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 1px 6px;
  border-radius: var(--shell-radius-full);
  font-size: var(--shell-fs-caption);
  font-weight: var(--shell-font-weight-medium);

  &.is-error {
    background: var(--shell-danger-soft);
    color: var(--shell-danger);
  }

  &.is-warning {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }

  &.is-info {
    background: var(--shell-info-soft);
    color: var(--shell-info);
  }
}

.TdsLintPopover-RuleId {
  color: var(--shell-text-primary);
  font-family: var(--shell-font-mono);
  font-size: 0.9em;
}

.TdsLintPopover-LineBtn {
  margin-left: auto;
  padding: 1px 6px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-regular);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-fs-caption);
  font-variant-numeric: tabular-nums;
  cursor: pointer;

  &:hover {
    background: var(--shell-primary-soft);
    color: var(--shell-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}

.TdsLintPopover-Selector {
  margin-left: auto;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--shell-text-muted);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-fs-caption);
}

.TdsLintPopover-Message {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  line-height: 1.45;
  text-wrap: pretty;
}

.TdsLintPopover-Hint {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-caption);
  line-height: 1.4;
  text-wrap: pretty;
}

.TdsLintPopover-Footer {
  display: flex;
  padding-top: 6px;
  border-top: 1px solid var(--shell-border);
}

.TdsLintPopover-SendBtn {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-primary);
  color: var(--shell-on-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  font-weight: var(--shell-font-weight-medium);
  cursor: pointer;

  &:hover:not(:disabled) {
    filter: brightness(1.06);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--shell-focus-ring);
    outline-offset: 1px;
  }
}
</style>
