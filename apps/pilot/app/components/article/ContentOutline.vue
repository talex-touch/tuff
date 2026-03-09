<script lang="ts" setup>
const props = defineProps(['outline', 'editor', 'editMode'])

const pointer = ref<HTMLElement>()
const eleArr = ref<HTMLElement[]>([])
watchEffect(() => {
  // eslint-disable-next-line no-restricted-syntax, no-labels, no-unused-expressions
  $_ignored: [props.outline, props.editor]

  if (!props.editor)
    return

  setTimeout(() => {
    eleArr.value.length = 0

    const editor = props.editor.$el // document.querySelector('#MilkEditor')!

    ;[...editor.children[0].children[0].children]
      .filter(ele => ele.tagName.match(/H[1-6]/))
      .forEach((ele, ind) => {
        eleArr.value.push(ele as HTMLElement)
        eleArr.value[ind].relative = props.outline[ind]
      })

    // 获取url中的state
    const { hash } = location

    if (props.editMode && hash) {
      const state = decodeURI(hash.substring(1))

      for (let i = 0; i < eleArr.value.length; ++i) {
        handleClick(i)

        const ele = eleArr.value[i]

        if (ele.textContent === state)
          return
      }
    }

    fixPointerPos(0)
    handleScroll()
  }, 200)
})

const onScroll: any = inject('onScroll')
onMounted(() => {
  onScroll(() => handleScroll())
})
// onMounted(() => window.addEventListener('scroll', handleScroll))
// onUnmounted(() => window.removeEventListener('scroll', handleScroll))

function handleScroll() {
  const editor = props.editor?.$el // document.querySelector('#MilkEditor')
  if (!editor)
    return

  // 如果这个时候页面滚动了80%以上 就要换成倒叙查找可见的
  const reverse = window.scrollY / document.body.scrollHeight > 0.8
  const arr = reverse ? [...eleArr.value].reverse() : [...eleArr.value]

  let ind = arr.length - 1

  for (let i = 0; i < arr.length; i++) {
    const ele = arr[i]

    const rect = ele.getBoundingClientRect()

    if (rect.top < 0)
      continue
    if (rect.top > window.innerHeight)
      continue

    // 在页面内，判断是从上还是从下
    if (reverse) {
      ind = arr.length - 1
      break
      // if (rect.top > window.innerHeight / 2) {
      //   ind = i
      //   break
      // }
    }
    else {
      if (rect.top + 5 >= rect.height) {
        ind = i
        break
      }
    }
  }

  fixPointerPos(ind)
}

let timer: any = null

function fixPointerPos(index: number) {
  const target = document.querySelector(`#Outline-Item-${index}`) as HTMLElement
  const style = pointer.value!.style

  if (!target) {
    style.opacity = '0'
    style.transform = 'scaleY(0)'
    style.height = '0'
    return
  }

  // Hide all active
  document.querySelectorAll('.Outline-Item.active').forEach((ele) => {
    ele.classList.remove('active')
  })

  target.classList.add('active')

  // 为页面url设置
  history.pushState({}, '', `#${encodeURI(target.textContent!)}`)

  style.opacity = '.75'
  style.transform = 'scaleY(.6)'
  style.top = `${target.offsetTop}px`
  style.height = `${target.getBoundingClientRect().height}px`
  style.boxShadow = '2px 1px 12px 1px var(--theme-color)'

  clearTimeout(timer)

  timer = setTimeout(() => {
    style.opacity = '1'
    style.transform = 'scaleY(1)'
    style.boxShadow = '4px 1px 24px 1px var(--theme-color)'
  }, 200)
}

async function handleClick(index: number) {
  const target = eleArr.value[index]

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  })

  // setTimeout(() => fixPointerPos(index), 2800)
}
</script>

<template>
  <ul>
    <li
      v-for="(item, index) in outline" :id="`Outline-Item-${index}`" :key="index" class="Outline-Item"
      :style="`--level: ${item.level}`" @click="handleClick(index)"
    >
      {{ item.text }}
    </li>

    <div ref="pointer" class="OutlinePointer" />
  </ul>
</template>

<style scoped>
ul {
  z-index: 1;
  position: relative;
  margin: 0.5rem 0;
  padding: 0.5rem 0.25rem;

  height: 100%;
}

ul li {
  position: relative;
  margin: 0.5rem;
  padding: 0.5rem 0.25rem;

  font-size: 18px;
  opacity: 0.85;
  cursor: pointer;
  text-indent: 1rem;
  pointer-events: all;
}

ul li::before {
  z-index: -1;
  content: '';
  position: absolute;

  width: 0;
  height: 100%;

  left: 0;
  top: 0;

  border-radius: 0 8px 8px 0;
  transition: width 0.5s;
  filter: invert(5%) brightness(120%);
  background-color: var(--theme-color-light);
}

.dark ul li::before {
  filter: invert(0);
  background-color: var(--theme-color-light);
}

.Outline-Item.active {
  opacity: 1;
  font-weight: 600;
  pointer-events: none;
}

.Outline-Item.active::before {
  width: 102%;
}

.OutlinePointer {
  transition: all 0.2s;
  opacity: 0;
  transform: scaleY(0);

  border-radius: 8px;
  box-shadow: 4px 1px 24px 1px var(--theme-color);
  background-color: var(--theme-color);

  top: 0;
  left: 8px;

  width: 5px;
  height: 0;

  position: absolute;
}
</style>
