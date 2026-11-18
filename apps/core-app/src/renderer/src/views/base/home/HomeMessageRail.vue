<script lang="ts" name="HomeMessageRail" setup>
import type { TxAiMessageModel, TxAiRailTurn } from '@talex-touch/intelligence-uikit'
import { buildMessageRailTurns } from '@talex-touch/intelligence-uikit/utils'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: ConversationMessage[]
    activeIndex?: number
  }>(),
  { activeIndex: -1 }
)

const emit = defineEmits<{
  (event: 'navigate', index: number): void
}>()

const hoveredTurn = ref<string | null>(null)

interface PromptSegment {
  type: 'text' | 'image'
  value: string
}

interface TurnNavEntry extends TxAiRailTurn {
  segments: PromptSegment[]
}

const IMAGE_SENTINEL = '§§RAILIMAGE§§'

function isImageAttachment(att: unknown): boolean {
  if (typeof att !== 'object' || att === null) return false
  if ('kind' in att && (att as { kind?: unknown }).kind === 'image') return true
  if ('mimeType' in att && String((att as { mimeType?: unknown }).mimeType).startsWith('image/'))
    return true
  return false
}

function resolveImageAttachmentCount(message: ConversationMessage): number {
  const attachments =
    message.attachments ??
    (message as ConversationMessage & { modelAttachments?: unknown[] }).modelAttachments
  if (!Array.isArray(attachments)) return 0
  return attachments.filter(isImageAttachment).length
}

function toPromptSegments(
  title: string,
  hasContent: boolean,
  extraImageCount: number
): PromptSegment[] {
  const segments: PromptSegment[] = []
  let imgIdx = 0
  if (hasContent || extraImageCount === 0) {
    const parts = title.split(IMAGE_SENTINEL)
    parts.forEach((part, index) => {
      if (part.trim().length > 0) {
        segments.push({ type: 'text', value: part })
      }
      if (index < parts.length - 1) {
        imgIdx += 1
        segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
      }
    })
  }
  for (let i = 0; i < extraImageCount; i += 1) {
    imgIdx += 1
    segments.push({ type: 'image', value: `#IMAGE${imgIdx}` })
  }
  return segments.length ? segments : [{ type: 'text', value: '消息' }]
}

const railMessages = computed<TxAiMessageModel[]>(() =>
  props.items.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content
  }))
)

const turns = computed<TurnNavEntry[]>(() =>
  buildMessageRailTurns(railMessages.value, {
    imageTag: IMAGE_SENTINEL,
    codeTag: '[代码]',
    fallbackLabel: '消息',
    maxLength: 200
  }).map((turn) => {
    const source = props.items[turn.messageIndex]
    const extraImages = source ? resolveImageAttachmentCount(source) : 0
    return {
      ...turn,
      segments: toPromptSegments(turn.title, Boolean(source?.content?.trim()), extraImages)
    }
  })
)
</script>

<template>
  <nav v-if="turns.length > 0" class="HomeMessageRail" aria-label="消息大纲导航">
    <div class="HomeMessageRail-Track">
      <div
        v-for="turn in turns"
        :key="turn.key"
        class="HomeMessageRail-Turn"
        :class="{
          'is-active': activeIndex === turn.messageIndex,
          'is-hovered': hoveredTurn === turn.key,
          'is-first': turn.turnNumber === 1
        }"
        @mouseenter="hoveredTurn = turn.key"
        @mouseleave="hoveredTurn = null"
      >
        <!-- 纯文本小字展示，绝无卡片背景与边框阴影，最多三行 -->
        <Transition name="rail-text">
          <div
            v-if="hoveredTurn === turn.key"
            class="HomeMessageRail-PromptText"
            @click.stop="emit('navigate', turn.messageIndex)"
          >
            <template v-for="(seg, idx) in turn.segments" :key="idx">
              <span v-if="seg.type === 'image'" class="HomeMessageRail-ImageTag">{{
                seg.value
              }}</span>
              <template v-else>{{ seg.value }}</template>
            </template>
          </div>
        </Transition>

        <!-- 触发横线 -->
        <button
          type="button"
          class="HomeMessageRail-BarWrap"
          :aria-label="`第 ${turn.turnNumber} 轮提问`"
          :aria-current="activeIndex === turn.messageIndex ? 'true' : undefined"
          @click="emit('navigate', turn.messageIndex)"
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
  transition:
    opacity 0.15s ease,
    color 0.15s ease;

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
