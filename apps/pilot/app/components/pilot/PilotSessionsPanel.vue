<script setup lang="ts">
import type { PilotSessionRow } from '../../composables/pilot-chat.types'
import { TxButton, TxEmptyState } from '@talex-touch/tuffex'

interface PilotSessionsPanelProps {
  pilotTitle: string
  sessions: PilotSessionRow[]
  activeSessionId: string
  loadingSessions: boolean
  running: boolean
  deletingSessionId: string
}

const props = defineProps<PilotSessionsPanelProps>()

const emit = defineEmits<{
  (e: 'createSession'): void
  (e: 'selectSession', sessionId: string): void
  (e: 'deleteSession', sessionId: string): void
}>()

function onSelectSession(sessionId: string) {
  emit('selectSession', sessionId)
}

function onDeleteSession(sessionId: string) {
  emit('deleteSession', sessionId)
}

function onCreateSession() {
  emit('createSession')
}
</script>

<template>
  <aside class="pilot-sidebar">
    <header class="pilot-sidebar__header">
      <div class="pilot-brand">
        <span class="pilot-brand__mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M13.34 1.45c.22-.51 1.02-.36 1.03.19v7.59h5.06c.52 0 .78.61.42.98l-8.93 9.95c-.37.41-1.03.02-.85-.49l1.89-5.33H6.91c-.54 0-.79-.65-.38-1L13.34 1.45z"
              fill="currentColor"
            />
          </svg>
        </span>
        <div class="pilot-brand__copy">
          <h2>{{ props.pilotTitle }}</h2>
          <p>PREMIUM INTELLIGENCE</p>
        </div>
      </div>
      <TxButton class="pilot-sidebar__create" size="small" variant="primary" :disabled="props.running" @click="onCreateSession">
        新建
      </TxButton>
    </header>

    <div class="pilot-sessions__list">
      <TxEmptyState
        v-if="props.loadingSessions"
        variant="loading"
        size="small"
        title="正在加载会话..."
        description=""
      />
      <TxEmptyState
        v-else-if="props.sessions.length <= 0"
        variant="no-data"
        size="small"
        title="暂无会话"
        description="点击右上角“新建”开始"
      />

      <article
        v-for="item in props.sessions"
        :key="item.sessionId"
        class="pilot-session-card"
        :class="{
          'is-active': item.sessionId === props.activeSessionId,
        }"
        role="button"
        tabindex="0"
        @click="onSelectSession(item.sessionId)"
        @keydown.enter.prevent="onSelectSession(item.sessionId)"
        @keydown.space.prevent="onSelectSession(item.sessionId)"
      >
        <div class="pilot-session-card__top">
          <h3 :title="item.title">
            {{ item.title }}
          </h3>
          <div class="pilot-session-card__tail">
            <span
              v-if="item.notifyUnread"
              class="pilot-session-card__dot"
              :class="{ 'is-unread': item.notifyUnread }"
            />
            <TxButton
              class="pilot-session-card__delete"
              size="mini"
              variant="ghost"
              :disabled="(props.running && props.activeSessionId === item.sessionId) || props.deletingSessionId === item.sessionId"
              @click.stop="onDeleteSession(item.sessionId)"
            >
              删除
            </TxButton>
          </div>
        </div>

        <p v-if="item.titleLoading" class="pilot-session-card__sub">
          AI 正在总结标题...
        </p>
      </article>
    </div>
  </aside>
</template>

<style scoped>
.pilot-sidebar {
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: clamp(12px, 1.2vw, 18px);
  border-right: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 84%, transparent);
  backdrop-filter: blur(10px);
}

.pilot-sidebar__header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 12px;
}

.pilot-brand {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 16px;
  padding: 12px 12px 12px 10px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 26%, var(--tx-border-color));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tx-color-primary-light-5) 40%, var(--tx-bg-color-overlay)) 0%,
    color-mix(in srgb, var(--tx-bg-color-overlay) 84%, var(--tx-fill-color-lighter)) 100%
  );
  overflow: hidden;
}

.pilot-brand::after {
  content: '';
  position: absolute;
  inset: auto -18px -20px auto;
  width: 86px;
  height: 86px;
  border-radius: 999px;
  background: radial-gradient(circle, color-mix(in srgb, var(--tx-color-primary) 30%, transparent) 0%, transparent 72%);
  pointer-events: none;
  z-index: -1;
}

.pilot-brand__mark {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: color-mix(in srgb, #0f1827 80%, var(--tx-text-color-primary));
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--tx-color-success) 82%, white) 0%,
    color-mix(in srgb, var(--tx-color-primary) 72%, var(--tx-color-success)) 100%
  );
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, #ffffff 24%, transparent),
    0 12px 22px color-mix(in srgb, var(--tx-color-primary) 20%, transparent);
}

.pilot-brand__mark svg {
  width: 20px;
  height: 20px;
}

.pilot-brand__copy {
  min-width: 0;
}

.pilot-brand h2 {
  margin: 0;
  font-size: clamp(18px, 1.5vw, 22px);
  line-height: 1.2;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pilot-brand p {
  margin: 4px 0 0;
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.19em;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-color-primary) 76%, var(--tx-color-success));
}

.pilot-sidebar__create {
  width: 100%;
  border-radius: 999px;
}

.pilot-sessions__list {
  margin-top: 14px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  padding-right: 2px;
}

.pilot-session-card {
  border: 0;
  border-radius: 10px;
  background: transparent;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: background-color 140ms ease;
}

.pilot-session-card:hover {
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 64%, transparent);
}

.pilot-session-card.is-active {
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
}

.pilot-session-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pilot-session-card__top h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pilot-session-card__tail {
  position: relative;
  flex: 0 0 46px;
  width: 46px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pilot-session-card__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--tx-color-primary);
}

.pilot-session-card__dot.is-unread {
  background: var(--tx-color-primary);
}

.pilot-session-card__delete {
  position: absolute;
  right: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.pilot-session-card:hover .pilot-session-card__delete,
.pilot-session-card:focus-within .pilot-session-card__delete {
  opacity: 1;
  pointer-events: auto;
}

.pilot-session-card:hover .pilot-session-card__dot,
.pilot-session-card:focus-within .pilot-session-card__dot {
  opacity: 0;
}

.pilot-session-card__sub {
  margin: 0;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

@media (max-width: 960px) {
  .pilot-sidebar {
    max-height: 34vh;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  }

  .pilot-brand {
    border-radius: 14px;
    padding: 10px;
  }

  .pilot-brand__mark {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
  }
}
</style>
