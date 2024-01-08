<script name="TBlockSelect" setup>
import TSelect from '@comp/base/select/TSelect.vue'
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  modelValue: {
    type: Number,
    required: true,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  icon: {
    type: String,
    required: true,
  },
  iconChange: {
    type: String
  }
})
const emits = defineEmits(['update:modelValue', 'change'])

const value = useModelWrapper(props, emits)

function handleChange(val, e) {
  if (props.disabled) return

  emits('change', val, e)
}
</script>

<template>
  <div class="TBlockSelect-Container TBlockSelection fake-background index-fix" :class="{ disabled }">
    <div class="TBlockSelect-Content TBlockSelection-Content">
      <RemixIcon :name="icon" :style="iconChange ? (value ? 'fill' : 'line') : iconChange" />
      <div class="TBlockSelect-Label">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>
    <div class="TBlockSelect-Select TBlockSelection-Func">
      <TSelect @change="handleChange" v-model="value">
        <slot />
      </TSelect>
    </div>
  </div>
</template>

<style lang="scss" scoped>
//.TBlockSelect-Container + .TBlockSelect-Container {
//  border-radius: 0 0 4px 4px;
//}

.TBlockSelect-Container {
  &.disabled {
    .TBlockSelect-Select {
      opacity: .5;

      pointer-events: none;
    }
  }
  .TBlockSelect-Select {
    display: flex;

    align-items: center;
    span {
      margin-right: 0.5rem;

      font-size: 12px;
    }

  }
  .TBlockSelect-Content {
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

    > .TBlockSelect-Label {
      flex: 1;

      > h3 {
        margin: 0;

        font-size: 14px;
        font-weight: 500;
      }

      > p {
        margin: 0;

        font-size: 12px;
        font-weight: 400;

        opacity: .5;
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
  --fake-opacity: .5;
  &:hover {
    --fake-color: var(--el-fill-color);
  }
}

.touch-blur .TBlockSelect-Container {
  --fake-color: var(--el-fill-color);
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}
</style>
