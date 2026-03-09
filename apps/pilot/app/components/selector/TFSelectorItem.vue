<template>

  <div v-wave class="TFSelectorItemPage" :class="{ disabled, small, selected, vertical, plain, 'plain-selected': selected && plain }" ref="TFSelectorItemRef">

    <div :class="{ 'text-center': textCenter, 'icon-fixed': iconFixed }">

      <slot>
        <span v-if="disabled" class="label">{{ title }}</span>
        <router-link v-else :to="to" class="label">{{ title }}</router-link>
      </slot>

    </div>

  </div>

</template>

<script setup>

import { ref, defineProps, inject, onMounted } from 'vue'

const props = defineProps({
  title: '',
  to: '',
  textCenter: {

    type: Boolean,
    default: false,

  },
  plain: {

    type: Boolean,
    default: false,

  },
  iconFixed: {

    type: Boolean,
    default: false,

  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const selected = ref(false)
const vertical = ref(false)
const small = ref(false)

const TFSelectorItemRef = ref(null)

const pushItem = inject('pushItem')

const getTo = ref(() => {

  return props.to

})

const setVertical = ref((vertical) => {

  vertical.value = vertical

})

const setSmall = ref((small) => {

  small.value = small

})

const refreshSelect = ref((select) => {

  selected.value = select

})

onMounted(() => {

  pushItem( TFSelectorItemRef, props.to, (fVertical) => vertical.value = fVertical, (fSmall) => small.value = fSmall, refreshSelect, () => props.disabled )

})

</script>

<script>
export default {
  name: "TFSelectorItem",
}
</script>

<style lang="scss" scoped>

.TFSelectorItemPage {
  & > div {
    width: 100%;
    height: 100%;
  }

  :deep(a, a:visited) {
    color: var(--el-text-color-primary);
    text-decoration: none;
    transition: color .75s
  }

  position: relative;
  margin: 0 8px;
  padding: 0 16px;
  display: inline-block;

  height: 100%;

  cursor: pointer;
  user-select: none;
  opacity: 1;
  //animation: loadIn .45s .75s forwards;

  :deep(.label) {

    font-size: 15px;

  }

  &:hover {

    color: var(--el-color-primary-light-3);

    opacity: .75;

    transition: all .15s;

  }

}

.vertical {

  margin: 8px 0 8px 3px;
  padding: 4px 8px;

  display: block;

  height: 32px;
  text-indent: 10px;
  line-height: 32px;
  border-radius: 8px;

  :deep(a, a:visited) {
    color: inherit;
  }

}

.selected {

  &:hover {

    opacity: 1;

  }

  color: #fff;

  :deep(a, a:visited) {
    color: inherit;
  }

}

.vertical.selected {
  color: var(--el-color-primary-dark-2);
  background-color: var(--el-color-primary-light-7);
}

.text-center {

  position: relative;
  display: flex;

  justify-content: center;
  vertical-align: middle;

}

.icon-fixed {

  i {

    position: absolute;

    left: 0;

  }

}

.plain {

 span, a {
   //color: var(--el-text-color-regular) !important;
 }

  &:hover {

    //i, .label { opacity: .75; filter: invert(0) }

    background-color: transparent;

  }

}

.plain-selected {

  &:after {

    background-color: rgba(0, 0, 0, 0);

  }

  &:hover {

    opacity: 1;

  }

}

.small {

  margin: 0 4px !important;
  padding: 0 8px !important;

  .label {

    font-size: 14px !important;

  }

  i {

    font-size: 20px !important;

  }

}

@keyframes loadIn {
  0% {
    opacity: 0;
    transform: translateY(-5px);
  }
  80% {
    opacity: 1;
    transform: translateY(3px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

</style>

<style lang="scss">
.TFSelectorItemPage.disabled {
  &:hover {
    color: var(--el-color-info) !important;
  }
  opacity: .25 !important;
  cursor: not-allowed;
}
</style>
