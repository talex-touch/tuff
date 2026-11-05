<script lang="ts" name="HomePet" setup>
import type { PetHost } from './usePetController'
import type { PetPose } from './pet-motion'
import { TxMiko } from '@talex-touch/tuffex/miko'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { PET_SIZE, PET_WIDTH } from './pet-physics'
import { stateFor } from './pet-motion'
import { PADDLE_HALF, PADDLE_H } from './pet-games'
import { usePetController } from './usePetController'

const props = defineProps<{ host: PetHost }>()

const { t } = useI18n()
const reducedQuery = hasWindow() ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const reduced = () => reducedQuery?.matches === true

const petEl = ref<HTMLElement | null>(null)
const shadowEl = ref<HTMLElement | null>(null)
const pet = usePetController(props.host, (key, named) => t(key, named ?? {}), reduced)

const STATUS_KEY: Record<PetPose, string> = {
  idle: 'idle',
  sit: 'idle',
  walk: 'walk',
  climb: 'climb',
  sleep: 'sleep',
  stretch: 'stretch',
  fall: 'fall',
  hang: 'hang',
  flat: 'idle',
  dizzy: 'dizzy',
  wince: 'wince',
  purr: 'purr',
  celebrate: 'celebrate',
  eat: 'eat',
  sleepy: 'sleepy',
  coffee: 'coffee',
  fly: 'fly',
  zerog: 'zerog',
  juggle: 'juggle',
  ball: 'breakout',
  swim: 'swim',
  thinking: 'thinking',
  writing: 'writing',
  curious: 'curious',
  bathe: 'idle',
  shake: 'idle',
  box: 'box'
}

const statusKey = computed(() => {
  if (pet.game.value === 'breakout') return 'breakout'
  if (pet.game.value === 'juggling') return 'juggle'
  if (pet.game.value === 'flight') return 'fly'
  if (pet.game.value === 'zerog') return 'zerog'
  return STATUS_KEY[pet.pose.value]
})
const status = computed(() => t(`home.pet.status.${statusKey.value}`))

const traits = computed(() => {
  const list: string[] = []
  const { tints } = pet
  if (tints.sunny) list.push(t('home.pet.trait.sunny'))
  if (tints.pale > 0.01) list.push(t('home.pet.trait.pale'))
  if (tints.poisoned) list.push(t('home.pet.trait.poisoned'))
  if (tints.hungry) list.push(t('home.pet.trait.hungry'))
  if (tints.rainbow) list.push(t('home.pet.trait.rainbow'))
  if (tints.mood) list.push(t('home.pet.trait.mood'))
  if (tints.holiday) list.push(t('home.pet.trait.holiday'))
  if (tints.swimming) list.push(t('home.pet.trait.swimming'))
  if (tints.paperHat) list.push(t('home.pet.trait.anniversary'))
  list.push(t('home.pet.diary', { tan: pet.tanPercent.value, fish: pet.fishCount.value }))
  return list
})

const ariaLabel = computed(() =>
  t('home.pet.aria', { name: t('home.pet.name'), status: status.value })
)
const tooltip = computed(() => [status.value, ...traits.value].join(' · '))

const gameLine = computed(() => {
  if (pet.game.value === 'breakout')
    return t('home.pet.game.breakout', {
      score: pet.score.value,
      lives: pet.lives.value,
      best: pet.best.value
    })
  if (pet.game.value === 'juggling') return t('home.pet.game.juggle', { score: pet.score.value })
  return t('home.pet.game.hint')
})

const paddleStyle = computed(() => ({
  left: `${pet.paddleX.value - PADDLE_HALF}px`,
  width: `${PADDLE_HALF * 2}px`,
  height: `${PADDLE_H}px`,
  top: `${pet.paddleTop.value}px`
}))

function onKeyDown(event: KeyboardEvent): void {
  if ((event.key === 'Enter' || event.key === ' ') && event.repeat) event.preventDefault()
}

function onClick(): void {
  pet.onClick()
}

function onPointerDown(event: PointerEvent): void {
  pet.onPointerDown(event)
}

onActivated(() => pet.resume())
onDeactivated(() => pet.suspend())

onMounted(() => {
  pet.bindPet(petEl.value)
  pet.bindShadow(shadowEl.value)
  pet.mount()
})

defineExpose({ notifySend: (text: string) => pet.notifySend(text) })
</script>

<template>
  <div
    class="HomePet"
    :class="{
      'is-dragging': pet.dragging.value,
      'is-rainbow': pet.tints.rainbow && !pet.tints.poisoned,
      'is-pale': pet.tints.pale > 0.01,
      'is-swim': pet.tints.swimming,
      'is-wings': pet.tints.wings,
      'is-purr': pet.tints.purr,
      'is-sparkle': pet.tints.sparkle,
      'is-fading': pet.tints.fading
    }"
  >
    <div ref="shadowEl" class="HomePet-Shadow" aria-hidden="true" />
    <i
      v-for="print in pet.prints.value"
      :key="print.id"
      class="HomePet-Print"
      :class="{ 'is-trail': print.c }"
      :style="{ left: `${print.x}px`, top: `${print.y}px`, background: print.c }"
      aria-hidden="true"
    />

    <div v-if="pet.game.value === 'breakout'" class="HomePet-Bricks" aria-hidden="true">
      <i
        v-for="(brick, index) in pet.bricks.value"
        v-show="brick.alive"
        :key="index"
        class="HomePet-Brick"
        :style="{
          left: `${brick.left}px`,
          top: `${brick.top}px`,
          width: `${brick.right - brick.left}px`,
          height: `${brick.bottom - brick.top}px`
        }"
      />
      <i class="HomePet-Paddle" :style="paddleStyle" />
    </div>

    <div v-if="pet.bubble.value" class="HomePet-Bubble" role="status">
      {{ pet.bubble.value }}
    </div>

    <button
      ref="petEl"
      type="button"
      class="HomePet-Button"
      :class="{ 'is-flat': pet.tints.flat, 'is-shake': pet.tints.shake }"
      :style="{ width: `${PET_WIDTH}px`, height: `${PET_SIZE}px` }"
      :aria-label="ariaLabel"
      :title="tooltip"
      @click="onClick"
      @pointerdown="onPointerDown"
      @keydown="onKeyDown"
    >
      <span class="HomePet-Pose">
        <span class="HomePet-Body">
          <TxMiko
            :size="PET_SIZE"
            :state="stateFor(pet.pose.value)"
            :color="pet.color.value"
            :interactive="false"
            :random="false"
            aria-hidden="true"
          />
        </span>
        <span v-if="pet.tints.paperHat" class="HomePet-Hat is-paper" aria-hidden="true" />
        <span v-if="pet.fishCount.value >= 10" class="HomePet-Hat is-cap" aria-hidden="true" />
        <span v-if="pet.fishCount.value >= 50" class="HomePet-Hat is-crown" aria-hidden="true" />
        <span v-if="pet.tints.puff" class="HomePet-Puff" aria-hidden="true" />
      </span>
      <span
        v-if="pet.heart.value"
        :key="pet.heart.value"
        class="HomePet-Heart"
        aria-hidden="true"
      />
      <span v-if="pet.tints.poisoned" class="HomePet-Bubbles" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span v-if="pet.tints.sunny" class="HomePet-Badge is-sun" aria-hidden="true" />
      <span v-if="pet.tints.hungry" class="HomePet-Badge is-hungry" aria-hidden="true" />
      <span v-if="pet.tints.swimming" class="HomePet-Ripple" aria-hidden="true" />
      <span v-if="pet.game.value === 'juggling'" class="HomePet-Balls" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>

    <div v-if="pet.game.value" class="HomePet-Status" role="status">
      {{ gameLine }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomePet {
  position: absolute;
  inset: 0;
  z-index: 9;
  pointer-events: none;
}

.HomePet-Button {
  position: absolute;
  left: 0;
  top: 0;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  cursor: grab;
  transform-origin: 50% 100%;
  will-change: transform;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 3px;
    border-radius: 12px;
  }
}

.HomePet.is-dragging .HomePet-Button {
  cursor: grabbing;
}

.HomePet-Body {
  display: block;
  width: 100%;
  height: 100%;
}

.HomePet-Body svg {
  width: 100%;
  height: 100%;
}

.HomePet.is-pale .HomePet-Body {
  filter: drop-shadow(0 0 0.6px rgba(15, 23, 42, 0.75));
}

.HomePet.is-rainbow .HomePet-Body {
  animation: HomePet-Rainbow 1.2s linear infinite;
}

.HomePet.is-swim .HomePet-Ripple {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  border-radius: 3px;
  background: rgba(56, 189, 248, 0.55);
  animation: HomePet-Ripple 1.4s ease-in-out infinite;
}

.HomePet-Button .HomePet-Body {
  transform: scaleY(1);
}

.HomePet-Button.is-flat .HomePet-Body {
  transform: scaleY(0.6);
  transform-origin: 50% 100%;
}

.HomePet-Button.is-shake .HomePet-Body {
  animation: HomePet-Shake 0.12s steps(2) 6;
}

.HomePet.is-purr .HomePet-Body {
  animation: HomePet-Purr 0.5s ease-in-out infinite;
}

.HomePet.is-wings .HomePet-Body::before,
.HomePet.is-wings .HomePet-Body::after {
  content: '';
  position: absolute;
  top: 10%;
  width: 34%;
  height: 46%;
  background: #f8fafc;
  border-radius: 60% 10% 60% 10%;
  opacity: 0.9;
  animation: HomePet-Flap 0.4s ease-in-out infinite;
}

.HomePet.is-wings .HomePet-Body::before {
  left: -22%;
}

.HomePet.is-wings .HomePet-Body::after {
  right: -22%;
  transform: scaleX(-1);
}

.HomePet.is-sparkle .HomePet-Body {
  filter: drop-shadow(0 0 6px rgba(250, 204, 21, 0.9));
}

.HomePet-Print {
  position: absolute;
  width: 6px;
  height: 4px;
  border-radius: 50%;
  background: rgba(129, 13, 198, 0.55);
  pointer-events: none;
  animation: HomePet-Fade 1.5s ease-out forwards;
}

.HomePet-Print.is-trail {
  width: 5px;
  height: 5px;
  animation-duration: 0.6s;
  box-shadow: 0 0 6px currentColor;
}

.HomePet-Hat {
  position: absolute;
  left: 50%;
  top: -8px;
  transform: translateX(-50%);
  pointer-events: none;
}

.HomePet-Hat.is-cap {
  width: 30px;
  height: 8px;
  border-radius: 4px 4px 2px 2px;
  background: #1e293b;
}

.HomePet-Hat.is-crown {
  width: 26px;
  height: 12px;
  background: linear-gradient(90deg, #facc15 0 33%, transparent 33% 66%, #facc15 66%);
  clip-path: polygon(0 100%, 0 0, 25% 60%, 50% 0, 75% 60%, 100% 0, 100% 100%);
}

.HomePet-Hat.is-paper {
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-bottom: 16px solid #f8fafc;
  top: -14px;
}

.HomePet-Puff {
  position: absolute;
  left: 50%;
  top: 22%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(226, 232, 240, 0.85);
  pointer-events: none;
  animation: HomePet-Puff 0.9s ease-out forwards;
}

.HomePet-Pose {
  position: absolute;
  inset: 0;
  transform: var(--pet-pose, none);
  transform-origin: 50% 100%;
  pointer-events: none;
}

.HomePet-Heart {
  position: absolute;
  left: 50%;
  top: 0;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  background: #ec4899;
  transform: rotate(-45deg);
  pointer-events: none;
  animation: HomePet-Heart 0.9s ease-out forwards;
}

.HomePet-Heart::before,
.HomePet-Heart::after {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: inherit;
}

.HomePet-Heart::before {
  left: -4px;
  top: 0;
}

.HomePet-Heart::after {
  left: 0;
  top: -4px;
}

.HomePet-Shadow {
  position: absolute;
  left: 0;
  top: 0;
  width: 44px;
  height: 8px;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.45);
  transform-origin: 50% 50%;
  pointer-events: none;
}

.HomePet-Bubble {
  position: absolute;
  transform: translate(-50%, -100%);
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--shell-surface-2, #ffffff);
  color: var(--shell-text-primary, #303133);
  font-size: 12px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  pointer-events: none;
}

.HomePet-Bubbles i {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  border: 1px solid #16a34a;
  background: rgba(134, 239, 172, 0.7);
  animation: HomePet-Bubble 1.6s ease-in infinite;
}

.HomePet-Bubbles i:nth-child(2) {
  animation-delay: 0.5s;
}

.HomePet-Bubbles i:nth-child(3) {
  animation-delay: 1s;
}

.HomePet-Badge {
  position: absolute;
  right: -6px;
  top: -6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.HomePet-Badge.is-sun {
  background: #facc15;
  box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.35);
}

.HomePet-Badge.is-hungry {
  background: transparent;
  border: 2px dotted #f97316;
}

.HomePet-Balls i {
  position: absolute;
  top: -18px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #f59e0b;
  animation: HomePet-Orbit 1.1s linear infinite;
}

.HomePet-Balls i:nth-child(2) {
  animation-delay: -0.37s;
  background: #3b82f6;
}

.HomePet-Balls i:nth-child(3) {
  animation-delay: -0.73s;
  background: #10b981;
}

.HomePet-Bricks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.HomePet-Brick {
  position: absolute;
  border-radius: 4px;
  background: linear-gradient(135deg, #a855f7, #6366f1);
  opacity: 0.75;
}

.HomePet-Paddle {
  position: absolute;
  border-radius: 6px;
  background: var(--shell-text-muted, #909399);
  pointer-events: none;
}

.HomePet-Status {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--shell-surface-2, #ffffff);
  color: var(--shell-text-regular, #606266);
  font-size: 12px;
  pointer-events: none;
}

.HomePet.is-fading .HomePet-Button {
  opacity: 0;
  transition: opacity 0.3s ease;
}

@keyframes HomePet-Heart {
  0% {
    opacity: 0;
    transform: translateY(6px) rotate(-45deg) scale(0.6);
  }
  25% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(-22px) rotate(-45deg) scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .HomePet-Heart {
    animation: none;
    opacity: 0;
  }
}

@keyframes HomePet-Fade {
  from {
    opacity: 0.8;
  }
  to {
    opacity: 0;
  }
}

@keyframes HomePet-Puff {
  from {
    opacity: 0.9;
    transform: translate(-50%, 0) scale(0.4);
  }
  to {
    opacity: 0;
    transform: translate(-50%, -18px) scale(1.6);
  }
}

@keyframes HomePet-Rainbow {
  to {
    filter: hue-rotate(360deg);
  }
}

@keyframes HomePet-Shake {
  50% {
    transform: translateX(2px);
  }
}

@keyframes HomePet-Purr {
  50% {
    transform: scale(1.03);
  }
}

@keyframes HomePet-Flap {
  50% {
    transform: scaleY(0.5);
  }
}

@keyframes HomePet-Ripple {
  50% {
    opacity: 0.3;
  }
}

@keyframes HomePet-Bubble {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateY(-22px);
    opacity: 0;
  }
}

@keyframes HomePet-Orbit {
  to {
    transform: rotate(360deg) translateX(30px) rotate(-360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .HomePet.is-rainbow .HomePet-Body,
  .HomePet.is-purr .HomePet-Body,
  .HomePet.is-wings .HomePet-Body::before,
  .HomePet.is-wings .HomePet-Body::after,
  .HomePet-Button.is-shake .HomePet-Body,
  .HomePet-Balls i,
  .HomePet-Bubbles i,
  .HomePet-Ripple {
    animation: none;
  }
}
</style>
