<template>
  <div class="TBlockSlot-Container TBlockSelection fake-background index-fix" :class="{ disabled }">
    <div class="TBlockSlot-Content TBlockSelection-Content">
      <remix-icon :name="icon" :style="`line`" />
      <div class="TBlockSlot-Label TBlockSelection-Label">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
      </div>
    </div>
    <div class="TBlockSlot-Slot TBlockSelection-Func">
      <slot />
    </div>
  </div>
</template>

<script>
export default {
  name: "TBlockSlot"
}
</script>

<script setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  disabled: {
    type: Boolean,
    default: false
  },
  icon: {
    type: String,
    required: true
  }
})

</script>

<style lang="scss" scoped>

//.TBlockSlot-Container + .TBlockSlot-Container {
//  border-radius: 0 0 4px 4px;
//}

.TBlockSlot-Container {
  &.disabled {
    .TBlockSlot-Switch {
      opacity: .5;

      pointer-events: none;
    }
  }
  .TBlockSlot-Slot {
    //display: flex;

    //min-width: 80px;
    //min-height: 60%;

    //border-radius: 4px;
    //overflow: hidden;

    //cursor: pointer;
    //align-items: center;
    //box-sizing: border-box;
  }
  .TBlockSlot-Content {
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

    > .TBlockSlot-Label {
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
  --fake-opacity: .45;
  &:hover {
    --fake-color: var(--el-fill-color);
  }
}

.blur .TBlockSlot-Container {
  --fake-color: var(--el-fill-color);
  &:hover {
    --fake-color: var(--el-fill-color-light);
  }
}
</style>