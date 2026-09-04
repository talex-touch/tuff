<script setup lang="ts">
const members = [1, 2, 3, 4, 5, 6, 7, 8]
</script>

<template>
  <TxAvatarGroup :max="3" :overlap="12" overflow-popover>
    <TxAvatar
      v-for="id in members"
      :key="id"
      :src="`https://avatars.githubusercontent.com/u/${id}?v=4`"
    />
  </TxAvatarGroup>
</template>
