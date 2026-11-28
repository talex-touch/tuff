<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? { lift: '上浮（默认）', spread: '悬浮展开', off: '关闭特效' }
  : { lift: 'Lift (default)', spread: 'Spread on hover', off: 'No effect' }))

const members = [1, 2, 3, 4, 5]
</script>

<template>
  <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 20px;">
    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px;">
      <span style="font-size: 12px; opacity: 0.6;">{{ labels.lift }}</span>
      <TxAvatarGroup :overlap="12">
        <TxAvatar
          v-for="id in members"
          :key="id"
          :src="`https://avatars.githubusercontent.com/u/${id}?v=4`"
        />
      </TxAvatarGroup>
    </div>

    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px;">
      <span style="font-size: 12px; opacity: 0.6;">{{ labels.spread }}</span>
      <TxAvatarGroup :overlap="12" spread-on-hover :spread-overlap="-4">
        <TxAvatar
          v-for="id in members"
          :key="id"
          :src="`https://avatars.githubusercontent.com/u/${id}?v=4`"
        />
      </TxAvatarGroup>
    </div>

    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px;">
      <span style="font-size: 12px; opacity: 0.6;">{{ labels.off }}</span>
      <TxAvatarGroup :overlap="12" hover-effect="none">
        <TxAvatar
          v-for="id in members"
          :key="id"
          :src="`https://avatars.githubusercontent.com/u/${id}?v=4`"
        />
      </TxAvatarGroup>
    </div>
  </div>
</template>
