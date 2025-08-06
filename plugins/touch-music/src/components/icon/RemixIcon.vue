<template>
  <!--  <svg class="remix">-->
  <!--    <use :xlink:href="`#remix-${name}`"></use>-->
  <!--  </svg>-->
  <i class="remix" :class="`ri-${name}-${style || 'line'}`"></i>
</template>

<script name="RemixIcon" setup>
const props = defineProps({
  name: {
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

<style scoped>
.remix {
  display: block;

  width: 1em;
  height: 1em;

  font-size: 1.25rem;

  background-color: red;
}
</style>
