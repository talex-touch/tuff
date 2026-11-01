<script lang="ts" name="HomeTurnError" setup>
import type { ConversationError } from '~/modules/conversation/conversation-error-display'
import { useI18n } from 'vue-i18n'
import { isStoppedTurn } from '~/modules/conversation/useTurnFailureWording'
import { useTurnError } from './composables/useTurnError'

/**
 * A turn that failed, read for what it was: a usage limit the user set (warning tone, leads to the
 * limits instead of retrying a turn that would be refused again), a provider that is missing
 * (leads to its settings), or a fault with its report line and, on the latest turn, a retry.
 */
defineProps<{
  error: ConversationError | undefined
  /** Only the latest turn can be retried. */
  retryable: boolean
}>()

const emit = defineEmits<{ (event: 'retry'): void }>()

const { t } = useI18n()
const {
  resolveErrorTitle,
  resolveErrorAdvice,
  resolveErrorReportCode,
  resolveErrorReportDetail,
  resolveUsageLimitFailure,
  openUsageLimits,
  isProviderUnavailable,
  openProviderSettings
} = useTurnError()
</script>

<template>
  <div
    v-if="resolveUsageLimitFailure(error)"
    class="HomeTurnError is-usage-limit"
    role="alert"
    data-testid="home-usage-limit-error"
  >
    <span class="i-ri-timer-line HomeTurnError-Icon" />
    <div class="HomeTurnError-Body">
      <p class="HomeTurnError-Title">
        {{ resolveUsageLimitFailure(error)?.title }}
      </p>
      <p class="HomeTurnError-Detail">
        {{ resolveUsageLimitFailure(error)?.detail }}
      </p>
      <p class="HomeTurnError-Report" data-testid="home-usage-limit-report">
        <span>{{ t('home.error.codeLabel') }}: {{ resolveErrorReportCode(error) }}</span>
      </p>
    </div>
    <button
      class="HomeTurnError-Action"
      type="button"
      data-testid="home-open-usage-limits"
      @click="openUsageLimits"
    >
      {{ resolveUsageLimitFailure(error)?.action?.label }}
    </button>
  </div>

  <div v-else class="HomeTurnError" role="alert">
    <span class="i-ri-error-warning-line HomeTurnError-Icon" />
    <div class="HomeTurnError-Body">
      <p class="HomeTurnError-Title">
        {{ resolveErrorTitle(error) }}
      </p>
      <p v-if="resolveErrorAdvice(error)" class="HomeTurnError-Detail">
        {{ resolveErrorAdvice(error) }}
      </p>
      <p class="HomeTurnError-Report" data-testid="home-error-report">
        <span>{{ t('home.error.codeLabel') }}: {{ resolveErrorReportCode(error) }}</span>
        <span v-if="!isStoppedTurn(error)">{{ resolveErrorReportDetail(error) }}</span>
      </p>
    </div>
    <button
      v-if="isProviderUnavailable(error)"
      class="HomeTurnError-Action"
      type="button"
      @click="openProviderSettings"
    >
      {{ t('home.configureProvider') }}
    </button>
    <button v-else-if="retryable" class="HomeTurnError-Action" type="button" @click="emit('retry')">
      {{ t('home.retry') }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
.HomeTurnError {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--shell-radius-lg);
  background: var(--shell-danger-soft);
  box-sizing: border-box;
}

.HomeTurnError-Icon {
  flex: none;
  margin-top: 1px;
  color: var(--shell-danger);
}

.HomeTurnError-Body {
  flex: 1;
  min-width: 0;
}

.HomeTurnError-Title {
  margin: 0;
  color: var(--shell-danger);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
}

.HomeTurnError-Detail {
  margin: 4px 0 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
  word-break: break-word;
}

.HomeTurnError-Report {
  display: grid;
  gap: 2px;
  margin: 6px 0 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
  overflow-wrap: anywhere;

  > span:first-child {
    color: var(--shell-text-muted);
    font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: var(--shell-fs-sm);
  }
}

.HomeTurnError-Action {
  flex: none;
  height: 26px;
  padding: 0 12px;
  border: 1px solid var(--shell-danger-border);
  border-radius: var(--shell-radius-full);
  background: transparent;
  color: var(--shell-danger);
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;

  // The block itself is already `danger-soft`, so the hover has to go a step deeper to register.
  &:hover {
    background: color-mix(in srgb, var(--shell-danger) 12%, transparent);
  }
}

/*
 * A limit the user set is not a fault: the same block in the warning tone, whose button leads to
 * the limits instead of retrying a turn that would be refused again.
 */
.HomeTurnError.is-usage-limit {
  background: var(--shell-warning-soft);

  .HomeTurnError-Icon,
  .HomeTurnError-Title {
    color: var(--shell-warning);
  }

  .HomeTurnError-Action {
    border-color: var(--shell-warning-border, var(--shell-warning));
    color: var(--shell-warning);

    &:hover {
      background: color-mix(in srgb, var(--shell-warning) 12%, transparent);
    }
  }
}
</style>
