<script lang="ts" name="HomeMessageRail" setup>
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { computed, ref } from 'vue'

const props = defineProps<{
  items: ConversationMessage[]
}>()

const emit = defineEmits<{
  (event: 'navigate', index: number): void
}>()

const hoveredTurn = ref<string | null>(null)

interface PromptSegment {
  type: 'text' | 'image'
  value: string
}

interface TurnNavEntry {
  id: string
  turnNumber: number
  userIndex: number
  segments: PromptSegment[]
}

function parseSegments(content: string, attachments?: unknown[]): PromptSegment[] {
  const segments: PromptSegment[] = []
  let imgIdx = 0
  const pattern = /!\[.*?\]\(.*?\)/g
  let lastEnd = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content || '')) !== null) {
    const start = match.index
    const end = pattern.lastIndex
    if (start > lastEnd) {
      segments.push({ type: 'text', value: (content || '').slice(lastEnd, start) })
    }
    imgIdx++
    segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
    lastEnd = end
  }

  if (lastEnd < (content || '').length) {
    segments.push({ type: 'text', value: (content || '').slice(lastEnd) })
  }

  // Handle external attachments
  if (Array.isArray(attachments)) {
    attachments.forEach((att) => {
      const isImg =
        (typeof att === 'object' && att !== null && 'kind' in att && (att as any).kind === 'image') ||
        (typeof att === 'object' && att !== null && 'mimeType' in att && String((att as any).mimeType).startsWith('image/'))
      if (isImg) {
        imgIdx++
        segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
      }
    })
  }

  // Clean text segments
  return segments
    .map((seg) => {
      if (seg.type === 'text') {
        const cleaned = seg.value
          .replace(/```[\s\S]*?```/g, ' [代码] ')
          .replace(/^#+\s+/gm, '')
          .replace(/(\*\*|__)(.*?)\1/g, '$2')
          .replace(/(\*|_)(.*?)\1/g, '$2')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/\s+/g, ' ')
        return { type: 'text' as const, value: cleaned }
      }
      return seg
    })
    .filter((seg) => seg.type === 'image' || seg.value.trim().length > 0)
}

const turns = computed<TurnNavEntry[]>(() => {
  const result: TurnNavEntry[] = []

  props.items.forEach((msg, index) => {
    if (msg.role === 'user') {
      const rawText = msg.content || ''
      const segments = parseSegments(rawText, msg.attachments || (msg as any).modelAttachments)
      result.push({
        id: msg.id || `turn-${index}`,
        turnNumber: result.length + 1,
        userIndex: index,
        segments: segments.length ? segments : [{ type: 'text', value: rawText || '消息' }]
      })
    }
  })

  return result
})
</script>

<template>
  <nav
    v-if="turns.length > 0"
    class="HomeMessageRail"
    aria-label="消息大纲导航"
  >
    <div class="HomeMessageRail-Track">
      <div
        v-for="turn in turns"
        :key="turn.id"
        class="HomeMessageRail-Turn"
        :class="{
          'is-hovered': hoveredTurn === turn.id,
          'is-first': turn.turnNumber === 1
        }"
        @mouseenter="hoveredTurn = turn.id"
        @mouseleave="hoveredTurn = null"
      >
        <!-- 纯文本小字展示，绝无卡片背景与边框阴影，最多三行 -->
        <Transition name="rail-text">
          <div
            v-if="hoveredTurn === turn.id"
            class="HomeMessageRail-PromptText"
            @click.stop="emit('navigate', turn.userIndex)"
          >
            <template v-for="(seg, idx) in turn.segments" :key="idx">
              <span v-if="seg.type === 'image'" class="HomeMessageRail-ImageTag">{{ seg.value }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </div>
        </Transition>

        <!-- 触发横线 -->
        <button
          type="button"
          class="HomeMessageRail-BarWrap"
          :aria-label="`第 ${turn.turnNumber} 轮提问`"
          @click="emit('navigate', turn.userIndex)"
        >
          <span class="HomeMessageRail-Bar" />
          <span class="HomeMessageRail-Index">#{{ turn.turnNumber }}</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<style lang="scss" scoped>
.HomeMessageRail {
  position: absolute;
  top: 72px;
  right: 18px;
  bottom: calc(var(--home-composer-height, 112px) + 24px);
  z-index: 5;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  pointer-events: none;
  user-select: none;
}

.HomeMessageRail-Track {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 0;
  pointer-events: auto;
}

.HomeMessageRail-Turn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.HomeMessageRail-BarWrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.HomeMessageRail-Bar {
  height: 2px;
  width: 32px;
  border-radius: 999px;
  background: var(--shell-border);
  opacity: 0.65;
  transition:
    width 0.16s ease,
    background-color 0.15s ease,
    opacity 0.15s ease;

  .is-hovered & {
    width: 54px;
    background: var(--shell-primary, #409eff);
    opacity: 1;
  }
}

.HomeMessageRail-Index {
  font-size: 11px;
  color: var(--shell-text-muted);
  font-variant-numeric: tabular-nums;
  opacity: 0.5;
  min-width: 16px;
  text-align: right;
  transition: opacity 0.15s ease, color 0.15s ease;

  .is-hovered & {
    opacity: 1;
    color: var(--shell-primary, #409eff);
    font-weight: 600;
  }
}

/* 纯文本展示：无卡片、无背景、无边框、无阴影，限制最多三行 */
.HomeMessageRail-PromptText {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  width: 220px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--shell-text-secondary);
  word-break: break-word;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: right;
  pointer-events: none;
  z-index: 10;
  text-shadow: 0 1px 3px var(--shell-bg);

  .is-first & {
    bottom: auto;
    top: calc(100% + 4px);
  }
}

.HomeMessageRail-ImageTag {
  display: inline-block;
  padding: 0 3px;
  margin: 0 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--shell-primary, #409eff);
  background: color-mix(in srgb, var(--shell-primary, #409eff) 16%, transparent);
  border-radius: 3px;
  vertical-align: baseline;
}

.rail-text-enter-active,
.rail-text-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
}

.rail-text-enter-from,
.rail-text-leave-to {
  opacity: 0;
  transform: translateY(2px);

  .is-first & {
    transform: translateY(-2px);
  }
}
</style>
