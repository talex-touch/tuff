<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxAvatarGroup :max="3" size="small" :overlap="10">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/2?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/3?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/5?v=4" />
        </TxAvatarGroup>
  </div>
  <div v-else>
        <TxAvatarGroup :max="3" size="small" :overlap="10">
          <TxAvatar src="https://avatars.githubusercontent.com/u/1?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/2?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/3?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/4?v=4" />
          <TxAvatar src="https://avatars.githubusercontent.com/u/5?v=4" />
        </TxAvatarGroup>
  </div>
</template>
