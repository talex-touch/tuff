<template>
  <div class="WindowSection-Wrapper fake-background">
    <p>Window Preference</p>
    <div gap-4 box-border relative w-full flex items-center justify-center class="WindowsSection-Container">
      <slot />
    </div>
    <p style="transition: .1s" ref="tipRef" />
  </div>
</template>

<script name="WindowsSection" setup>
import { sleep } from '@talex-touch/utils/common';

const props = defineProps({
  tip: {
    type: String,
    default: ''
  }
})

const tipRef = ref()

async function mention(html) {
  if (!html)
    return mention(props.tip)

  const el = tipRef.value
  if (!el.innerHTML)
    return el.innerHTML = html

  const style = el.style

  style.opacity = 0
  style.transform = 'translateX(-1rem) scaleY(0.5)'

  await sleep(100)

  el.innerHTML = html

  style.opacity = 0
  style.transform = 'translateX(1rem) scaleY(0.5)'

  await sleep(100)

  style.opacity = 1
  style.transform = 'translateX(0) scaleY(1)'
  await sleep(100)
}

provide('mention', mention)

onMounted(() => {
  mention(props.tip)
})
</script>

<style lang="scss">
.WindowSection-Wrapper {
  margin: 1rem 0;
  padding: 1rem;

  --fake-inner-opacity: 0.75;
  --fake-radius: 4px;
  --fake-color: var(--el-fill-color-dark);
}

.WindowsSection-Container {
  padding: 1rem 0;

  height: 12rem;
}
</style>