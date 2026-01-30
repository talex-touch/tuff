<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, toRefs, watch } from 'vue'

interface FlickeringGridProps {
  squareSize?: number
  gridGap?: number
  flickerChance?: number
  color?: string
  width?: number
  height?: number
  maxOpacity?: number
}

const props = withDefaults(defineProps<FlickeringGridProps>(), {
  squareSize: 4,
  gridGap: 6,
  flickerChance: 0.3,
  color: '#000000',
  maxOpacity: 0.3,
})

const { squareSize, gridGap, flickerChance, color, maxOpacity, width, height } = toRefs(props)

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const context = ref<CanvasRenderingContext2D | null>(null)

const isInView = ref(false)
const canvasSize = ref({ width: 0, height: 0 })

const computedColor = computed(() => {
  const value = color.value?.trim()
  if (!value)
    return 'rgba(0, 0, 0,'

  if (value.startsWith('#')) {
    const hex = value.replace('#', '')
    const normalized = hex.length === 3
      ? hex.split('').map(char => `${char}${char}`).join('')
      : hex
    if (normalized.length === 6) {
      const bigint = Number.parseInt(normalized, 16)
      const r = (bigint >> 16) & 255
      const g = (bigint >> 8) & 255
      const b = bigint & 255
      return `rgba(${r}, ${g}, ${b},`
    }
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i)
  const channelText = rgbMatch?.[1]
  if (channelText) {
    const [r, g, b] = channelText.split(',').map(part => Number.parseFloat(part.trim()))
    if ([r, g, b].every(channel => Number.isFinite(channel)))
      return `rgba(${r}, ${g}, ${b},`
  }

  return 'rgba(0, 0, 0,'
})

function setupCanvas(
  canvas: HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
): {
  cols: number
  rows: number
  squares: Float32Array
  dpr: number
} {
  const dpr = window.devicePixelRatio || 1
  canvas.width = targetWidth * dpr
  canvas.height = targetHeight * dpr
  canvas.style.width = `${targetWidth}px`
  canvas.style.height = `${targetHeight}px`

  const cols = Math.floor(targetWidth / (squareSize.value + gridGap.value))
  const rows = Math.floor(targetHeight / (squareSize.value + gridGap.value))

  const squares = new Float32Array(cols * rows)
  for (let i = 0; i < squares.length; i++) {
    squares[i] = Math.random() * maxOpacity.value
  }
  return { cols, rows, squares, dpr }
}

function updateSquares(squares: Float32Array, deltaTime: number) {
  for (let i = 0; i < squares.length; i++) {
    if (Math.random() < flickerChance.value * deltaTime) {
      squares[i] = Math.random() * maxOpacity.value
    }
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  targetWidth: number,
  targetHeight: number,
  cols: number,
  rows: number,
  squares: Float32Array,
  dpr: number,
) {
  ctx.clearRect(0, 0, targetWidth, targetHeight)
  ctx.fillStyle = 'transparent'
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const opacity = squares[i * rows + j]
      ctx.fillStyle = `${computedColor.value}${opacity})`
      ctx.fillRect(
        i * (squareSize.value + gridGap.value) * dpr,
        j * (squareSize.value + gridGap.value) * dpr,
        squareSize.value * dpr,
        squareSize.value * dpr,
      )
    }
  }
}

const gridParams = ref<ReturnType<typeof setupCanvas> | null>(null)

function drawFrame() {
  if (!context.value || !canvasRef.value || !gridParams.value)
    return
  drawGrid(
    context.value,
    canvasRef.value.width,
    canvasRef.value.height,
    gridParams.value.cols,
    gridParams.value.rows,
    gridParams.value.squares,
    gridParams.value.dpr,
  )
}

function updateCanvasSize() {
  if (!containerRef.value || !canvasRef.value)
    return
  const newWidth = width.value || containerRef.value.clientWidth
  const newHeight = height.value || containerRef.value.clientHeight

  canvasSize.value = { width: newWidth, height: newHeight }
  gridParams.value = setupCanvas(canvasRef.value, newWidth, newHeight)
  drawFrame()
}

let animationFrameId: number | undefined
let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined
let lastTime = 0

function animate(time: number) {
  if (!isInView.value || !gridParams.value || !context.value || !canvasRef.value)
    return

  const deltaTime = (time - lastTime) / 1000
  lastTime = time

  updateSquares(gridParams.value.squares, deltaTime)
  drawGrid(
    context.value,
    canvasRef.value.width,
    canvasRef.value.height,
    gridParams.value.cols,
    gridParams.value.rows,
    gridParams.value.squares,
    gridParams.value.dpr,
  )
  animationFrameId = requestAnimationFrame(animate)
}

function startAnimation() {
  if (animationFrameId)
    return
  lastTime = performance.now()
  animationFrameId = requestAnimationFrame(animate)
}

function stopAnimation() {
  if (!animationFrameId)
    return
  cancelAnimationFrame(animationFrameId)
  animationFrameId = undefined
}

onMounted(() => {
  if (!canvasRef.value || !containerRef.value)
    return
  context.value = canvasRef.value.getContext('2d')
  if (!context.value)
    return

  updateCanvasSize()
  drawFrame()

  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize()
  })
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (!entry)
        return
      isInView.value = entry.isIntersecting
      if (isInView.value)
        startAnimation()
      else
        stopAnimation()
    },
    { threshold: 0 },
  )

  resizeObserver.observe(containerRef.value)
  intersectionObserver.observe(canvasRef.value)
})

watch([width, height], () => {
  updateCanvasSize()
})

onBeforeUnmount(() => {
  stopAnimation()
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
})
</script>

<template>
  <div
    ref="containerRef"
    class="FlickeringGrid h-full w-full"
  >
    <canvas
      ref="canvasRef"
      class="pointer-events-none"
      :width="canvasSize.width"
      :height="canvasSize.height"
    />
  </div>
</template>
