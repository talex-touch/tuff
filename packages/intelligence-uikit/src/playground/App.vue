<script setup lang="ts">
import {
  TxAiAgentBadge,
  TxAiCitation,
  TxAiComposer,
  TxAiConversation,
  TxAiLoadingHint,
  TxAiResultCard,
  TxAiSuggestion,
  TxAiToolCall,
} from '../index'
import { usePlaygroundState } from './usePlaygroundState'

const {
  activeSession,
  activeSessionConfig,
  activeStep,
  branch,
  canSendLive,
  composerAttachments,
  completeTimeline,
  currentStepLabel,
  draft,
  generating,
  isLiveMode,
  isPlaying,
  liveAuditRecords,
  liveGenerating,
  liveMessages,
  liveSessionId,
  liveStatusText,
  messages,
  modeLabel,
  nextTimelineStep,
  phase,
  phaseOptions,
  playFromStart,
  resetLiveConversation,
  resetTimeline,
  runMode,
  selectBranch,
  selectPhase,
  selectSession,
  sendDraft,
  sessionConfigs,
  setRunMode,
  settings,
  stopPlayback,
  timelineIndex,
  timelineSteps,
  toolStatus,
  workspacePhase,
} = usePlaygroundState()
</script>

<template>
  <main class="uikit-mockup" :data-phase="workspacePhase">
    <aside class="uikit-mockup__rail">
      <div class="uikit-mockup__brand">
        <span class="uikit-mockup__mark">iu</span>
        <div>
          <strong>intelligence-uikit</strong>
          <span>mock workspace</span>
        </div>
      </div>

      <div class="uikit-mockup__mode" role="group" aria-label="Run mode">
        <button
          type="button"
          :class="{ 'is-active': runMode === 'mock' }"
          @click="setRunMode('mock')"
        >
          Mock
        </button>
        <button
          type="button"
          :class="{ 'is-active': runMode === 'live' }"
          @click="setRunMode('live')"
        >
          Live
        </button>
      </div>

      <section class="uikit-mockup__settings">
        <h2>DeepAgent</h2>
        <label>
          <span>Base URL</span>
          <input v-model="settings.baseUrl" type="url" spellcheck="false" placeholder="https://api.openai.com/v1">
        </label>
        <label>
          <span>API Key</span>
          <input v-model="settings.apiKey" type="password" spellcheck="false" autocomplete="off" placeholder="sk-...">
        </label>
        <label>
          <span>Model</span>
          <input v-model="settings.model" type="text" spellcheck="false" placeholder="gpt-5.4">
        </label>
        <label>
          <span>Transport</span>
          <select v-model="settings.transport">
            <option value="auto">auto</option>
            <option value="responses">responses</option>
            <option value="chat.completions">chat.completions</option>
          </select>
        </label>
        <label>
          <span>System Prompt</span>
          <textarea v-model="settings.systemPrompt" spellcheck="false" rows="4" />
        </label>
      </section>

      <nav class="uikit-mockup__sessions" aria-label="Mock sessions">
        <button
          v-for="session in sessionConfigs"
          :key="session.id"
          type="button"
          :class="{ 'is-active': activeSession === session.id }"
          @click="selectSession(session.id)"
        >
          {{ session.title }}
        </button>
      </nav>

      <TxAiAgentBadge
        :name="isLiveMode ? 'DeepAgent Adapter' : activeSessionConfig.adapterName"
        :description="isLiveMode ? (canSendLive ? 'live ready' : 'missing config') : activeSessionConfig.adapterDescription"
        tone="primary"
      />
    </aside>

    <section class="uikit-mockup__workspace">
      <header class="uikit-mockup__topbar">
        <div>
          <p class="uikit-mockup__eyebrow">
            {{ activeSessionConfig.eyebrow }}
          </p>
          <h1>{{ activeSessionConfig.heading }}</h1>
          <p class="uikit-mockup__step">
            {{ modeLabel }} · {{ currentStepLabel }}
          </p>
        </div>

        <div v-if="!isLiveMode" class="uikit-mockup__segmented" role="group" aria-label="Mock phase">
          <button
            v-for="item in phaseOptions"
            :key="item.value"
            type="button"
            :class="{ 'is-active': phase === item.value }"
            @click="selectPhase(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </header>

      <TxAiConversation
        class="uikit-mockup__conversation"
        :messages="messages"
        :generating="generating"
        @stop="isLiveMode ? resetLiveConversation() : completeTimeline()"
      >
        <template #before>
          <div class="uikit-mockup__timeline-note">
            <TxAiLoadingHint
              :label="isLiveMode ? 'DeepAgent runtime' : 'Runtime trace'"
              :description="isLiveMode ? liveStatusText : 'session restored, stream cursor attached'"
              :status="toolStatus"
            />
          </div>
        </template>
      </TxAiConversation>

      <div v-if="!isLiveMode" class="uikit-mockup__suggestions">
        <TxAiSuggestion
          v-for="suggestion in activeSessionConfig.suggestions"
          :key="suggestion"
          :text="suggestion"
          @select="draft = $event"
        />
      </div>

      <TxAiComposer
        v-model="draft"
        class="uikit-mockup__composer"
        placeholder="输入消息..."
        show-attachment-button
        :submitting="generating"
        :disabled="isLiveMode && !canSendLive"
        :attachments="composerAttachments"
        @send="sendDraft"
      />
    </section>

    <aside class="uikit-mockup__inspector">
      <section v-if="!isLiveMode">
        <h2>Timeline</h2>
        <div class="uikit-mockup__timeline-controls">
          <button type="button" class="is-primary" @click="playFromStart">
            {{ isPlaying ? 'Restart' : 'Play from start' }}
          </button>
          <button type="button" @click="nextTimelineStep">
            Next
          </button>
          <button type="button" @click="resetTimeline">
            Reset
          </button>
        </div>

        <div class="uikit-mockup__branch" role="group" aria-label="Timeline branch">
          <button
            type="button"
            :class="{ 'is-active': branch === 'success' }"
            @click="selectBranch('success')"
          >
            Success
          </button>
          <button
            type="button"
            :class="{ 'is-active': branch === 'error' }"
            @click="selectBranch('error')"
          >
            Error
          </button>
        </div>

        <ol class="uikit-mockup__timeline-list">
          <li
            v-for="(step, index) in timelineSteps"
            :key="step.label"
            :class="{
              'is-active': index === timelineIndex,
              'is-done': index < timelineIndex,
            }"
          >
            <button type="button" @click="timelineIndex = index; stopPlayback()">
              <span>{{ index + 1 }}</span>
              <strong>{{ step.label }}</strong>
            </button>
          </li>
        </ol>
      </section>

      <section v-else>
        <h2>Live session</h2>
        <div class="uikit-mockup__timeline-controls">
          <button type="button" class="is-primary" :disabled="liveGenerating" @click="resetLiveConversation">
            New chat
          </button>
          <button type="button" @click="setRunMode('mock')">
            Back to mock
          </button>
        </div>
        <div class="uikit-mockup__live-meta">
          <span>Session</span>
          <strong>{{ liveSessionId }}</strong>
        </div>
        <div class="uikit-mockup__live-meta">
          <span>Messages</span>
          <strong>{{ liveMessages.length }}</strong>
        </div>
      </section>

      <section>
        <h2>Run state</h2>
        <TxAiToolCall
          :name="isLiveMode ? 'DeepAgent request' : 'Pilot timeline'"
          :status="toolStatus"
          :description="isLiveMode ? liveStatusText : activeStep.description"
        />
      </section>

      <section>
        <h2>Result shell</h2>
        <TxAiResultCard
          title="Reusable component boundary"
          :description="`Current scene: ${activeSessionConfig.title}.`"
          tone="info"
        >
          <div class="uikit-mockup__metric-row">
            <span>Blocks</span>
            <strong>{{ isLiveMode ? liveMessages.length : 4 }}</strong>
          </div>
          <div class="uikit-mockup__metric-row">
            <span>{{ isLiveMode ? 'Audit events' : 'Motion hooks' }}</span>
            <strong>{{ isLiveMode ? liveAuditRecords.length : 6 }}</strong>
          </div>
        </TxAiResultCard>
      </section>

      <section v-if="isLiveMode">
        <h2>Audit</h2>
        <div class="uikit-mockup__audit-list">
          <p v-if="liveAuditRecords.length <= 0">
            No audit events yet.
          </p>
          <article v-for="record in liveAuditRecords" :key="record.id">
            <strong>{{ record.type }}</strong>
            <span>{{ record.summary }}</span>
          </article>
        </div>
      </section>

      <section>
        <h2>Citations</h2>
        <div class="uikit-mockup__citations">
          <TxAiCitation
            v-for="(citation, index) in activeSessionConfig.citations"
            :key="citation.title"
            :title="citation.title"
            :index="index + 1"
            :description="citation.description"
          />
        </div>
      </section>
    </aside>
  </main>
</template>

<style scoped lang="scss">
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  background:
    linear-gradient(135deg, rgb(245 247 248) 0%, rgb(238 243 241) 48%, rgb(247 246 242) 100%);
  color: #171a1d;
  font-size: 14px;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
}

button {
  font: inherit;
}

.uikit-mockup {
  --mock-accent: #2f8a6f;
  --mock-accent-2: #c87836;
  --mock-border: rgb(28 34 38 / 10%);
  --mock-surface: rgb(255 255 255 / 82%);
  --mock-muted: #687178;

  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 320px;
  gap: 1px;
  width: 100vw;
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background: var(--mock-border);
}

.uikit-mockup__rail,
.uikit-mockup__workspace,
.uikit-mockup__inspector {
  height: 100svh;
  min-height: 0;
  background: var(--mock-surface);
  backdrop-filter: blur(20px) saturate(145%);
}

.uikit-mockup__rail,
.uikit-mockup__inspector {
  padding: 18px;
}

.uikit-mockup__rail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
}

.uikit-mockup__brand {
  display: flex;
  align-items: center;
  gap: 12px;

  strong,
  span {
    display: block;
  }

  strong {
    font-size: 14px;
  }

  span {
    color: var(--mock-muted);
    font-size: 12px;
  }
}

.uikit-mockup__mark {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: #1c2427;
  color: #f5f7f8;
  font-weight: 700;
}

.uikit-mockup__sessions {
  display: grid;
  gap: 6px;

  button {
    width: 100%;
    border: 0;
    border-radius: 10px;
    background: transparent;
    padding: 8px 10px;
    color: #30363a;
    font-size: 14px;
    text-align: left;
    cursor: pointer;

    &.is-active,
    &:hover {
      background: rgb(47 138 111 / 11%);
      color: #173d33;
    }
  }
}

.uikit-mockup__mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  border: 1px solid var(--mock-border);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  padding: 4px;

  button {
    border: 0;
    border-radius: 9px;
    background: transparent;
    padding: 7px 8px;
    color: var(--mock-muted);
    font-size: 13px;
    cursor: pointer;

    &.is-active {
      background: #1d2527;
      color: #fff;
    }
  }
}

.uikit-mockup__settings {
  display: grid;
  gap: 9px;
  border: 1px solid var(--mock-border);
  border-radius: 14px;
  background: rgb(255 255 255 / 52%);
  padding: 12px;

  h2 {
    margin: 0 0 2px;
    color: #2c3337;
    font-size: 13px;
    line-height: 1.2;
  }

  label {
    display: grid;
    gap: 5px;
  }

  label span {
    color: var(--mock-muted);
    font-size: 11px;
    line-height: 1.2;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid color-mix(in srgb, var(--mock-border) 78%, transparent);
    border-radius: 10px;
    background: rgb(255 255 255 / 72%);
    padding: 7px 9px;
    color: #1d2527;
    font: inherit;
    font-size: 12px;
    outline: none;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      background 160ms ease;

    &:focus {
      border-color: rgb(47 138 111 / 38%);
      background: #fff;
      box-shadow: 0 0 0 3px rgb(47 138 111 / 9%);
    }
  }

  textarea {
    min-height: 86px;
    resize: vertical;
    line-height: 1.45;
  }
}

.uikit-mockup__workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  min-width: 0;
  overflow: hidden;
}

.uikit-mockup__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--mock-border);
  padding: 14px 22px;

  h1,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 2px;
    font-size: 24px;
    line-height: 1.18;
  }
}

.uikit-mockup__eyebrow {
  color: var(--mock-muted);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.uikit-mockup__step {
  margin: 7px 0 0;
  color: var(--mock-muted);
  font-size: 12px;
  line-height: 1.4;
}

.uikit-mockup__segmented {
  display: inline-flex;
  gap: 4px;
  border: 1px solid var(--mock-border);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  padding: 4px;

  button {
    border: 0;
    border-radius: 9px;
    background: transparent;
    padding: 6px 10px;
    color: var(--mock-muted);
    font-size: 14px;
    cursor: pointer;

    &.is-active {
      background: #1d2527;
      color: #fff;
    }
  }
}

.uikit-mockup__conversation {
  min-height: 0;

  :deep(.tx-ai-conversation__list) {
    padding: 16px 12px 68px;
  }

  :deep(.tx-chat-message__bubble) {
    padding: 9px 11px;
    font-size: 14px;
    line-height: 1.55;
  }

  :deep(.tx-ai-rich-block) {
    animation: uikit-block-enter 220ms ease both;
  }

  :deep(.tx-ai-rich-block:nth-child(2)) {
    animation-delay: 30ms;
  }

  :deep(.tx-ai-rich-block:nth-child(3)) {
    animation-delay: 60ms;
  }

  :deep(.tx-ai-rich-block:nth-child(4)) {
    animation-delay: 90ms;
  }

  :deep(.tx-ai-rich-block:nth-child(5)) {
    animation-delay: 120ms;
  }

  :deep(.tx-ai-rich-block:nth-child(6)) {
    animation-delay: 150ms;
  }

  :deep(.tx-ai-rich-block:nth-child(7)) {
    animation-delay: 180ms;
  }

  :deep(.tx-markdown-view) {
    font-size: 14px;
    line-height: 1.6;
  }

  :deep(.tx-markdown-view .markdown-body h3) {
    margin: 0 0 8px;
    font-size: 16px;
    line-height: 1.35;
  }

  :deep(.tx-markdown-view .markdown-body p),
  :deep(.tx-markdown-view .markdown-body ul) {
    margin: 6px 0;
  }

  :deep(.tx-markdown-view .markdown-body blockquote) {
    margin: 10px 0;
    padding: 9px 12px;
  }

  :deep(.tx-ai-conversation__floating) {
    bottom: 18px;
  }
}

.uikit-mockup__timeline-note {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.uikit-mockup__suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-top: 1px solid var(--mock-border);
  padding: 10px 22px;
}

.uikit-mockup__composer {
  width: auto;
  margin: 0 22px 18px;
}

.uikit-mockup__inspector {
  display: grid;
  align-content: start;
  gap: 22px;
  overflow: auto;

  h2 {
    margin: 0 0 10px;
    color: #2c3337;
    font-size: 13px;
    font-weight: 700;
  }
}

.uikit-mockup__timeline-controls,
.uikit-mockup__branch {
  display: flex;
  gap: 8px;
}

.uikit-mockup__timeline-controls {
  flex-wrap: wrap;

  button {
    border: 1px solid var(--mock-border);
    border-radius: 10px;
    background: rgb(255 255 255 / 76%);
    padding: 7px 10px;
    color: #283033;
    font-size: 14px;
    cursor: pointer;

    &.is-primary {
      border-color: rgb(47 138 111 / 24%);
      background: #1d2527;
      color: #fff;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.54;
    }
  }
}

.uikit-mockup__branch {
  margin-top: 10px;
  border: 1px solid var(--mock-border);
  border-radius: 12px;
  background: rgb(255 255 255 / 54%);
  padding: 4px;

  button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    background: transparent;
    padding: 7px 8px;
    color: var(--mock-muted);
    font-size: 14px;
    cursor: pointer;

    &.is-active {
      background: rgb(47 138 111 / 13%);
      color: #173d33;
    }
  }
}

.uikit-mockup__timeline-list {
  display: grid;
  gap: 4px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;

  button {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    width: 100%;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    padding: 6px 8px;
    color: var(--mock-muted);
    text-align: left;
    cursor: pointer;
  }

  span {
    display: inline-flex;
    width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgb(29 37 39 / 7%);
    color: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  strong {
    overflow: hidden;
    color: inherit;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  li.is-done button {
    color: #2f8a6f;
  }

  li.is-active button {
    background: rgb(47 138 111 / 10%);
    color: #173d33;
  }
}

.uikit-mockup__metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--mock-border);
  padding: 9px 0;
  color: var(--mock-muted);

  strong {
    color: #1d2527;
  }
}

.uikit-mockup__citations {
  display: grid;
  gap: 8px;
}

.uikit-mockup__live-meta {
  display: grid;
  gap: 3px;
  margin-top: 10px;
  border-top: 1px solid var(--mock-border);
  padding-top: 9px;

  span {
    color: var(--mock-muted);
    font-size: 11px;
  }

  strong {
    overflow: hidden;
    color: #1d2527;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.uikit-mockup__audit-list {
  display: grid;
  gap: 8px;

  p {
    margin: 0;
    color: var(--mock-muted);
    font-size: 12px;
  }

  article {
    display: grid;
    gap: 3px;
    border: 1px solid var(--mock-border);
    border-radius: 10px;
    background: rgb(255 255 255 / 56%);
    padding: 8px 9px;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #1d2527;
    font-size: 12px;
  }

  span {
    color: var(--mock-muted);
    font-size: 11px;
  }
}

[data-phase="streaming"] {
  .tx-ai-message--streaming {
    :deep(.tx-chat-message__bubble) {
      border-color: rgb(47 138 111 / 32%);
      box-shadow: 0 12px 40px rgb(47 138 111 / 10%);
    }
  }
}

[data-phase="error"] {
  --mock-accent: #b75d4c;
}

@keyframes uikit-block-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .uikit-mockup {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .uikit-mockup__inspector {
    display: none;
  }
}

@media (max-width: 760px) {
  .uikit-mockup {
    grid-template-columns: 1fr;
  }

  .uikit-mockup__rail {
    display: none;
  }

  .uikit-mockup__topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .uikit-mockup__segmented {
    width: 100%;
    overflow-x: auto;
  }
}
</style>
