<script setup lang="ts">
import type { TouchTipButton, TouchTipProps } from './types'
import { onMounted, onUnmounted, ref, useId, watchEffect } from 'vue'
import { lockBodyScroll, unlockBodyScroll } from '../../../../utils/body-scroll-lock'
import { createFocusReturn, trapTab } from '../../../../utils/focus-trap'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import TxBaseSurface from '../../base-surface/src/TxBaseSurface.vue'
import { TxButton } from '../../button'
import { useDialogSurface } from './dialog-surface'

// Resolved in setup: inject is only valid here, while allocation happens later.
const zIndexAllocator = useZIndexAllocator()

defineOptions({
  name: 'TxTouchTip',
})

const props = withDefaults(defineProps<TouchTipProps>(), {
  title: '',
  message: '',
  messageHtml: '',
  buttons: () => [],
  surface: 'refraction',
  surfaceColor: '',
})

const { surfaceMode, surfaceColor, surfaceOpacity } = useDialogSurface(props)

interface ButtonState {
  content: string
  type?: 'info' | 'warning' | 'error' | 'success'
  onClick: () => Promise<boolean> | boolean
  loading?: boolean
}

const btnArray = ref<Array<{ value: ButtonState }>>([])
const wholeDom = ref<HTMLElement | null>(null)
// The two phases the parts fade in (see the styles): the entrance, until it has played, and the close.
const entering = ref(true)
const closing = ref(false)
// From the moment the close starts, 60ms before `closing`: the tip is inert from then on.
const leaving = ref(false)
const zIndex = ref(zIndexAllocator.get())
const titleId = useId()
const messageId = useId()
const focusReturn = createFocusReturn()

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function resolveButtonType(type?: ButtonState['type']): 'info' | 'warning' | 'danger' | 'success' {
  return type === 'error' ? 'danger' : type || 'info'
}

watchEffect(() => {
  const array: Array<{ value: ButtonState }> = []

  ;[...props.buttons].forEach((btn: TouchTipButton) => {
    const buttonState: ButtonState = {
      content: btn.content,
      type: btn.type,
      onClick: btn.onClick,
      loading: false,
    }

    const obj = {
      value: buttonState,
    }

    if (btn.loading) {
      obj.value.loading = true
      btn.loading(() => {
        obj.value.loading = false
      })
    }

    array.push(obj)
  })

  btnArray.value = array
})

async function clickBtn(btn: { value: ButtonState }): Promise<void> {
  btn.value.loading = true
  await sleep(120)

  if (await btn.value.onClick()) {
    await forClose()
  }

  btn.value.loading = false
}

/** aria-modal="true" promises the page behind is inert, so Tab stays inside. */
function keepTab(event: KeyboardEvent): void {
  if (wholeDom.value)
    trapTab(event, wholeDom.value)
}

/**
 * Gone for the keys and the pointer at once: focus goes back, the tip is inert while it leaves,
 * and a second Escape reaches what is under it.
 */
async function forClose(): Promise<void> {
  if (!wholeDom.value || leaving.value)
    return

  leaving.value = true
  focusReturn.restore()
  await sleep(60)

  // The panel grows a touch while its parts fade (see `--closing`).
  closing.value = true

  await sleep(220)

  props.close()
}

onMounted(() => {
  zIndex.value = zIndexAllocator.next()
  focusReturn.save()

  if (wholeDom.value) {
    wholeDom.value.setAttribute('tabindex', '-1')
    wholeDom.value.focus()
  }

  // The page holds still while the tip is open.
  lockBodyScroll()
})

onUnmounted(() => {
  unlockBodyScroll()
  focusReturn.restore()
})
</script>

<template>
  <teleport to="body">
    <!-- The panel never fades as a whole (see the styles), so the entrance's length is given here.
         `tx-touch-tip-moving` marks both phases, and the styles key the parts' fades on it. -->
    <Transition appear name="tx-touch-tip" :duration="250" @after-appear="entering = false">
      <div
        class="tx-touch-tip"
        :class="{ 'tx-touch-tip-moving': entering || closing, 'tx-touch-tip--closing': closing }"
        :style="{ zIndex }"
        :inert="leaving || undefined"
      >
        <div
          ref="wholeDom"
          class="tx-touch-tip__container"
          :class="{ 'tx-touch-tip__container--loading': false }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          :aria-describedby="message || messageHtml ? messageId : undefined"
          @keydown.esc.prevent="forClose"
          @keydown.tab="keepTab"
        >
          <TxBaseSurface
            class="tx-touch-tip__surface"
            preset="card"
            fake
            :mode="surfaceMode"
            :color="surfaceColor"
            :opacity="surfaceOpacity"
          />
          <h1 v-if="title" :id="titleId" class="tx-touch-tip__title" v-text="title" />

          <!-- eslint-disable vue/no-v-html -->
          <span
            v-if="messageHtml"
            :id="messageId"
            class="tx-touch-tip__content"
            v-html="messageHtml"
          />
          <!-- eslint-enable vue/no-v-html -->
          <span
            v-else-if="message"
            :id="messageId"
            class="tx-touch-tip__content"
          >
            {{ message }}
          </span>

          <div class="tx-touch-tip__btns">
            <TxButton
              v-for="(btn, index) in btnArray"
              :key="index"
              class="tx-touch-tip__btn"
              :type="resolveButtonType(btn.value?.type)"
              :loading="btn.value.loading"
              block
              native-type="button"
              @click="clickBtn(btn)"
            >
              {{ btn.value.content }}
            </TxButton>
          </div>
        </div>
      </div>
    </Transition>
  </teleport>
</template>

<style lang="scss" scoped>
@use '../../../style/mixins.scss' as *;

@keyframes tx-touch-tip-enter {
  0% {
    transform: translate(-50%, -50%) scale(1.1);
  }
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
}

.tx-touch-tip {
  position: fixed;
  inset: 0;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
  }

  &__container {
    position: absolute;
    left: 50%;
    top: 50%;
    // Stacked, so the surface sits under the content without leaving the panel.
    z-index: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 420px;
    min-height: 260px;
    width: min(420px, 88vw);
    color: var(--tx-text-color-primary, #303133);
    transform: translate(-50%, -50%);
    transition: transform 0.22s ease;
    @include tx-squircle(12px);

    // The shadow, on a layer of its own so it can fade while the panel does not.
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 1;
      border-radius: inherit;
      corner-shape: inherit;
      box-shadow: 9px 18px 65px rgba(0, 0, 0, 0.25);
      pointer-events: none;
    }
  }

  &__surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    corner-shape: inherit;
    pointer-events: none;
  }

  &__title {
    position: absolute;
    top: 16px;
    margin: 0;
    height: 32px;
    line-height: 32px;
    font-size: 18px;
    font-weight: var(--tx-font-weight-semibold, 600);
  }

  &__content {
    // A hash, an id or a URL has no break opportunity, so a vertical scroll
    // cannot save it: the token runs past the panel and the panel clips it.
    // `anywhere` also lets the token shrink the content's min-content width,
    // which `break-word` does not, so the panel stops being widened by it.
    overflow-wrap: anywhere;
    position: relative;
    width: 80%;
    height: calc(100% - 30px);
    // Fixed height plus a clipping panel meant a long body simply vanished
    // below the fold with nothing to reach it.
    overflow-y: auto;
    text-align: center;
    color: var(--tx-text-color-secondary, #909399);
    white-space: pre-line;
  }

  &__btns {
    position: absolute;
    display: flex;
    gap: 12px;
    justify-content: center;
    align-items: center;
    bottom: 16px;
    width: 80%;
    user-select: none;
  }

  &__btn {
    flex: 1;
  }
}

// Panel motion. The panel scales but never fades as a whole: an element whose opacity animates is
// the backdrop root of every backdrop filter inside it, so the material would sample nothing but
// the panel. Each part fades on its own instead, and the material stays live from the first frame
// to the last: the title, message and buttons, the shadow, and the surface. A surface with a
// backdrop filter fades layer by layer; one without fades whole, and so does every surface under
// high contrast, which drops the layers that blur. Each phase hands its fade down as
// `--tx-touch-tip-fade`, so the parts are listed once.
.tx-touch-tip-enter-active {
  --tx-touch-tip-fade: tx-touch-tip-fade-in 0.25s ease;

  .tx-touch-tip__container {
    animation: tx-touch-tip-enter 0.25s ease;
  }
}

// Closing: the panel grows a touch while its parts fade. After the entrance, so a panel closed
// while it still enters fades out.
.tx-touch-tip--closing {
  --tx-touch-tip-fade: tx-touch-tip-fade-out 0.22s ease forwards;

  @media (prefers-reduced-motion: no-preference) {
    .tx-touch-tip__container {
      transform: translate(-50%, -50%) scale(1.08);
    }
  }
}

.tx-touch-tip-moving {
  .tx-touch-tip__title,
  .tx-touch-tip__content,
  .tx-touch-tip__btns,
  .tx-touch-tip__container::after,
  .tx-touch-tip__surface:not(.tx-base-surface--with-glass, .tx-base-surface--with-filter),
  .tx-touch-tip__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter)::before,
  .tx-touch-tip__surface:is(.tx-base-surface--with-glass, .tx-base-surface--with-filter) :deep(.tx-base-surface__layer) {
    animation: var(--tx-touch-tip-fade);
  }

  @include tx-when-high-contrast {
    .tx-touch-tip__surface {
      animation: var(--tx-touch-tip-fade);
    }
  }
}

// Reduced motion keeps the fades and drops the scale: the panel fades in and out where it rests.
@media (prefers-reduced-motion: reduce) {
  .tx-touch-tip-enter-active .tx-touch-tip__container {
    animation: none;
  }
}
</style>

<style lang="scss">
// Unscoped: the parts take these through `--tx-touch-tip-fade`, and a scoped sheet renames its
// keyframes only where an `animation` declaration names them, never inside a custom property.
// Each gives only its far end, so a part fades from, or to, the opacity it rests at.
@keyframes tx-touch-tip-fade-in {
  from {
    opacity: 0;
  }
}

@keyframes tx-touch-tip-fade-out {
  to {
    opacity: 0;
  }
}
</style>
