<script setup lang="ts">
// Isolated async stylesheet carrier so KaTeX CSS (~23 KB + font assets) is only
// emitted on docs pages that actually render formulas (`hasDocMathContent`).
import 'katex/dist/katex.min.css'
</script>

<template>
  <span class="docs-katex-styles" hidden aria-hidden="true" />
</template>
