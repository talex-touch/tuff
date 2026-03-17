<script setup lang="ts">
import AnimateIcon from '../icon/AnimateIcon.vue'
import { $event } from '~/composables/events'

const route = useRoute()
const router = useRouter()

async function push(path: string) {
  if (path === route.path) {
    if (path === '/')
      $event.emit('REQUEST_CREATE_NEW_CONVERSATION')
  }

  await router.push(path)
  await router.push(path)
}
</script>

<template>
  <div class="IndexNavBar">
    <AnimateIcon tip="融和对话" :active="route.name === 'index'" @click="push('/')">
      <IconSvgChatSvg />
    </AnimateIcon>
    <AnimateIcon tip="论文创作" :active="route.name === 'paper'" @click="push('/paper')">
      <IconSvgPaperSvg />
    </AnimateIcon>
    <AnimateIcon tip="百变角色" :active="route.name === 'prompt_role'" @click="push('/prompt_role')">
      <IconSvgCaseSvg />
    </AnimateIcon>
    <AnimateIcon tip="使用指南" :active="route.name === 'guide'" @click="push('/guide')">
      <IconSvgDocSvg />
    </AnimateIcon>
    <!-- <AnimateIcon tip="图画涂鸦" :active="route.name === 'pic'" @click="push('/pic')">
      <IconSvgPicSvg />
    </AnimateIcon>
    <AnimateIcon tip="来电模式" :active="route.name === 'call'" @click="push('/call')">
      <IconSvgCallSvg />
    </AnimateIcon>
    <AnimateIcon tip="效率工具" :active="route.name === 'powerpoint'" @click="push('/powerpoint')">
      <IconSvgPptSvg />
    </AnimateIcon> -->
    <AnimateIcon v-if="userStore.isAdmin" tip="管理" @click="$router.push('/admin')">
      <IconSvgCopSvg />
    </AnimateIcon>
  </div>
</template>

<style lang="scss">
.IndexNavBar {
  display: flex;

  color: var(--el-text-color-placeholder);
  font-size: 1.75rem;

  gap: 2rem;
  flex-direction: column;
}
</style>
