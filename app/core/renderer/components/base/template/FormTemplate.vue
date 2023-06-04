<script setup name="FormTemplate" lang="ts">
defineProps({
  title: {
    type: String,
    default: 'FormTemplate'
  },
  description: {
    type: String,
    default: 'This is a form template.'
  },
  routerBack: {
    type: Boolean,
    default: false
  }
});

const formFields = []

provide('regFormFiled', (vnode, func) => {
  formFields.push({
    vnode, func
  })
})

provide('checkForm', () => {
  for (const field of formFields) {
    const { access } = field.func()

    if ( !access ) {
      return false
    }
  }

  return true
})

</script>

<template>
  <div mx-10 my-6>

    <div pb-5 mb-10 border-b-1 border-b-solid border-gray-500>
      <slot name="header">
        <div items-center flex>
          <div p-2 @click="() => $router.back()" v-if="routerBack"
            class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic" />
          <p my-4 font-extrabold text-2xl>{{ title }}</p>
        </div>
        <span block text="base" op-75 font-normal>{{ description }}</span>
      </slot>
    </div>

    <div absolute style="height: calc(100% - 10rem);width: 96%">
      <el-scrollbar>
        <slot>
          <p>Content</p>
        </slot>
      </el-scrollbar>
    </div>

  </div>
</template>

<style scoped lang="scss">
.hover-button {
  &:hover {

    --fake-inner-opacity: .5;
  }

  &:active {
    transform: scale(.75);
  }

  cursor: pointer;
  --fake-inner-opacity: 0;
}

.FormTemplate-Container {
  position: relative;
  margin: 2% 10%;

  width: 80%;
  height: 96%;

  left: 0;
  top: 0;

  box-sizing: border-box;
}
</style>