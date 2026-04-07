<script setup>
import { onMounted } from 'vue'
import Loading from '../icon/LoadingIcon.vue'

const props = defineProps({
  message: String,
  stay: Number,
  close: Function,
  type: TipType,
  loading: Boolean,
  left: Boolean,
})

onMounted(async () => {
  if (props.stay <= 0)
    return

  await sleep(props.stay)

  props.close()
})
</script>

<script>
export default {
  name: 'WikiTip',
}
</script>

<template>
  <div
    :message="message" class="WikiTip-Container"
    :class="{ 'info-tip': type === TipType.INFO,
              left,
              'warn-tip': type === TipType.WARNING,
              'error-tip': type === TipType.ERROR,
              'success-tip': type === TipType.SUCCESS,
              'loading-tip': loading }"
  >
    {{ message }}
    <div class="WikiTip-Loading-Wrapper">
      <Loading v-if="loading" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.WikiTip-Container {
  .WikiTip-Loading-Wrapper {
    position: relative;
    display: inline-block;

    top: -2px;
    left: 10px;

    width: 16px;
    height: 16px;

    transform: scale(0.5);
    --bg-color: var(--theme-color);
  }
  &:before {
    z-index: 0;
    content: '';
    position: absolute;

    width: 100%;
    height: 100%;

    top: 0;
    left: 0;

    border-radius: 8px 0 0 8px;
    //background-color: var(--el-bg-color);
    filter: invert(5%);
    backdrop-filter: contrast(200%) saturate(180%) blur(10px);
  }

  &:after {
    z-index: 10;
    content: attr(message);
    position: absolute;

    width: 100%;
    //height: 100%;

    top: 50%;
    left: 0;

    text-align: center;
    //color: var(--el-text-color-primary);

    transform: translate(-20px, -50%);
  }
  padding: 4px 40px 4px 6px;

  width: max-content;
  height: 30px;
  line-height: 30px;

  color: var(--theme-color, var(--el-text-color-primary));
}

.WikiTip-Container.left {
  padding: 4px 6px 4px 40px;
  &:after {
    transform: translate(20px, -50%);
  }
  &:before {
    border-radius: 0 8px 8px 0;
  }
}

.success-tip {
  --theme-color: #629168;
}

.info-tip {
  --theme-color: #284f90;
}

.warn-tip {
  --theme-color: #f0a732;
}

.error-tip {
  --theme-color: #d0493c;
}

.loading-tip {
  box-shadow:
    0 0 4px 1px var(--theme-color) inset,
    0 0 8px 2px var(--theme-color);
}
</style>
