<script lang="ts" name="ComposerToolbar" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import type { SendState } from './send-state'
import type { DictationOutcome, DictationState } from './useComposerDictation'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import HomeModelMenu from '../HomeModelMenu.vue'
import HomePermissionMenu from '../HomePermissionMenu.vue'
import ComposerControl from './ComposerControl.vue'
import ComposerMic from './ComposerMic.vue'
import ComposerModelPill from './ComposerModelPill.vue'
import ComposerSendIsland from './ComposerSendIsland.vue'
import {
  animateElement,
  COMPOSER_MOTION,
  EASE_IN,
  EASE_OUT_STRONG,
  entryFrame,
  exitFrame,
  prefersReducedMotion,
  releaseCurve
} from './composer-motion'
import { isCapsuleSendState } from './send-state'

/**
 * The composer's tool row as one family (task `09-26-composer-controls-redesign` §1): 32px
 * controls, no strokes, three materials — quiet (`+`, microphone), tonal (permission, model), solid
 * (send) — and one press.
 *
 * The row is laid out once. The microphone and the send key live in fixed 32×32 slots; their
 * capsules are absolutely positioned inside those slots and grow left over their neighbours —
 * the stop capsule over the microphone's slot, the dictation capsule over the model pill — so
 * nothing in the row reflows while they morph. The negative margins put every control's outer
 * edge 8px from the composer's, where a 16px radius is concentric with its 24px corner.
 */
const props = withDefaults(
  defineProps<{
    permissionMode: AgentToolsMode
    model: { label: string; icon?: ITuffIcon; effort?: string }
    sendState: SendState
    micState: DictationState
    micLevels: readonly number[]
    micElapsedMs?: number
    micOutcome?: DictationOutcome | null
  }>(),
  { micElapsedMs: 0, micOutcome: null }
)

const emit = defineEmits<{
  (event: 'update:permissionMode', mode: AgentToolsMode): void
  (event: 'files', files: File[]): void
  (event: 'send'): void
  (event: 'stop'): void
  (event: 'mic'): void
  (event: 'reset-approvals'): void
}>()

const { t } = useI18n()
const { micYield } = COMPOSER_MOTION

const fileInputRef = ref<HTMLInputElement | null>(null)
const islandRef = ref<InstanceType<typeof ComposerSendIsland> | null>(null)
const modelSlotRef = ref<HTMLElement | null>(null)
const micSlotRef = ref<HTMLElement | null>(null)

/** The stop capsule covers the microphone's slot (the island says when). */
const micYielded = ref(isCapsuleSendState(props.sendState))
/** The dictation capsule covers the model pill (the microphone says when). */
const modelYielded = ref(false)
/** What the dictation capsule must span to cover the model pill; measured at the press. */
const micCoverWidth = ref(0)

function onFilePick(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('files', Array.from(input.files ?? []))
  // Clearing lets the same file be picked twice in a row.
  input.value = ''
}

/**
 * From the model slot's left edge to the microphone slot's right edge, in layout pixels (both slots
 * share the right cluster as offset parent, so a transform on the composer does not skew it). Read
 * once per session, at the press.
 */
function measureCover(): void {
  const model = modelSlotRef.value
  const micSlot = micSlotRef.value
  if (!model || !micSlot) return
  micCoverWidth.value = Math.max(0, micSlot.offsetLeft + micSlot.offsetWidth - model.offsetLeft)
}

watch(
  () => props.micState,
  (state, previous) => {
    if (previous === 'idle' && state !== 'idle') measureCover()
  }
)

let modelAnimations: Animation[] = []

/**
 * The model pill gives way under the dictation capsule on the microphone's yield numbers, each way
 * from the frame on screen (a session that failed at once reverses the yield mid-way).
 */
watch(modelYielded, (yielded) => {
  const el = modelSlotRef.value
  const from = prefersReducedMotion()
    ? null
    : yielded
      ? exitFrame(el, { opacity: 1, scale: 1 })
      : entryFrame(el, { opacity: 0, scale: micYield.scale })
  for (const animation of modelAnimations) animation.cancel()
  modelAnimations = []
  if (!el || !from) return
  if (yielded) {
    const out = animateElement(el, [from, { opacity: 0, scale: micYield.scale }], {
      duration: micYield.outMs,
      easing: EASE_IN
    })
    if (out) modelAnimations.push(out)
    return
  }
  const curve = releaseCurve()
  const back = [
    animateElement(el, [{ scale: from.scale }, { scale: 1 }], {
      duration: curve.duration,
      easing: curve.easing
    }),
    animateElement(el, [{ opacity: from.opacity }, { opacity: 1 }], {
      duration: micYield.backFadeMs,
      easing: EASE_OUT_STRONG
    })
  ]
  for (const animation of back) if (animation) modelAnimations.push(animation)
})

onBeforeUnmount(() => {
  for (const animation of modelAnimations) animation.cancel()
  modelAnimations = []
})

/** T3, at the press — `submit()` calls it right after its guard. */
function launch(): void {
  islandRef.value?.launch()
}

defineExpose({ launch })
</script>

<template>
  <div class="ComposerToolbar">
    <div class="ComposerToolbar-Left">
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="ComposerToolbar-FileInput"
        tabindex="-1"
        :aria-label="t('home.attach')"
        @change="onFilePick"
      />
      <!-- Usable while a reply streams: attachments wait in the tray for the next send. -->
      <ComposerControl :label="t('home.attach')" @click="fileInputRef?.click()">
        <span class="i-ri-add-line" />
      </ComposerControl>
      <HomePermissionMenu
        :mode="permissionMode"
        @update:mode="emit('update:permissionMode', $event)"
        @reset="emit('reset-approvals')"
      />
    </div>

    <div class="ComposerToolbar-Right">
      <div
        ref="modelSlotRef"
        class="ComposerToolbar-ModelSlot"
        :class="{ 'is-yielded': modelYielded }"
        :inert="modelYielded || undefined"
        :aria-hidden="modelYielded || undefined"
      >
        <HomeModelMenu placement="top-end">
          <template #trigger="{ open }">
            <ComposerModelPill
              :label="model.label"
              :icon="model.icon"
              :effort="model.effort"
              :open="open"
            />
          </template>
        </HomeModelMenu>
      </div>
      <div ref="micSlotRef" class="ComposerToolbar-MicSlot">
        <ComposerMic
          :state="micState"
          :levels="micLevels"
          :elapsed-ms="micElapsedMs"
          :yielded="micYielded"
          :cover-width="micCoverWidth"
          :outcome="micOutcome"
          @toggle="emit('mic')"
          @cover="modelYielded = $event"
        />
      </div>
      <div class="ComposerToolbar-SendSlot">
        <ComposerSendIsland
          ref="islandRef"
          :state="sendState"
          :send-label="micState === 'idle' ? t('home.send') : t('home.composer.finishAndSend')"
          :stop-label="t('home.stop')"
          :stop-text="t('home.composer.stop')"
          @send="emit('send')"
          @stop="emit('stop')"
          @yield="micYielded = $event"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ComposerToolbar {
  // HomePermissionMenu's pill folds to an icon key through this container, not the viewport.
  container: home-composer-tools / inline-size;
  display: flex;
  align-items: center;
  justify-content: space-between;
  // The composer pads 16 / 16 / 12 inside a 1px border; pulling the row out 9px sideways and 5px
  // down puts the controls' outer edges 8px from the composer's: 16 + 8 = 24, its corner radius.
  margin: 0 -9px -5px;
}

.ComposerToolbar-Left,
.ComposerToolbar-Right {
  display: flex;
  gap: 8px;
  align-items: center;
}

// The offset parent both slots measure against (`measureCover`).
.ComposerToolbar-Right {
  position: relative;
}

// The picker is reached through `+`; the input itself never shows.
.ComposerToolbar-FileInput {
  display: none;
}

.ComposerToolbar-ModelSlot {
  flex: none;
  transform-origin: right center;

  // Under the dictation capsule: gone from sight and the pointer (`inert` takes it out of focus).
  &.is-yielded {
    opacity: 0;
    scale: 0.85;
    pointer-events: none;
  }
}

// Fixed 32×32 at every state: the capsules inside grow over neighbours, never into the row.
.ComposerToolbar-MicSlot,
.ComposerToolbar-SendSlot {
  position: relative;
  flex: none;
  width: 32px;
  height: 32px;
}

// Stacked so each capsule paints over the slot it covers.
.ComposerToolbar-MicSlot {
  z-index: 1;
}

.ComposerToolbar-SendSlot {
  z-index: 2;
}
</style>
