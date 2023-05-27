<template>
  <div flex gap-16 mt-2>
    <div w-30 text-right>
      <slot name="left">
        <div>
          {{ title }}
        </div>
      </slot>
    </div>


    <div flex-1>
      <slot>
        This is line template demo.
      </slot>
    </div>
  </div>
</template>

<script setup name="LineTemplate">
defineProps({
  title: {
    type: String,
    default: "Demo line"
  }
})
</script>