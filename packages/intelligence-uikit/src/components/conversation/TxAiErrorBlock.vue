<script setup lang="ts">
import type { TxAiErrorBlockProps } from '../../types'
defineOptions({ name: 'TxAiErrorBlock' })
withDefaults(defineProps<TxAiErrorBlockProps>(), { codeLabel: 'Code', tone: 'danger', retryLabel: 'Retry', retryable: false })
const emit = defineEmits<{ retry: []; action: [] }>()
</script>

<template>
  <div class="tx-ai-error-block" :class="{ 'is-usage-limit': tone === 'warning' }" role="alert" :data-testid="tone === 'warning' ? 'home-usage-limit-error' : undefined">
    <span class="tx-ai-error-block-Icon" :class="tone === 'warning' ? 'i-ri-timer-line' : 'i-ri-error-warning-line'" aria-hidden="true" />
    <div class="tx-ai-error-block-Body">
      <p class="tx-ai-error-block-Title">
        {{ title }}
      </p>
      <p v-if="detail" class="tx-ai-error-block-Detail">
        {{ detail }}
      </p>
      <p v-if="reportCode || reportDetail" class="tx-ai-error-block-Report" :data-testid="tone === 'warning' ? 'home-usage-limit-report' : 'home-error-report'">
        <span v-if="reportCode">{{ codeLabel }}: {{ reportCode }}</span>
        <span v-if="reportDetail">{{ reportDetail }}</span>
      </p>
    </div>
    <button v-if="actionLabel" class="tx-ai-error-block-Action" type="button" :data-testid="tone === 'warning' ? 'home-open-usage-limits' : undefined" @click="emit('action')">
      {{ actionLabel }}
    </button>
    <button v-else-if="retryable" class="tx-ai-error-block-Action" type="button" @click="emit('retry')">
      {{ retryLabel }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.tx-ai-error-block {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--shell-radius-lg, 12px);
  background: var(--shell-danger-soft, var(--tx-color-danger-light-9));
  box-sizing: border-box;
}

.tx-ai-error-block-Icon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger, var(--tx-color-danger));
}

.tx-ai-error-block-Body {
  flex: 1;
  min-width: 0;
}

.tx-ai-error-block-Title {
  margin: 0;
  color: var(--shell-danger, var(--tx-color-danger));
  font-size: var(--shell-fs-body, 14px);
  line-height: 1.5;
}

.tx-ai-error-block-Detail {
  margin: 4px 0 0;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-sm, 13px);
  line-height: 1.5;
  word-break: break-word;
}

.tx-ai-error-block-Report {
  display: grid;
  gap: 2px;
  margin: 6px 0 0;
  color: var(--shell-text-secondary, var(--tx-text-color-regular));
  font-size: var(--shell-fs-body, 14px);
  line-height: 1.5;
  overflow-wrap: anywhere;

  > span:first-child {
    color: var(--shell-text-muted, var(--tx-text-color-secondary));
    font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--shell-fs-sm, 13px);
  }
}

.tx-ai-error-block-Action {
  flex: none;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--shell-danger-border, var(--tx-color-danger-light-5));
  border-radius: var(--shell-radius-full, 999px);
  background: transparent;
  color: var(--shell-danger, var(--tx-color-danger));
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;

  // The block itself is already `danger-soft`, so the hover has to go a step deeper to register.
  &:hover {
    background: color-mix(in srgb, var(--shell-danger, var(--tx-color-danger)) 12%, transparent);
  }
}

/*
 * A limit the user set is not a fault: the same block in the warning tone, whose button leads to
 * the limits instead of retrying a turn that would be refused again.
 */
.tx-ai-error-block.is-usage-limit {
  background: var(--shell-warning-soft, var(--tx-color-warning-light-9));

  .tx-ai-error-block-Icon,
  .tx-ai-error-block-Title {
    color: var(--shell-warning, var(--tx-color-warning));
  }

  .tx-ai-error-block-Action {
    border-color: var(--shell-warning-border, var(--shell-warning, var(--tx-color-warning)));
    color: var(--shell-warning, var(--tx-color-warning));

    &:hover {
      background: color-mix(in srgb, var(--shell-warning, var(--tx-color-warning)) 12%, transparent);
    }
  }
}
</style>
