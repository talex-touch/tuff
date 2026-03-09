<script lang="ts">
export default {
  name: 'CaseSvg',
}
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
    <g stroke="currentColor" stroke-linecap="round" stroke-width="2">
      <path
        fill="none" stroke-dasharray="16" stroke-dashoffset="16"
        d="M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7" opacity="0"
      >
        <animate fill="freeze" attributeName="stroke-dashoffset" begin="0.7s" dur="0.2s" values="16;32" />
        <set attributeName="opacity" begin="0.7s" to="1" />
      </path>
      <path
        fill="currentColor" fillOpacity="0" stroke-dasharray="64" stroke-dashoffset="64"
        d="M9 7H20C20.5523 7 21 7.44772 21 8V19C21 19.5523 20.5523 20 20 20H4C3.44772 20 3 19.5523 3 19V8C3 7.44772 3.44772 7 4 7z"
      >
        <animate fill="freeze" attributeName="stroke-dashoffset" dur="0.6s" values="64;0" />
        <animate fill="freeze" attributeName="fill-opacity" begin="0.7s" dur="0.15s" values="0;0.3" />
      </path>
    </g>
  </svg>
</template>
