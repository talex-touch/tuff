<script lang="ts" name="HomeRunApproval" setup>
import type { WorkspacePendingRun } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { TxButton } from '@talex-touch/tuffex/button'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * An orchestrator run of this conversation waiting for the user's go-ahead.
 *
 * This is the run gate, not the tool gate: the decision is keyed by the run id Main reported and
 * goes through the workspace's own approve / reject, which re-checks that the run still belongs to
 * this conversation and is still the one waiting before the orchestrator's approval runs. It shares
 * the composer stack with the gateway's tool card but neither its request id nor its remembered
 * approvals (A12).
 */
const props = defineProps<{
  run: WorkspacePendingRun
  profileName?: string
  deciding: 'approve' | 'reject' | null
}>()

const emit = defineEmits<{
  (event: 'approve'): void
  (event: 'reject'): void
}>()

const { t, locale } = useI18n()

const requestedAt = computed(() =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(
    props.run.requestedAt
  )
)
</script>

<template>
  <section
    class="HomeRunApproval"
    role="group"
    aria-labelledby="home-run-approval-title"
    :aria-busy="deciding !== null || undefined"
  >
    <header class="HomeRunApproval-Head">
      <span class="i-ri-shield-user-line HomeRunApproval-Icon" aria-hidden="true" />
      <h2 id="home-run-approval-title" class="HomeRunApproval-Title">
        {{ t('home.workspace.run.title') }}
      </h2>
    </header>
    <dl class="HomeRunApproval-Facts">
      <div class="HomeRunApproval-Fact">
        <dt>{{ t('home.workspace.run.profile') }}</dt>
        <dd>{{ profileName ?? run.profileId }}</dd>
      </div>
      <div v-if="run.approvalReason" class="HomeRunApproval-Fact">
        <dt>{{ t('home.workspace.run.reason') }}</dt>
        <dd>{{ run.approvalReason }}</dd>
      </div>
      <div class="HomeRunApproval-Fact">
        <dt>{{ t('home.workspace.run.requested') }}</dt>
        <dd>{{ requestedAt }}</dd>
      </div>
      <div class="HomeRunApproval-Fact">
        <dt>{{ t('home.workspace.run.id') }}</dt>
        <dd class="HomeRunApproval-Mono" :title="run.runId">{{ run.runId }}</dd>
      </div>
    </dl>
    <p class="HomeRunApproval-Note">{{ t('home.workspace.run.scope') }}</p>
    <div class="HomeRunApproval-Actions">
      <TxButton
        variant="secondary"
        size="sm"
        :loading="deciding === 'reject'"
        :disabled="deciding !== null"
        @click="emit('reject')"
      >
        {{ t('home.workspace.run.reject') }}
      </TxButton>
      <TxButton
        variant="primary"
        size="sm"
        :loading="deciding === 'approve'"
        :disabled="deciding !== null"
        @click="emit('approve')"
      >
        {{ t('home.workspace.run.approve') }}
      </TxButton>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.HomeRunApproval {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: var(--home-chat-lane-width);
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--shell-warning-border);
  border-radius: var(--shell-radius-lg);
  background: var(--shell-bg);
  box-sizing: border-box;
  pointer-events: auto;
}

.HomeRunApproval-Head {
  display: flex;
  gap: 8px;
  align-items: center;
}

.HomeRunApproval-Icon {
  flex: none;
  color: var(--shell-warning);
  font-size: 16px;
}

.HomeRunApproval-Title {
  margin: 0;
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 600;
}

.HomeRunApproval-Facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 12px;
  margin: 0;
}

.HomeRunApproval-Fact {
  display: contents;

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-sm);
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-sm);
    text-overflow: ellipsis;
    overflow-wrap: anywhere;
  }
}

.HomeRunApproval-Mono {
  font-family: var(--tx-font-family-mono, ui-monospace, monospace);
  font-size: 0.9em;
  white-space: nowrap;
}

.HomeRunApproval-Note {
  margin: 0;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-caption);
  line-height: 1.5;
}

.HomeRunApproval-Actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
