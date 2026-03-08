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
        <h2>{{ props.pilotTitle }}</h2>
        <p>活跃助手工作台</p>
      </div>
      <TxButton size="small" variant="primary" :disabled="props.running" @click="onCreateSession">
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
  border-right: 1px solid rgba(16, 32, 58, 0.12);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(10px);
}

.pilot-sidebar__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.pilot-brand h2 {
  margin: 0;
  font-size: 20px;
  line-height: 1.2;
}

.pilot-brand p {
  margin: 6px 0 0;
  font-size: 12px;
  color: rgba(16, 32, 58, 0.65);
}

.pilot-sessions__list {
  margin-top: 12px;
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
  background: rgba(255, 255, 255, 0.56);
}

.pilot-session-card.is-active {
  background: rgba(14, 101, 255, 0.12);
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
  background: rgba(14, 101, 255, 0.9);
}

.pilot-session-card__dot.is-unread {
  background: rgba(14, 101, 255, 0.9);
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
  color: rgba(16, 32, 58, 0.58);
}

@media (max-width: 960px) {
  .pilot-sidebar {
    max-height: 34vh;
    border-right: 0;
    border-bottom: 1px solid rgba(16, 32, 58, 0.12);
  }
}
</style>
