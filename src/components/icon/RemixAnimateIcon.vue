<template>
  <svg class="remix">
    <use :xlink:href="`#ri-${from}-${style || 'line'}`"></use>
  </svg>
</template>

<script>
export default {
  name: "RemixAnimateIcon"
}
</script>

<script setup>
const props = defineProps({
  category: {
    type: String,
    required: true
  },
  from: {
    type: String,
    required: true
  },
  style: {
    type: String,
    validator( value ) {
      return ['line', 'fill'].includes( value )
    }
  }
})

</script>

<style lang="scss" scoped>

@keyframes move {
  0% {
    stroke-dashoffset: 8;
  }
  100% {
    stroke-dashoffset: -972;
  }
}

.remix {
  &:hover {
    animation: move 3s linear forwards;
  }

  width: 1em;
  height: 1em;

  fill: currentColor;

  animation: move 3s linear forwards;
}
</style>