<script setup lang="ts">
const props = defineProps<{
  newUsersOnly: boolean
  code: string
  disabled: boolean
  selectable?: boolean
}>()
</script>

<template>
  <div class="CouponCard" :class="{ disabled, newUsersOnly }">
    <div class="badge">
      <slot name="badge" />
    </div>

    <div class="CouponCard-LeftContent">
      <div v-if="!newUsersOnly" class="icon" v-text="`券`" />
      <div v-else-if="disabled" class="icon" v-text="`失`" />
      <div v-else class="icon" v-text="`新`" />

      <span class="price">
        <span class="money">￥</span>
        <span class="amo">
          <slot name="price" />
        </span>
      </span>
      <span class="time">
        <slot name="getTime" /> 到期
      </span>
    </div>

    <div v-if="!disabled && selectable" class="mask">
      点击选择
      <div i-carbon:3d-cursor />
    </div>
    <div v-else-if="!disabled" v-copy="code" class="mask">
      点击复制
      <div i-carbon:copy />
    </div>

    <div v-else class="mask disabled">
      已失效
    </div>

    <div class="CouponCard-RightContent">
      <slot name="content" />
    </div>
  </div>
</template>

<style lang="scss">
.CouponCard {
  &.disabled {
    div.mask.disabled {
      z-index: 2;

      opacity: 0.75;
      visibility: unset;

      font-weight: 600;
      font-size: 18px;
    }
    filter: grayscale(0.75);
  }

  &:hover {
    .mask {
      opacity: 1;
      visibility: unset;
    }
    cursor: pointer;

    box-shadow: 0 0 12px 1px #fef9ed50;
  }

  .mask {
    z-index: 1;
    position: absolute;

    top: 0;
    left: 0;
    width: 100%;
    height: 100%;

    gap: 0.5rem;
    display: flex;
    justify-content: center;
    align-items: center;

    opacity: 0;
    color: #fff;
    font-size: 16px;
    transition: 0.25s;
    visibility: hidden;
    border-radius: 12px;
    background-color: #00000080;
  }

  &-RightContent {
    > p.title {
      font-size: 20px;
    }

    > p.subtitle {
      font-size: 14px;
      opacity: 0.75;
    }

    position: absolute;
    padding: 0 1rem;
    display: flex;

    flex-direction: column;
    justify-content: center;

    left: 150px;

    font-size: 16px;
  }

  .badge {
    span {
      padding: 0.25rem 0.5rem;
    }

    position: absolute;

    top: 0;
    right: 0;

    width: max-content;

    color: #dd3c36;
    font-size: 12px;
    background-color: #fee5e2;
    border-radius: 0 12px 0 12px;
  }

  &-LeftContent {
    .time {
      position: absolute;
      display: flex;

      left: 50%;
      bottom: 15px;
      width: max-content;

      font-size: 12px;
      color: #ffffff80;
      text-align: center;
      transform: translate(-50%, 0);
    }

    .price {
      .amo {
        margin: 0 0.5rem;
        font-size: 28px;
      }

      .money {
        font-size: 20px;
      }

      position: absolute;

      top: 50%;
      left: 50%;

      color: #fff;
      transform: translate(-50%, -50%) translateY(-5px);
    }

    .icon {
      position: absolute;

      right: -25px;
      bottom: -50px;

      color: #fff;
      opacity: 0.125;
      font-size: 150px;
      font-weight: 600;
    }

    position: absolute;

    left: 0;

    width: 150px;
    height: 100%;
    mask: // radial-gradient(circle at 0 0, #0000 20px, red 0),
      radial-gradient(circle at right 0, #0000 5px, red 0),
      // radial-gradient(circle at 0 100%, #0000 20px, red 0),
      radial-gradient(circle at right 100%, #0000 5px, red 0);
    /*4个角落各放一个圆*/
    mask-composite: destination-in;
    /*chrome*/
    mask-composite: intersect;
    /*Firefox*/

    border-radius: 12px 0 0 12px;
    background: linear-gradient(45deg, orange, red);

    .dark & {
      background: linear-gradient(45deg, #d48e0be0, #d40808e0);
    }

    .newUsersOnly & {
      // background: linear-gradient(45deg, #8743fb, #cb7561);
      background: linear-gradient(45deg, #08ce67, #3e9375);
    }

    .disabled & {
      background: linear-gradient(45deg, #8743fb, #cb7561);
    }
  }

  position: relative;

  width: 100%;
  height: 100px;
  background-color: #fff;
  border-radius: 12px;

  box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  font-weight: bold;
  color: #333;

  transition: 0.25s;
  background-color: #fef9ed;
  .dark & {
    color: #eee;
    background-color: #262626;
  }
}
</style>
