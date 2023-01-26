<template>
  <div class="TBlockSwitch-Container TBlockSelection fake-background index-fix" :class="{ disabled }">
    <div class="TBlockSwitch-Content TBlockSelection-Content">
      <remix-icon :name="icon" :style="value ? 'fill' : 'line'" />
      <div class="TBlockSwitch-Label TBlockSelection-Label">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>
    <div v-if="!guidance" class="TBlockSwitch-Switch TBlockSelection-Func">
      <span>{{ value ? '开' : '关' }}</span>
<!--      样式同步透明 不额外设定disabled-->
      <t-switch v-model="value" />
    </div>
    <div v-else class="TBlockSwitch-Guidance">
      <remix-icon name="arrow-right-s" />
    </div>
  </div>
</template>

<script>
export default {
  name: "TBlockSwitch"
}
</script>

<script setup>
import TSwitch from '@comp/switch/TSwitch.vue'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { useModelWrapper } from '@modules/utils'
import { watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  modelValue: {
    type: Boolean,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  icon: {
    type: String,
    required: true
  },
  guidance: {
    type: Boolean,
    default: false
  }
})
const emits = defineEmits(['update:modelValue', 'change'])

const value = useModelWrapper(props, emits)

watch(() => value, () => emits('change', value))
</script>

<style lang="scss" scoped>

//.TBlockSwitch-Container + .TBlockSwitch-Container {
//  border-radius: 0 0 4px 4px;
//}

.TBlockSwitch-Container {
  &.disabled {
    .TBlockSwitch-Switch {
      opacity: .5;

      pointer-events: none;
    }
  }
  .TBlockSwitch-Switch {
    display: flex;

    align-items: center;
    span {
      margin-right: 0.5rem;

      font-size: 12px;
    }

  }
  .TBlockSwitch-Content {
    display: flex;
    align-items: center;

    width: 100%;
    height: 100%;

    box-sizing: border-box;

    cursor: pointer;

    > * {
      margin-right: 16px;

      font-size: 24px;
    }

    > .TBlockSwitch-Label {
      flex: 1;

      > h3 {
        margin: 0;

        font-size: 16px;
        font-weight: 500;
      }

      > p {
        margin: 0;

        font-size: 14px;
        font-weight: 400;

        opacity: .85;
      }
    }
  }
  position: relative;
  margin-bottom: 10px;
  padding: 4px 16px;
  display: flex;

  justify-content: space-between;
  align-items: center;

  width: 100%;
  height: 56px;

  user-select: none;
  border-radius: 4px;
  //transition: .5s,;
  box-sizing: border-box;
  --fake-color: var(--el-fill-color-dark);
  --fake-radius: 4px;
  --fake-opacity: .45;
  &:hover {
    --fake-color: var(--el-fill-color);
  }
}

.blur .TBlockSwitch-Container {
  --fake-color: var(--el-fill-color);
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}
</style>