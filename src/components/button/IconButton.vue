<template>
  <div @click="handleClick" @mouseenter="hover = true" @mouseleave="hover = false" role="button" class="IconButton-Container">
    <div class="IconButton-Icon">
      <remix-icon :name="icon" :style="select || hover ? 'fill' : 'line'" v-if="icon" />
      <slot v-else name="icon" :hover="hover" :select="select"></slot>
    </div>

    <div v-if="display !== 'popover'" class="IconButton-Text">
      <slot name="text" />
    </div>
  </div>
</template>

<script>
export default {
  name: "IconButton"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  icon: {
    type: String
  },
  display: {
    type: String,
    required: false,
    validator( value ) {
        return ['popover'].includes( value )
    }
  },
  direct: {
    type: String,
    required: false
<<<<<<< HEAD
  },
  plain: {
    type: Boolean
  },
  small: {
    type: Boolean
  },
  select: {
    type: Boolean
=======
>>>>>>> parent of a8d59a2 (@initial 1.22)
  }
})

const router = useRouter()
const route = useRoute()

const hover = ref(false)
const select = ref(false)

watchEffect(() => {
  if (props.direct) select.value = (route.path === props.direct)
  if ( props.hasOwnProperty('select') ) select.value = props.select
})

function handleClick() {
  props.direct && router.push( props.direct )
}
</script>

<style lang="scss" scoped>
.IconButton-Container {
  &:hover {
    background-color: var(--el-fill-color-lighter);
  }
  .IconButton-Icon {
    &:hover {
      opacity: .9;
    }
    padding: 5px;

    font-size: 20px;
  }
  &:active {
    transform: scale(.75)
  }
  display: flex;
  //margin: 10px 0;

  justify-content: center;
  align-items: center;

  width: 48px;
  height: 48px;

  cursor: pointer;
  border-radius: 8px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-fill-color);
}
</style>