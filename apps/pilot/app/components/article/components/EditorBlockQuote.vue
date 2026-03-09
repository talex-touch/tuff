<script setup lang="ts">
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import clsx from 'clsx'

const { selected, contentRef, node } = useNodeViewContext()

// 定义偏移幅度
const offsetX = 10
const offsetY = 5

const wrapper = ref()
const enter = ref(false)

function _getOffset(range: number[], value: number, max: number) {
  return value / max * (range[1] - range[0]) + range[0]
}

function handleMouseEnter() {
  enter.value = true
}

function handleMouseLeave() {
  enter.value = false

  wrapper.value!.style.setProperty('--x', `0px`)
  wrapper.value!.style.setProperty('--y', `0px`)
}

function genOffset(numX: number, numY: number) {
  const rect = wrapper.value!.getBoundingClientRect()

  const x = _getOffset([-offsetX, offsetX], numX, rect.width)
  const y = _getOffset([-offsetY, offsetY], numY, rect.height)

  return [x, y]
}

function handleMouseMove(e: MouseEvent) {
  const x = e.offsetX - 10
  const y = e.offsetY - 10

  wrapper.value!.style.setProperty('--x', `${x}px`)
  wrapper.value!.style.setProperty('--y', `${y}px`)

  const [offX, offY] = genOffset(x, y)

  wrapper.value!.style.setProperty('--offX', `${offX}px`)
  wrapper.value!.style.setProperty('--offY', `${offY}px`)
}
</script>

<template>
  <div
    ref="wrapper"
    class="EditorBlockQuote rich-article rich-quote-shadow" :class="{ enter, selected }"
    @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave" @mousemove="handleMouseMove"
  >
    <blockquote :ref="contentRef" />
  </div>
</template>

<style lang="scss">
.selected {
  outline: blue solid 1px;
}

.EditorBlockQuote {
  &.enter::before {
    opacity: 1 !important;
  }

  &::before {
    z-index: 10;
    content: '';
    position: absolute;

    left: var(--x, 0);
    top: var(--y, 0);

    width: 20px;
    height: 20px;

    opacity: 0;
    filter: blur(20px) brightness(500%);
    background: linear-gradient(to right, var(--theme-color), var(--text-color)),
      linear-gradient(
        145deg,
        var(--text-color-light) 80%,
        var(--theme-color) 90%
      );
    transition: opacity 0.25s;
  }

  position: relative;
  margin: 1rem 0;
  padding-top: 1px;

  border-radius: 8px;
  transform: translate(var(--offX, 0), var(--offY, 0));
  transition: 0.125s;
  overflow: hidden;

  blockquote {
    &::before {
      z-index: -1;
      content: '';
      position: absolute;

      left: 0;
      top: -1%;
      width: 100%;
      height: 100%;

      --x: 0;
      --y: 0;

      opacity: 0.2;
      border-radius: 8px;
      background: linear-gradient(
          to right,
          var(--theme-color),
          var(--text-color)
        ),
        linear-gradient(
          145deg,
          var(--text-color-light) 80%,
          var(--theme-color) 90%
        );
    }

    margin: 0 !important;

    padding: 0.001rem 1rem;
  }

  --major-color-light: var(--theme-color);
  --theme-color: var(--el-color-primary-light-3);
  --text-color: #fff;
  --text-color-light: #fff;
  --major-color: #fff;

  blockquote p {
    pointer-events: none;
  }

  blockquote {
    &::after {
      z-index: -1;
      content: '';
      position: absolute;

      left: 0;
      top: 0;
      width: 100%;
      height: 100%;

      /* opacity: .35; */
      border-radius: 8px;
      background-color: var(--major-color-light);
    }
    position: relative;
    padding: 0.75rem;

    border-left: none;
    border-radius: 8px;
  }
}

.dark blockquote::before,
.dark pre::before {
  opacity: 0.35;
  background-color: var(--major-color);
}
</style>
