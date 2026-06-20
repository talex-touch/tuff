<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'TxOsIcon',
})

const props = withDefaults(defineProps<{
  platform?: string
  os?: string
}>(), {
  platform: '',
  os: '',
})

const normalizedPlatform = computed(() => {
  const source = `${props.platform} ${props.os}`.trim().toLowerCase()

  if (source.includes('win'))
    return 'windows'

  if (
    source.includes('linux')
    || source.includes('ubuntu')
    || source.includes('debian')
    || source.includes('fedora')
    || source.includes('arch')
  ) {
    return 'linux'
  }

  return 'macos'
})
</script>

<template>
  <svg
    v-if="normalizedPlatform === 'macos'"
    class="tx-os-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M16.37 1.43c0 1.14-.47 2.24-1.29 3.05-.84.82-2.2 1.46-3.3 1.37-.14-1.1.49-2.28 1.25-3.05.84-.85 2.3-1.48 3.34-1.37ZM20.98 17.14c-.57 1.31-.84 1.89-1.58 3.05-1.03 1.6-2.48 3.6-4.28 3.62-1.6.02-2.01-1.04-4.18-1.03-2.17.01-2.62 1.05-4.22 1.04-1.8-.02-3.17-1.82-4.2-3.42-2.88-4.47-3.18-9.72-1.4-12.51 1.27-1.99 3.27-3.16 5.16-3.16 1.92 0 3.13 1.05 4.72 1.05 1.54 0 2.48-1.06 4.7-1.06 1.68 0 3.46.91 4.72 2.49-4.15 2.27-3.48 8.2.56 9.93Z"
    />
  </svg>

  <svg
    v-else-if="normalizedPlatform === 'windows'"
    class="tx-os-icon"
    viewBox="0 0 256 256"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M0 0h121.33v121.33H0V0Zm134.67 0H256v121.33H134.67V0ZM0 134.67h121.33V256H0V134.67Zm134.67 0H256V256H134.67V134.67Z"
    />
  </svg>

  <svg
    v-else
    class="tx-os-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="currentColor"
      d="M12 2.25c-2.42 0-4.39 2.1-4.39 4.68 0 1.09.26 2.13.68 3.03-.66.87-1.07 1.95-1.07 3.13 0 2.65 2.14 4.8 4.78 4.8s4.78-2.15 4.78-4.8c0-1.18-.41-2.26-1.07-3.13.42-.9.68-1.94.68-3.03 0-2.58-1.97-4.68-4.39-4.68Zm-1.52 4.1c.5 0 .9.42.9.94s-.4.94-.9.94-.9-.42-.9-.94.4-.94.9-.94Zm3.04 0c.5 0 .9.42.9.94s-.4.94-.9.94-.9-.42-.9-.94.4-.94.9-.94Zm-5.4 11.74c-1.31.54-2.65 1.06-3.2.2-.48-.75.25-1.85 1.5-2.56.36 1 .95 1.84 1.7 2.36Zm7.76 0c.75-.52 1.34-1.36 1.7-2.36 1.25.71 1.98 1.81 1.5 2.56-.55.86-1.89.34-3.2-.2ZM12 10.1c.93 0 1.88.38 2.55 1.02.49.47.73 1.06.73 1.74 0 1.8-1.47 3.26-3.28 3.26s-3.28-1.46-3.28-3.26c0-.68.24-1.27.73-1.74A3.7 3.7 0 0 1 12 10.1Z"
    />
  </svg>
</template>

<style scoped>
.tx-os-icon {
  display: block;
  width: 1em;
  height: 1em;
  flex: 0 0 auto;
}
</style>
