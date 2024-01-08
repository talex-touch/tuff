<template>
  <div class="TGroupBlock-Container" :class="{ expand }">
    <div class="TGroupBlock-Header fake-background index-fix" @click="expand = !expand">
      <div class="TGroupBlock-Content">
        <remix-icon :name="icon" :style="(expand && expandFill) ? 'fill' : 'line'" />
        <div class="TGroupBlock-Label">
          <h3>{{ name }}</h3>
          <p>{{ description }}</p>
        </div>
      </div>
      <div class="TGroupBlock-Mode" :class="expand ? 'i-ri-subtract-line' : 'i-ri-add-fill'" />
    </div>
    <div class="TGroupBlock-Main">
      <slot />
    </div>
  </div>
</template>

<script name="TGroupBlock" setup>
import { ref } from 'vue'

const props = defineProps(['name', 'icon', 'description', 'expandFill', 'shrink'])

const expand = ref(!props.shrink)
</script>

<style lang="scss">
.TGroupBlock-Container .TGroupBlock-Main .TBlockSelection {
  .TBlockSelection-Content > * {
    font-size: 20px;
  }
  .TBlockSelection-Func {
    margin-right: 32px;
  }
  margin: 0;

  border-radius: 0 !important;
  --fake-radius: 0 !important;
  --fake-inner-opacity: .5;
  .touch-blur & {
    &:hover {
      --fake-color: var(--el-fill-color-light) !important;
    }
  }
}
</style>

<style lang="scss" scoped>
//:deep(.TBlockSelection)

.TGroupBlock-Header {
  .TGroupBlock-Content {
    :deep(.remix) {
      position: relative;

      bottom: -0.125em;
    }
    display: flex;

    justify-content: space-between;
    align-items: center;

    height: 100%;

    > * {
      margin-right: 12px;

      font-size: 24px;
    }

    > .TGroupBlock-Label {
      flex: 1;

      > h3 {
        margin: 0;

        font-size: 16px;
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
  .TGroupBlock-Mode {
    position: relative;
    margin-right: 10px;

    bottom: -0.125em;
  }
  padding: 4px 12px;
  display: flex;

  justify-content: space-between;
  align-items: center;

  width: 100%;
  height: 56px;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  border-bottom: 1px solid var(--el-border-color-lighter);
  --fake-color: var(--el-fill-color-dark);
  --fake-inner-opacity: .5;
  &:hover {
    --fake-color: var(--el-fill-color);
    transition: all 1s; // 避免主题模式切换颜色交替时间过长
  }
}

.touch-blur .TGroupBlock-Header {
  --fake-color: var(--el-fill-color);
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}

.TGroupBlock-Main {
  text-indent: 32px;
}

.TGroupBlock-Container {
  .TGroupBlock-Main {
    .TGroupBlock-Header {
      --fake-inner-opacity: .65 !important;
    }
    border-bottom: 1px solid var(--el-border-color);
    margin-bottom: 0;
    border-radius: 0;
    --fake-radius: 0 !important;
    :deep(.TBlockSelection) {
      &:after {
        content: "";
        position: absolute;

        margin-left: 35px;

        width: 1px;
        height: 100%;

        background-color: var(--el-border-color);
      }

      .TBlockSwitch-Content > * {
        font-size: 18px;
      }

      .TBlockSelection-Label > h3 {

        margin: 0;

        font-size: 14px;
        font-weight: 400;
      }

      .TBlockSelection-Label p {
        font-weight: 300;
        font-size: 12px;
      }

    }
    .TGroupBlock-Main {
      text-indent: 64px;
    }
  }
  --fake-radius: 0 !important;
  &.expand {
    max-height: 1000px;
    transition: max-height 1.5s cubic-bezier(0.39, 0.575, 0.565, 1);
  }
  position: relative;
  margin-bottom: .7rem;

  width: 100%;
  max-height: 56px;

  overflow: hidden;
  border-radius: 4px;
  transition: max-height .35s;
}
</style>