<script setup name="FormTemplate" lang="ts">
import { ref, provide } from 'vue'
import LoadingIcon from '../../icon/LoadingIcon.vue'

interface FormField {
  vnode: any
  func: () => { access: boolean }
}

interface FormTemplateProps {
  title?: string
  description?: string
  routerBack?: boolean
  contentStyle?: string
}

withDefaults(defineProps<FormTemplateProps>(), {
  title: 'FormTemplate',
  description: 'This is a form template.',
  routerBack: false,
  contentStyle: 'height: calc(100% - 10rem)'
})

const loading = ref(false)
const formFields: FormField[] = []

provide('regFormFiled', (vnode: any, func: () => { access: boolean }) => {
  formFields.push({
    vnode,
    func
  })
})

provide('checkForm', (): boolean => {
  for (const field of formFields) {
    const { access } = field.func()

    if (!access) {
      return false
    }
  }

  return true
})

provide('setLoading', (val: boolean) => (loading.value = val))
</script>

<template>
  <div :class="{ loading }" mx-10 my-6>
    <div pb-5 mb-10 border-b-1 border-b-solid border-gray-500>
      <slot name="header">
        <div items-center flex>
          <div
            v-if="routerBack"
            p-2
            class="i-ri-arrow-left-s-line hover-button fake-background transition-cubic"
            @click="() => $router.back()"
          />
          <p my-4 font-extrabold text-2xl>{{ title }}</p>
        </div>
        <span block text="base" op-75 font-normal>{{ description }}</span>
      </slot>
    </div>

    <div mr-10 absolute :style="`${contentStyle}`" w-full>
      <el-scrollbar>
        <slot>
          <p>Content</p>
        </slot>
      </el-scrollbar>
    </div>

    <div class="Form-Loading transition-cubic">
      <loading-icon />
    </div>
  </div>
</template>

<style scoped lang="scss">
.loading {
  .Form-Loading {
    opacity: 1;
  }

  * {
    pointer-events: none;
    backdrop-filter: blur(10px);
  }

  & :last-child {
    backdrop-filter: none;
  }
}

.Form-Loading {
  position: absolute;

  left: 50%;
  top: 50%;

  opacity: 0;
  box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.25);
  transform: translate(-50%, -50%);
}

:deep(.hover-button) {
  &:hover {
    --fake-inner-opacity: 0.5;
  }

  &:active {
    transform: scale(0.75);
  }

  cursor: pointer;
  --fake-inner-opacity: 0;
}

:deep(.el-scrollbar__view) {
  position: relative;

  width: 100%;
  height: 100%;
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
