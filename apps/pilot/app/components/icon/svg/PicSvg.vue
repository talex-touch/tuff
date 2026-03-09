<script lang="ts">
export default {
  name: 'PicSvg',
}
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path fill="none" stroke-dasharray="66" stroke-dashoffset="66" stroke-width="2" d="M3 14V5H21V19H3V14"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="66;0" /></path><path fill="currentColor" fill-opacity="0" stroke-dasharray="52" stroke-dashoffset="52" d="M3 16L7 13L10 15L16 10L21 14V19H3Z"><animate fill="freeze" attributeName="stroke-dashoffset" begin="0.6s" dur="0.8s" values="52;0" /><animate fill="freeze" attributeName="fill-opacity" begin="1s" dur="0.15s" values="0;0.3" /></path></g><circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" fill-opacity="0"><animate fill="freeze" attributeName="fill-opacity" begin="1s" dur="0.4s" values="0;1" /></circle></svg>
</template>
