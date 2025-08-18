<template>
  <div ref="wrapperRef" class="WindowSection-Wrapper fake-background">
    <p font-600 text-lg>Window Preference</p>
    <div
      gap-4
      box-border
      relative
      w-full
      flex
      items-center
      justify-center
      class="WindowsSection-Container"
    >
      <slot />
    </div>
    <div ref="pointerRef" class="Pointer">
      <div class="pointer-border top"></div>
      <div class="pointer-border bottom"></div>
      <div class="pointer-border left"></div>
      <div class="pointer-border right"></div>
    </div>
    <p style="transition: 0.1s" ref="tipRef" />
  </div>
</template>

<script lang="ts" name="WindowsSection" setup>
import { sleep } from '@talex-touch/utils/common'

const props = defineProps({
  tip: {
    type: String,
    default: ''
  }
})

const pointerRef = ref<HTMLElement | null>()
const wrapperRef = ref<HTMLElement | null>()
const tipRef = ref()

const pointerOptions = reactive({
  pos: ['0', '0', '0', '0'],
  show() {
    pointerRef.value!.style.opacity = '1'
  },
  hide() {
    pointerRef.value!.style.opacity = '0'
  }
})

async function mention(html: string | undefined) {
  if (!html) return props.tip ? mention(props.tip) : 0

  const el = tipRef.value
  if (!el.innerHTML) return (el.innerHTML = html)

  const style = el.style

  style.opacity = 0
  style.filter = 'blur(2px)'
  style.transform = 'translateX(-.5rem)'

  await sleep(100)

  el.innerHTML = html

  style.opacity = 0
  style.filter = 'blur(2px)'
  style.transform = 'translateX(.5rem)'

  await sleep(100)

  style.opacity = 1
  style.filter = 'blur(0px)'
  style.transform = 'translateX(0)'
  await sleep(100)
}

provide('mention', mention)

/*
 * 遍历 each SectionItem => 当点击 / hover的时候 pointerRef 变化
 */
async function readSectionItems() {
  const wrapper = wrapperRef.value

  if (!wrapper) return

  function hoverEl(el: HTMLElement) {
    if (el.classList.contains('disabled')) {
      pointerRef.value!.classList.add('disabled')
    } else pointerRef.value!.classList.remove('disabled')

    const rect = el.getBoundingClientRect()

    pointerRef.value!.classList.remove('active')
    pointerOptions.show()

    pointerOptions.pos = [
      el.offsetLeft + 'px',
      el.parentElement!.offsetTop + el.offsetTop / 3 + 'px',
      rect.width + 16 + 'px',
      rect.height + 16 + 'px'
    ]
  }

  function activeEl(el: HTMLElement) {
    hoverEl(el)

    pointerRef.value!.classList.add('active')
  }

  // read
  wrapper.querySelectorAll('.SectionItem-Container').forEach((el: Element) => {
    if (!(el instanceof HTMLElement)) return

    // el.addEventListener('click', () => {
    //   pointerRef.value = el
    // })

    if (el.classList.contains('active')) {
      activeEl(el)
    }

    // on mouse leave
    el.addEventListener('mouseleave', () => {
      pointerOptions.hide()
      activeEl(wrapper.querySelector('.SectionItem-Container.active')!)
    })

    el.addEventListener('mouseenter', () => {
      if (el.classList.contains('active')) {
        activeEl(el)
      } else hoverEl(el)
    })

    el.addEventListener('click', () => {
      if (!el.classList.contains('disabled')) activeEl(el)
    })
  })
}

onMounted(() => {
  readSectionItems()

  mention(props.tip)
})
</script>

<style lang="scss" scoped>
.pointer-border {
  --len: 1rem;

  .active & {
    --c: var(--el-color-primary);
    --len: 50%;
  }

  &.top {
    &:before,
    &:after {
      width: var(--len);
      height: 2px;
    }

    &:after {
      left: calc(100% - var(--len) - 2px);
    }
  }

  &.bottom {
    &:before,
    &:after {
      width: var(--len);
      height: 2px;

      top: calc(100% - 2px);
    }

    &:after {
      left: calc(100% - var(--len) - 2px);
    }
  }

  &.left {
    &:before,
    &:after {
      width: 2px;
      height: var(--len);
    }

    &:after {
      top: calc(100% - var(--len));
    }
  }

  &.right {
    &:before,
    &:after {
      width: 2px;
      height: var(--len);

      left: calc(100% - 4px);
    }

    &:after {
      top: calc(100% - var(--len));
    }
  }

  &:before,
  &:after {
    content: '';
    position: absolute;

    width: 100%;
    height: 100%;

    left: 2px;
    top: 2px;

    transition: cubic-bezier(1, 0.25, 0.1, 0.5) 0.5s;
    background-color: var(--c, aliceblue);
  }

  position: absolute;
  padding: 8px;

  left: 0;
  top: 0;

  width: var(--w);
  height: var(--h);
}

.WindowSection-Wrapper {
  .Pointer {
    --l: v-bind(pointerOptions.pos[0]);
    --t: v-bind(pointerOptions.pos[1]);
    --w: v-bind(pointerOptions.pos[2]);
    --h: v-bind(pointerOptions.pos[3]);

    z-index: -2;
    position: absolute;
    padding: 8px;

    left: var(--l);
    top: var(--t);

    width: var(--w);
    height: var(--h);

    opacity: 0;
    border-radius: 12px;
    overflow: hidden;
    transition: cubic-bezier(0.85, 0.1, 1, 0.5) 0.25s;

    &.disabled {
      --c: var(--el-color-error);
    }

    &.active {
      border-radius: 15px;
    }
  }

  & p {
    margin: 0.5rem 0.25rem;
  }

  margin: 1rem 0;
  padding: 0.5rem;

  --fake-inner-opacity: 0.5;
  --fake-radius: 12px;
  --fake-color: var(--el-fill-color-dark);
}

.WindowsSection-Container {
  padding: 1rem 0;

  height: 12rem;
}
</style>
