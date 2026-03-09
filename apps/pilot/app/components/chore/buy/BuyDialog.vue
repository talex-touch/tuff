<script setup lang="ts">
import QrCode from 'qrcode'

import WechatPay from '/svg/wechat-pay.svg'
import AliPay from '/svg/ali-pay.svg'
import Balance from '/svg/balance.svg'
import { getUserNearestUnPayOrder, orderPlanPrice } from '~/composables/api/account'

const props = defineProps<{
  modelValue: boolean
  method: string

  countdown: any
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'order', data: any): void
}>()

const loading = ref(false)

function close() {
  emits('update:modelValue', false)
}

const payOptions = reactive<any>({
  price: 0,
})
const codeUrl = ref('')
const show = useVModel(props, 'modelValue', emits)

async function openBuyDialog(res: any) {
  if (props.method !== 'wechat')
    return

  loading.value = true

  syncLocalData(res)

  loading.value = false

  await sleep(200)

  show.value = true
}

async function syncLocalData(res: any) {
  if (!res.data) {
    ElMessage({
      message: `获取失败(${res.message || 'error'})！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
    console.error('res', res)

    show.value = false
    return
  }

  const { data } = res

  emits('order', data)

  payOptions.price = data.order.totalAmount

  const url = await QrCode.toDataURL(data.code_url, { margin: 2 })

  codeUrl.value = url
}

watch(() => props.countdown?.expired, () => {
  if (!props.countdown?.expired)
    return
  // if (props.countdown.expired)
  show.value = false
})

const countdownText = computed(() => {
  if (!props.countdown?.left)
    return

  return formatDuration(props.countdown.left, 'mm:ss:SSS')
})

defineExpose({
  openBuyDialog,
})
</script>

<template>
  <div class="BuyDialog" :class="{ show, loading }">
    <div :class="[method]" class="BuyDialog-Main">
      <div class="BuyDialog-Close" @click="close">
        <div i-carbon:close />
      </div>

      <div class="BuyDialog-Background">
        <div class="BuyDialog-Background-Mask" />
      </div>

      <div v-if="!loading" class="BuyDialog-Content">
        <template v-if="method === 'wechat'">
          <p class="title">
            <img :src="WechatPay">微信支付
          </p>

          <div class="time">
            <div i-carbon:time />{{ countdownText }}
          </div>

          <div class="PayCode">
            <img v-if="codeUrl" :src="codeUrl">
          </div>

          <p class="price">
            <span>￥</span>{{ (payOptions.price / 100).toFixed(2) }}
          </p>

          <div class="mention">
            <div class="icon">
              <div i-carbon:scan-alt />
            </div>
            请使用微信扫一扫完成支付
          </div>
        </template>
        <template v-else-if="method === 'alipay'">
          当前还不支持这种方式
        </template>
        <template v-else-if="method === 'balance'">
          你没有足够的余额
        </template>
      </div>
      <template v-else>
        <LoadersEagleRoundLoading />
      </template>
    </div>
  </div>
</template>

<style lang="scss">
.BuyDialog-Content {
  z-index: 2;
  position: relative;

  & > p.title {
    /* .dark & */
    img {
      filter: invert(1);
    }
    margin: 5% auto 2%;
    display: flex;

    gap: 1rem;
    font-size: 28px;
    font-weight: 600;
    align-items: center;

    color: #fff;
  }

  & > p.price {
    span {
      position: relative;

      top: -3px;

      font-size: 26px;
    }

    margin: 1rem 0;

    font-size: 30px;
    font-weight: 600;
  }

  & > div.time {
    display: flex;

    gap: 0.5rem;
    font-size: 14px;
    align-items: center;

    margin: 1rem 0;

    font-size: 24px;
    font-weight: 600;
    color: var(--el-color-danger);
  }

  .mention {
    .icon {
      padding: 0.5rem;

      border-radius: 8px;
      background-color: var(--c);

      filter: brightness(120%);
    }
    margin: 0.5rem 0;
    padding: 1rem;
    display: flex;

    gap: 0.5rem;
    font-size: 14px;
    align-items: center;

    border-radius: 16px;
    background-color: var(--c);
  }

  .PayCode {
    img {
      width: 100%;
      height: 100%;

      border-radius: 16px;
    }
    margin: 3rem 0;

    padding: 5px;

    width: 256px;
    height: 256px;

    border-radius: 16px;
    background-color: var(--c);
    border: 1px solid var(--el-border-color);
  }

  display: flex;

  flex-direction: column;

  align-items: center;
  justify-content: center;
}

.BuyDialog-Background {
  z-index: 0;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  border-radius: 8px;
  overflow: hidden;

  .BuyDialog-Background-Mask {
    position: absolute;

    width: 100%;
    height: 50%;

    border-radius: 45%;
    transform: translate(0%, -50%);
    background-color: var(--c, var(--theme-color));
  }
}

.BuyDialog-Main {
}

.BuyDialog-Close {
  &:hover {
    color: var(--el-color-danger);
  }
  z-index: 10000;
  position: absolute;
  display: flex;

  top: 0;
  right: 0;

  width: 24px;
  height: 24px;

  cursor: pointer;

  align-items: center;
  justify-content: center;

  border-radius: 50%;
  transform: translate(50%, -50%);
  background-color: var(--c);
}

.BuyDialog {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  backdrop-filter: blur(2px);
  background-color: var(--el-mask-color-extra-light);
  // z-index: 999;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;

  &.show {
    opacity: 1;
    pointer-events: auto;
  }

  & > div {
    &.wechat {
      width: 580px;
      height: 720px;

      --c: #07c160;
      background-color: #23d96e;
    }

    &.alipay {
      width: max-content;
    }

    &.balance {
      width: max-content;
    }

    position: relative;
    background-color: var(--el-bg-color-page);
    border-radius: 8px;

    padding: 2rem;

    box-shadow: var(--el-box-shadow);
    // width: 80%;
    // max-width: 800px;
    // max-height: 80%;

    transition: 0.25s;
  }
}

.BuyDialog.loading .BuyDialog-Main {
  .BuyDialog-Close {
    opacity: 0;
    pointer-events: none;
  }

  width: 128px;
  height: 128px;

  backdrop-filter: blur(18px) saturate(180%);
  background-color: var(--el-overlay-color-lighter);
}

.mobile div.BuyDialog-Main,
.tablet div.BuyDialog-Main {
  .BuyDialog-Close {
    display: none;
  }
  position: absolute;

  width: 100%;
  height: 80%;

  left: 0;
  bottom: 0;

  box-shadow: var(--el-box-shadow);
  border-radius: 18px;
}
</style>
