<script setup name="SettingHeader" lang="ts">
import { TxTag } from '@talex-touch/tuffex'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEnv } from '~/modules/hooks/env-hooks'

const { t } = useI18n()
const { packageJson, processInfo } = useEnv()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let rafId: number | null = null
let resizeHandler: (() => void) | null = null

const appVersion = computed(() => packageJson.value?.version || '')
const versionLabel = computed(() => (appVersion.value ? `v${appVersion.value}` : ''))

const runtimeVersions = computed(() => {
  const info = processInfo.value as { versions?: { chrome?: string; node?: string } } | undefined
  return info?.versions
})
const chromeVersion = computed(() => runtimeVersions.value?.chrome || '')
const nodeVersion = computed(() => runtimeVersions.value?.node || '')
const vueVersion = computed(() => packageJson.value?.devDependencies?.vue || '')
const footerTagStyle = {
  color: 'rgba(226, 232, 240, 0.7)',
  background: 'rgba(15, 23, 42, 0.4)',
  border: 'rgba(148, 163, 184, 0.15)',
  size: 'md' as const
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let width = 0
  let height = 0
  let dpr = window.devicePixelRatio || 1

  const particles = Array.from({ length: 24 }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: Math.random() * 1.2 + 0.4,
    speed: Math.random() * 0.12 + 0.05
  }))

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    width = rect.width
    height = rect.height
    dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()
  resizeHandler = resize
  window.addEventListener('resize', resize)

  const draw = (time: number) => {
    if (!width || !height) {
      rafId = window.requestAnimationFrame(draw)
      return
    }

    const t = time / 1000
    ctx.clearRect(0, 0, width, height)

    const base = ctx.createLinearGradient(0, 0, width, height)
    base.addColorStop(0, 'rgba(15, 23, 42, 0.85)')
    base.addColorStop(0.6, 'rgba(15, 23, 42, 0.55)')
    base.addColorStop(1, 'rgba(15, 23, 42, 0.35)')
    ctx.fillStyle = base
    ctx.fillRect(0, 0, width, height)

    ctx.globalCompositeOperation = 'lighter'
    const orb1x = width * 0.22 + Math.cos(t * 0.4) * 60
    const orb1y = height * 0.35 + Math.sin(t * 0.6) * 40
    const orb1 = ctx.createRadialGradient(orb1x, orb1y, 0, orb1x, orb1y, width * 0.6)
    orb1.addColorStop(0, 'rgba(59, 130, 246, 0.35)')
    orb1.addColorStop(1, 'rgba(59, 130, 246, 0)')
    ctx.fillStyle = orb1
    ctx.fillRect(0, 0, width, height)

    const orb2x = width * 0.75 + Math.cos(t * 0.3 + 2) * 80
    const orb2y = height * 0.55 + Math.sin(t * 0.5 + 1) * 50
    const orb2 = ctx.createRadialGradient(orb2x, orb2y, 0, orb2x, orb2y, width * 0.5)
    orb2.addColorStop(0, 'rgba(14, 165, 233, 0.25)')
    orb2.addColorStop(1, 'rgba(14, 165, 233, 0)')
    ctx.fillStyle = orb2
    ctx.fillRect(0, 0, width, height)

    ctx.globalCompositeOperation = 'source-over'
    ctx.lineWidth = 1
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath()
      const baseY = height * 0.3 + i * 18
      for (let x = 0; x <= width; x += 12) {
        const sway = Math.sin((x / width) * Math.PI * 2 + t * 1.4 + i) * 8
        const y = baseY + sway
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)'
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)'
    particles.forEach((particle) => {
      particle.x -= particle.speed / 300
      if (particle.x < -0.05) particle.x = 1.05
      const x = particle.x * width
      const y = (particle.y + Math.sin(t + particle.x * 6) * 0.01) * height
      ctx.beginPath()
      ctx.arc(x, y, particle.radius, 0, Math.PI * 2)
      ctx.fill()
    })

    rafId = window.requestAnimationFrame(draw)
  }

  rafId = window.requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId)
    rafId = null
  }
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
})
</script>

<template>
  <div
    class="AboutApplication activate"
    :style="{ '--inactive-text': `'${t('settingHeader.inactive')}'` }"
  >
    <canvas ref="canvasRef" class="Header-Canvas" aria-hidden="true" />
    <div class="Header-Content">
      <div class="Header-Intro">
        <div v-if="versionLabel" class="Header-Badge">
          <span class="Header-Status" aria-hidden="true" />
          <span class="Header-BadgeLabel">{{ t('settingHeader.version') }}</span>
          <span class="Header-BadgeValue">{{ versionLabel }}</span>
        </div>

        <div class="Home-Text">
          <h1 class="Header-Title">TUFF</h1>
          <p>{{ t('settingHeader.subTitle') }}</p>
        </div>
      </div>

      <ul v-if="processInfo" class="About-Footer">
        <li>
          <TxTag
            v-bind="footerTagStyle"
            icon="i-carbon-chip"
            :label="`Chromium: ${chromeVersion}`"
          />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-code" :label="`Node.js: ${nodeVersion}`" />
        </li>
        <li>
          <TxTag v-bind="footerTagStyle" icon="i-carbon-logo-vue" :label="`Vue: ${vueVersion}`" />
        </li>
      </ul>
    </div>

    <div class="About-Image">
      <div class="Home-Logo-Bg" />
      <img src="~/assets/logo.svg" alt="logo" />
    </div>
  </div>
</template>

<style lang="scss">
.AboutApplication {
  .Header-Canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .Header-Content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 18px;
    width: min(65%, 640px);
  }

  .Header-Intro {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .Header-Badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(148, 163, 184, 0.2);
    backdrop-filter: blur(12px);
  }

  .Header-Status {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
    animation: status-pulse 2s ease-in-out infinite;
  }

  .Header-BadgeLabel {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.7);
  }

  .Header-BadgeValue {
    font-size: 12px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .Home-Text {
    display: flex;
    flex-direction: column;
    gap: 8px;

    p {
      margin: 0;
      color: rgba(226, 232, 240, 0.68);
      font-size: 14px;
      line-height: 1.6;
    }
  }

  .Header-Title {
    margin: 0;
    font-size: clamp(32px, 4vw, 56px);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5f5 40%, #94a3b8 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .About-Footer {
    display: flex;
    gap: 10px;
    padding: 0;
    margin: 0;

    li {
      list-style: none;
    }
  }

  .About-Image {
    position: absolute;
    right: 5%;
    top: 12%;
    height: 76%;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1;

    &:before,
    &:after {
      content: '';
      position: absolute;

      left: 50%;
      top: 50%;

      width: 100%;
      height: 100%;

      border-radius: 50%;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(226, 232, 240, 0.35);

      animation: header-breathing 2.4s ease-in-out infinite;
    }

    &:after {
      width: 125%;
      height: 125%;

      animation-delay: 1.2s;
    }

    .Home-Logo-Bg {
      position: absolute;
      inset: 12%;
      border-radius: 50%;
      background:
        radial-gradient(circle at 30% 30%, rgba(59, 130, 246, 0.4), transparent 60%),
        radial-gradient(circle at 70% 70%, rgba(14, 165, 233, 0.25), transparent 55%);
      filter: blur(6px);
      opacity: 0.8;
    }

    img {
      position: relative;
      height: 100%;
      filter: drop-shadow(0 12px 24px rgba(15, 23, 42, 0.65));
    }
  }

  &.activate {
    &:before {
      opacity: 0;
    }

    opacity: 0.98;
  }

  &:before {
    content: var(--inactive-text);
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: 0.6;
    font-size: 20px;
    font-weight: 600;
    border-radius: 12px;
    background-color: var(--el-fill-color-darker);
    z-index: 3;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.35), transparent 45%),
      radial-gradient(circle at 85% 60%, rgba(14, 165, 233, 0.25), transparent 50%);
    opacity: 0.9;
    pointer-events: none;
    z-index: 0;
  }

  & {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 15px;
    width: 100%;
    min-height: 220px;
    padding: 24px 32px;
    border-radius: 18px;
    color: var(--el-text-color-primary);
    background: linear-gradient(135deg, #0f172a 0%, #101827 45%, #0b1020 100%);
    background-size: 200% 200%;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    animation: header-flow 12s ease infinite;
  }

  :root:not(.dark) & {
    filter: brightness(1.08) saturate(1.04);
  }
}

@keyframes status-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(1.4);
  }
}

@keyframes header-breathing {
  0% {
    opacity: 0.2;
    transform: translate(-50%, -50%) scale(0.8);
  }

  50% {
    opacity: 0.9;
    transform: translate(-50%, -50%) scale(1);
  }

  100% {
    opacity: 0.2;
    transform: translate(-50%, -50%) scale(1.2);
  }
}

@keyframes header-flow {
  0% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }

  100% {
    background-position: 0% 50%;
  }
}

@media (max-width: 900px) {
  .AboutApplication {
    padding: 20px 24px;
  }

  .AboutApplication .Header-Content {
    width: 100%;
  }

  .AboutApplication .About-Image {
    right: -5%;
    opacity: 0.35;
  }

  .AboutApplication .About-Footer {
    flex-wrap: wrap;
  }
}
</style>
