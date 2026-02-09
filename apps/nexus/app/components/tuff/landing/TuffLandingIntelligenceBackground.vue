<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

type IntelligenceMode = 'aurora' | 'neural' | 'focus'
type IntelligencePalette = 'apple' | 'ocean' | 'fire' | 'matrix'

const props = withDefaults(defineProps<{
  mode?: IntelligenceMode
  speed?: number
  particleCount?: number
  glowIntensity?: number
  palette?: IntelligencePalette
}>(), {
  mode: 'aurora',
  speed: 1,
  particleCount: 50,
  glowIntensity: 0.25,
  palette: 'apple',
})

interface PaletteColor { r: number; g: number; b: number }

const palettes: Record<IntelligencePalette, PaletteColor[]> = {
  apple: [
    { r: 64, g: 196, b: 255 },
    { r: 156, g: 81, b: 255 },
    { r: 255, g: 46, b: 169 },
    { r: 255, g: 153, b: 0 },
  ],
  ocean: [
    { r: 0, g: 255, b: 255 },
    { r: 0, g: 128, b: 255 },
    { r: 0, g: 64, b: 128 },
    { r: 200, g: 240, b: 255 },
  ],
  fire: [
    { r: 255, g: 80, b: 0 },
    { r: 255, g: 160, b: 0 },
    { r: 255, g: 0, b: 60 },
    { r: 255, g: 200, b: 100 },
  ],
  matrix: [
    { r: 0, g: 255, b: 100 },
    { r: 0, g: 180, b: 60 },
    { r: 0, g: 80, b: 20 },
    { r: 200, g: 255, b: 220 },
  ],
}

const canvasRef = ref<HTMLCanvasElement | null>(null)
const contextRef = ref<CanvasRenderingContext2D | null>(null)

let width = 0
let height = 0
let animationFrame = 0

const mouse = { x: -1000, y: -1000 }
const particles: Particle[] = []

class Particle {
  x = 0
  y = 0
  vx = 0
  vy = 0
  radius = 0
  currentRadius = 0
  phase = 0
  color: PaletteColor = { r: 255, g: 255, b: 255 }

  constructor() {
    this.reset()
    this.x = Math.random() * width
    this.y = Math.random() * height
  }

  reset() {
    this.x = Math.random() * width
    this.y = Math.random() * height
    this.vx = (Math.random() - 0.5) * 2
    this.vy = (Math.random() - 0.5) * 2

    if (props.mode === 'aurora')
      this.radius = Math.random() * 100 + 150
    else if (props.mode === 'neural')
      this.radius = Math.random() * 3 + 2
    else
      this.radius = Math.random() * 50 + 20

    this.phase = Math.random() * Math.PI * 2
    this.color = pickColor()
  }

  update() {
    this.x += this.vx * props.speed
    this.y += this.vy * props.speed

    if (this.x < -this.radius) this.x = width + this.radius
    if (this.x > width + this.radius) this.x = -this.radius
    if (this.y < -this.radius) this.y = height + this.radius
    if (this.y > height + this.radius) this.y = -this.radius

    const dx = mouse.x - this.x
    const dy = mouse.y - this.y
    const dist = Math.hypot(dx, dy)
    const interactRadius = 300

    if (dist < interactRadius) {
      const force = (interactRadius - dist) / interactRadius
      if (props.mode === 'neural') {
        this.x += dx * force * 0.02
        this.y += dy * force * 0.02
      }
      else {
        this.x -= dx * force * 0.05
        this.y -= dy * force * 0.05
      }
    }

    this.phase += 0.01 * props.speed
    this.currentRadius = this.radius + Math.sin(this.phase) * (this.radius * 0.2)
  }

  draw(context: CanvasRenderingContext2D) {
    const { r, g, b } = this.color

    if (props.mode === 'aurora') {
      const gradient = context.createRadialGradient(
        this.x,
        this.y,
        0,
        this.x,
        this.y,
        this.currentRadius,
      )
      const alpha = props.glowIntensity * 0.4

      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`)
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

      context.fillStyle = gradient
      context.beginPath()
      context.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2)
      context.fill()
      return
    }

    if (props.mode === 'neural') {
      context.fillStyle = `rgba(${r}, ${g}, ${b}, ${props.glowIntensity})`
      context.beginPath()
      context.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2)
      context.fill()
      return
    }

    const gradient = context.createRadialGradient(
      this.x,
      this.y,
      0,
      this.x,
      this.y,
      this.currentRadius,
    )
    const alpha = props.glowIntensity * 0.15

    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`)
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

    context.fillStyle = gradient
    context.beginPath()
    context.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2)
    context.fill()
  }
}

function pickColor() {
  const colors = palettes[props.palette] ?? palettes.apple
  const fallback = colors[0] ?? { r: 255, g: 255, b: 255 }
  return colors[Math.floor(Math.random() * colors.length)] ?? fallback
}

function initParticles() {
  particles.length = 0
  const count = Math.max(0, Math.floor(props.particleCount))
  for (let i = 0; i < count; i += 1)
    particles.push(new Particle())
}

function syncParticleCount() {
  const count = Math.max(0, Math.floor(props.particleCount))
  if (particles.length > count) {
    particles.splice(count)
    return
  }
  while (particles.length < count)
    particles.push(new Particle())
}

function applyPalette() {
  const colors = palettes[props.palette] ?? palettes.apple
  const fallback = colors[0] ?? { r: 255, g: 255, b: 255 }
  particles.forEach((particle) => {
    particle.color = colors[Math.floor(Math.random() * colors.length)] ?? fallback
  })
}

function resizeCanvas() {
  if (!canvasRef.value || !contextRef.value)
    return

  const canvas = canvasRef.value
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1

  width = Math.max(1, rect.width)
  height = Math.max(1, rect.height)

  const nextWidth = Math.floor(width * dpr)
  const nextHeight = Math.floor(height * dpr)

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    contextRef.value.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
}

function connectParticles(context: CanvasRenderingContext2D) {
  const maxDist = 150
  context.lineWidth = 1

  for (let i = 0; i < particles.length; i += 1) {
    const current = particles[i]
    if (!current)
      continue
    for (let j = i + 1; j < particles.length; j += 1) {
      const target = particles[j]
      if (!target)
        continue
      const dx = current.x - target.x
      const dy = current.y - target.y
      const dist = Math.hypot(dx, dy)

      if (dist < maxDist) {
        const alpha = (1 - dist / maxDist) * 0.5
        const { r, g, b } = current.color

        context.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        context.beginPath()
        context.moveTo(current.x, current.y)
        context.lineTo(target.x, target.y)
        context.stroke()
      }
    }
  }
}

function animate() {
  if (!contextRef.value)
    return

  const context = contextRef.value
  context.clearRect(0, 0, width, height)

  context.globalCompositeOperation = 'screen'
  particles.forEach((particle) => {
    particle.update()
    particle.draw(context)
  })

  if (props.mode === 'neural') {
    context.globalCompositeOperation = 'source-over'
    connectParticles(context)
  }

  animationFrame = requestAnimationFrame(animate)
}

function handleMouseMove(event: MouseEvent) {
  mouse.x = event.clientX
  mouse.y = event.clientY
}

function resetMouse() {
  mouse.x = -1000
  mouse.y = -1000
}

function handleResize() {
  resizeCanvas()
  initParticles()
}

onMounted(() => {
  if (!canvasRef.value)
    return

  const context = canvasRef.value.getContext('2d')
  if (!context)
    return

  contextRef.value = context
  resizeCanvas()
  initParticles()

  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener('mousemove', handleMouseMove, { passive: true })
  window.addEventListener('blur', resetMouse)
  window.addEventListener('mouseleave', resetMouse)

  animationFrame = requestAnimationFrame(animate)
})

watch(() => props.mode, () => {
  if (!contextRef.value)
    return
  initParticles()
})

watch(() => props.particleCount, () => {
  if (!contextRef.value)
    return
  syncParticleCount()
})

watch(() => props.palette, () => {
  if (!contextRef.value)
    return
  applyPalette()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('blur', resetMouse)
  window.removeEventListener('mouseleave', resetMouse)

  contextRef.value = null
  particles.length = 0
})
</script>

<template>
  <canvas
    ref="canvasRef"
    class="TuffLandingIntelligenceBackground"
    aria-hidden="true"
  />
</template>

<style scoped>
.TuffLandingIntelligenceBackground {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
