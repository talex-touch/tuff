<template>
<!--  <svg class="remix">-->
<!--    <use :xlink:href="`#remix-${name}`"></use>-->
<!--  </svg>-->
  <i class="remix" :class="`ri-${name}-${style || 'line'}`"></i>
</template>

<script>
export default {
  name: "RemixIcon"
}
</script>

<script setup>
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
  /*position: relative;*/
  /*margin-top: .25em;*/

  width: 1em;
  height: 1em;
}
</style>