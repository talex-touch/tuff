<script setup lang="ts">
import type { PilotSessionRow } from '../../composables/pilot-chat.types'
import { TxButton, TxEmptyState } from '@talex-touch/tuffex'
import PilotSidebarHeader from './PilotSidebarHeader.vue'

interface PilotSessionsPanelProps {
  pilotTitle: string
  sessions: PilotSessionRow[]
  activeSessionId: string
  collapsed: boolean
  loadingSessions: boolean
  deletingSessionId: string
}

const props = defineProps<PilotSessionsPanelProps>()

const emit = defineEmits<{
  (e: 'createSession'): void
  (e: 'toggleCollapse'): void
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

function onToggleCollapse() {
  emit('toggleCollapse')
}
</script>

<template>
  <aside class="pilot-sidebar" :class="{ 'is-collapsed': props.collapsed }">
    <PilotSidebarHeader
      :pilot-title="props.pilotTitle"
      :collapsed="props.collapsed"
      @create-session="onCreateSession"
      @toggle-collapse="onToggleCollapse"
    />

    <div v-if="!props.collapsed" class="pilot-auth-entry">
      <a class="pilot-auth-entry__link" href="/auth/login?returnTo=%2F">
        授权登录 Nexus
      </a>
      <a class="pilot-auth-entry__link pilot-auth-entry__link--admin" href="/admin/system/pilot-settings">
        Pilot 设置
      </a>
    </div>

    <div v-if="!props.collapsed" class="pilot-sessions__list">
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
        description="点击左上角 Logo 开始"
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
              :disabled="Boolean(item.running) || props.deletingSessionId === item.sessionId"
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
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  border-right: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 84%, transparent);
  backdrop-filter: blur(10px);
}

.pilot-sidebar.is-collapsed {
  padding-inline: 10px;
}

.pilot-sessions__list {
  margin-top: 10px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: auto;
  padding-right: 2px;
}

.pilot-auth-entry {
  margin-top: 8px;
}

.pilot-auth-entry__link {
  display: inline-flex;
  width: 100%;
  justify-content: center;
  align-items: center;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 78%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-lighter) 62%, transparent);
  color: color-mix(in srgb, var(--tx-text-color-primary) 90%, var(--tx-color-primary));
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 8px 10px;
  transition: background-color 140ms ease;
}

.pilot-auth-entry__link:hover {
  background: color-mix(in srgb, var(--tx-fill-color-light) 72%, transparent);
}

.pilot-auth-entry__link--admin {
  margin-top: 6px;
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
}
</style>
