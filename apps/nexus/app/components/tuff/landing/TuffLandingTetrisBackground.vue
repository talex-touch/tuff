<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { getColors } from 'theme-colors'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

interface Props {
  squareColor: string
  base?: number
  maskColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  base: 10,
  maskColor: 'rgba(0, 193, 106, 0.85)',
})

const theme = computed(() => getColors(props.squareColor))

const el = ref<HTMLElement | null>(null)
const grid = ref<(boolean | null)[][]>([])
const rows = ref(0)
const cols = ref(0)

const { width, height } = useElementSize(el)

const safeCols = computed(() => Math.max(cols.value, 1))
const cellSize = computed(() => (safeCols.value ? width.value / safeCols.value : 0))
const gridRows = computed(() => Math.max(rows.value - 1, 1))
const maskImage = computed(() => `radial-gradient(450px circle at center, ${props.maskColor}, transparent)`)

function createGrid() {
  grid.value = []

  for (let i = 0; i < rows.value; i++) {
    grid.value.push(new Array(cols.value).fill(null))
  }
}

function createNewCell() {
  const x = Math.floor(Math.random() * cols.value)
  if (grid.value[0])
    grid.value[0][x] = true
}

function moveCellsDown() {
  for (let row = rows.value - 1; row >= 0; row--) {
    for (let col = 0; col < cols.value; col++) {
      const cell = grid.value[row]?.[col]
      const nextCell = Array.isArray(grid.value[row + 1]) ? grid.value[row + 1][col] : cell
      if (cell !== null && nextCell === null) {
        grid.value[row + 1][col] = grid.value[row][col]
        grid.value[row][col] = null
      }
    }
  }

  setTimeout(() => {
    const lastRow = grid.value[rows.value - 1]
    const isFilled = Array.isArray(lastRow) && lastRow.every(cell => cell !== null)
    if (Array.isArray(grid.value[rows.value]) && isFilled) {
      for (let col = 0; col < cols.value; col++) {
        grid.value[rows.value][col] = null
      }
    }
  }, 500)
}

function clearColumn() {
  const lastRow = grid.value[rows.value - 1]
  const isFilled = Array.isArray(lastRow) && lastRow.every(cell => cell === true)
  if (!isFilled)
    return

  for (let col = 0; col < cols.value; col++) {
    grid.value[rows.value - 1][col] = null
  }
}

function removeCell(row: number, col: number) {
  if (grid.value[row])
    grid.value[row][col] = null
}

function calcGrid() {
  const cell = width.value / props.base
  if (!cell || Number.isNaN(cell))
    return

  rows.value = Math.floor(height.value / cell)
  cols.value = Math.floor(width.value / cell)

  createGrid()
}

watch(width, calcGrid)

let intervalId: NodeJS.Timeout | undefined
let timeoutId: NodeJS.Timeout | undefined

onMounted(() => {
  timeoutId = setTimeout(calcGrid, 50)

  intervalId = setInterval(() => {
    clearColumn()
    moveCellsDown()
    createNewCell()
  }, 1000)
})

onUnmounted(() => {
  if (intervalId)
    clearInterval(intervalId)
  if (timeoutId)
    clearTimeout(timeoutId)
})
</script>

<template>
  <Transition appear name="fade">
    <div
      class="tuff-tetris-bg"
      :style="{
        '--cell-size': `${cellSize}px`,
        '--grid-rows': gridRows,
      }"
      aria-hidden="true"
    >
      <ClientOnly>
        <div
          ref="el"
          class="tuff-tetris-bg__grid"
          :style="{
            gridTemplateRows: `repeat(var(--grid-rows), var(--cell-size))`,
            maskImage,
            WebkitMaskImage: maskImage,
          }"
        >
          <div
            v-for="(row, rowIndex) in grid"
            :key="rowIndex"
            class="tuff-tetris-bg__row"
            :style="{ gridTemplateColumns: `repeat(${safeCols}, var(--cell-size))` }"
          >
            <div
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              :style="{
                '--border-light': theme[100],
                '--border-dark': theme[900],
                '--square-light': theme[500],
                '--square-hover-light': theme[400],
                '--square-dark': theme[700],
                '--square-hover-dark': theme[600],
              }"
              class="tuff-tetris-bg__cell"
            >
              <div
                class="tuff-tetris-bg__cell-fill"
                :class="[cell && 'is-active']"
                @click="cell && removeCell(rowIndex, cellIndex)"
              />
            </div>
          </div>
        </div>
      </ClientOnly>
    </div>
  </Transition>
</template>

<style scoped>
.tuff-tetris-bg {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.tuff-tetris-bg__grid {
  position: absolute;
  inset: 0;
  display: grid;
  justify-content: center;
  gap: 0;
}

.tuff-tetris-bg__row {
  display: grid;
  flex: 1;
  gap: 0;
}

.tuff-tetris-bg__row + .tuff-tetris-bg__row {
  margin-top: -1px;
}

.tuff-tetris-bg__cell {
  position: relative;
  border: 1px solid var(--border-light);
}

.tuff-tetris-bg__cell + .tuff-tetris-bg__cell {
  margin-left: -1px;
}

.dark .tuff-tetris-bg__cell {
  border-color: var(--border-dark);
}

.tuff-tetris-bg__cell-fill {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: var(--square-light);
  transition: opacity 1s ease;
  will-change: opacity;
}

.tuff-tetris-bg__cell-fill.is-active {
  cursor: pointer;
  opacity: 0.6;
}

.tuff-tetris-bg__cell-fill:hover {
  background: var(--square-hover-light);
}

.dark .tuff-tetris-bg__cell-fill {
  background: var(--square-dark);
}

.dark .tuff-tetris-bg__cell-fill:hover {
  background: var(--square-hover-dark);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
