<script setup lang="ts">
const platforms = [
  { label: 'macOS', platform: 'darwin', os: 'macOS 15' },
  { label: 'Windows', platform: 'win32', os: 'Windows 11' },
  { label: 'Linux', platform: 'linux', os: 'Ubuntu 24.04' },
]
</script>

<template>
  <div class="flex flex-wrap gap-3">
    <div
      v-for="item in platforms"
      :key="item.label"
      class="inline-flex items-center gap-2 rounded-xl border border-[var(--tx-border-color)] bg-[var(--tx-bg-color)] px-3 py-2"
    >
      <TxOsIcon :platform="item.platform" :os="item.os" class="text-xl" />
      <span class="text-sm">{{ item.label }}</span>
    </div>
  </div>
</template>
