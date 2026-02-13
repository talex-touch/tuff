<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useMouseInElement } from '@vueuse/core'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)
const { elementX, elementY, elementWidth, elementHeight } = useMouseInElement(containerRef)

interface Star {
  x: number
  y: number
  z: number
  size: number
  opacity: number
  speed: number
  color: string
}

interface ShootingStar {
  x: number
  y: number
  len: number
  speed: number
  size: number
  waitTime: number
  active: boolean
  angle: number
}

const stars: Star[] = []
const shootingStars: ShootingStar[] = []
const STAR_COUNT = 800
const BASE_SPEED = 0.2
let animationFrameId: number

// 颜色池：青色、紫色、白色
const colors = ['#ffffff', '#ffffff', '#ffffff', '#ffffff', '#A5F3FC', '#E879F9', '#DDD6FE']

const resetStar = (index: number, width: number, height: number, initial = false) => {
  const maxDist = Math.max(width, height)
  const z = initial ? Math.random() * maxDist : maxDist

  stars[index] = {
    x: (Math.random() - 0.5) * width * 3,
    y: (Math.random() - 0.5) * height * 3,
    z: z,
    size: Math.random() * 1.5 + 0.5,
    opacity: Math.random() * 0.8 + 0.2,
    speed: Math.random() * 0.5 + 0.5,
    color: colors[Math.floor(Math.random() * colors.length)]
  }
}

const initShootingStar = (w: number, h: number): ShootingStar => {
  return {
    x: Math.random() * w * 0.8 + w * 0.1,
    y: -50,
    len: Math.random() * 150 + 50,
    speed: Math.random() * 15 + 10,
    size: Math.random() * 1.5 + 0.5,
    waitTime: new Date().getTime() + Math.random() * 4000 + 1000,
    active: false,
    angle: Math.PI / 4 + (Math.random() * 0.3 - 0.15) // 约45度下落
  }
}

const initStars = (width: number, height: number) => {
  stars.length = 0
  for (let i = 0; i < STAR_COUNT; i++) {
    resetStar(i, width, height, true)
  }

  shootingStars.length = 0
  for(let i = 0; i < 3; i++) { // 同时最多3颗流星
     shootingStars.push(initShootingStar(width, height))
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  let w = 0
  let h = 0
  let cx = 0
  let cy = 0

  const resize = () => {
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = w
    canvas.height = h
    cx = w / 2
    cy = h / 2
    initStars(w, h)
  }

  window.addEventListener('resize', resize)
  resize()

  const draw = () => {
    ctx.clearRect(0, 0, w, h)

    // Mouse parallax
    const targetX = (elementX.value - elementWidth.value / 2) * 0.02
    const targetY = (elementY.value - elementHeight.value / 2) * 0.02

    const maxZ = Math.max(w, h)
    const fov = maxZ * 0.8

    // Draw Static Stars
    stars.forEach((star, i) => {
      star.z -= BASE_SPEED * star.speed
      if (star.z <= 1) {
        resetStar(i, w, h)
        star.z = maxZ
      }

      const scale = fov / star.z
      const x2d = star.x * scale + cx + targetX * scale * 0.2
      const y2d = star.y * scale + cy + targetY * scale * 0.2

      if (x2d >= -10 && x2d <= w + 10 && y2d >= -10 && y2d <= h + 10) {
        const alpha = Math.min(1, (1 - star.z / maxZ) * star.opacity * 1.5)

        ctx.fillStyle = star.color
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.arc(x2d, y2d, star.size * scale, 0, Math.PI * 2)
        ctx.fill()

        // Twinkle effect: occasional glow
        if (Math.random() > 0.998) {
            ctx.shadowBlur = 12 * scale
            ctx.shadowColor = star.color
            ctx.fill()
            ctx.shadowBlur = 0
        }
      }
    })
    ctx.globalAlpha = 1

    // Draw Shooting Stars
    const now = new Date().getTime()
    shootingStars.forEach((star, i) => {
      if (star.active) {
        star.x += star.speed * Math.cos(star.angle)
        star.y += star.speed * Math.sin(star.angle)

        // Trail gradient
        const endX = star.x - star.len * Math.cos(star.angle)
        const endY = star.y - star.len * Math.sin(star.angle)

        const grad = ctx.createLinearGradient(star.x, star.y, endX, endY)
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
        grad.addColorStop(0.1, 'rgba(165, 243, 252, 0.8)') // Cyan tint
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)')

        ctx.strokeStyle = grad
        ctx.lineWidth = star.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(star.x, star.y)
        ctx.lineTo(endX, endY)
        ctx.stroke()

        // Glow head
        ctx.shadowBlur = 10
        ctx.shadowColor = '#fff'
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size + 1, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0

        // Reset if out of bounds
        if (star.x > w + 200 || star.y > h + 200) {
          star.active = false
          star.waitTime = now + Math.random() * 2000 + 500
        }
      } else {
        if (now >= star.waitTime) {
          shootingStars[i] = initShootingStar(w, h)
          shootingStars[i].active = true
        }
      }
    })

    animationFrameId = requestAnimationFrame(draw)
  }

  draw()
})

onUnmounted(() => {
  cancelAnimationFrame(animationFrameId)
  window.removeEventListener('resize', () => {})
})
</script>

<template>
  <div ref="containerRef" class="absolute inset-0 overflow-hidden pointer-events-none z-0">
    <canvas ref="canvasRef" class="w-full h-full block opacity-80 mix-blend-screen" />
  </div>
</template>
