<script setup lang="ts">
import CardFreeImg from '/backgrounds/card_free.jpg'
import CardStandardImg from '/backgrounds/card_standard.jpg'
import CardUltimateImg from '/backgrounds/card_ultimate.jpg'
import CardFlagshipImg from '/backgrounds/card_flagship.jpg'
import { ElCarousel, dayjs } from 'element-plus'

const carousel = useTypedRef(ElCarousel)
const planCards = reactive([{
  name: '免费订阅计划',
  img: CardFreeImg,
  type: 'FREE',
  select: () => !userStore.value.subscription,
}, {
  name: '标准订阅计划',
  img: CardStandardImg,
  type: 'STANDARD',
  select: () => userStore.value?.subscription?.type === 'STANDARD',
}, {
  name: '高级订阅计划',
  img: CardUltimateImg,
  type: 'ULTIMATE',
  select: () => userStore.value?.subscription?.type === 'ULTIMATE',
}, {
  name: '旗舰订阅计划',
  img: CardFlagshipImg,
  type: 'FLAGSHIP',
  select: () => userStore.value?.subscription?.type === 'FLAGSHIP',
}])

onMounted(() => {
  if (userStore.value?.subscription?.type) {
    const type = userStore.value?.subscription?.type

    carousel.value?.setActiveItem(type)
  }
})

const planProgress = computed(() => {
  if (!userStore.value.subscription)
    return null

  const { startDate, endDate } = userStore.value.subscription

  const startDateObj = dayjs(startDate)
  const endDateObj = dayjs(endDate)

  const startTimeStamp = startDateObj.toDate().getTime()
  const endTimeStamp = endDateObj.toDate().getTime()

  const total = endTimeStamp - startTimeStamp
  const diff = Date.now() - startTimeStamp
  const progress = Math.round((diff / total) * 100)

  const text = formatDate(endDate, 'YYYY-MM-DD')

  return { text, progress }
})
</script>

<template>
  <div class="TouchDialog-Title">
    <div i-carbon:document-multiple-01 />订阅计划
  </div>
  <div class="ModulePlan TouchDialog-Content">
    <div class="ModulePlan-Cards">
      <ElCarousel
        ref="carousel" :autoplay="false" arrow="never" indicator-position="outside" trigger="click"
        height="350px"
      >
        <el-carousel-item v-for="(item, index) in planCards" :key="item.name" :name="item.type">
          <div class="ModulePlan-Card-Item transition-cubic">
            <div class="card-bg">
              <img class="card-img bg" :src="item.img" :alt="item.name">
              <img class="card-img" :src="item.img" :alt="item.name">

              <ChoreLogo class="logo" />
              <div class="shining" />
            </div>
            <div class="card-content">
              <div class="title" flex items-center gap-2>
                <div invert-100 class="card-symbol">
                  <svg viewBox="0 0 576 512" height="1em" class="logoIcon">
                    <path
                      d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6H426.6c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"
                    />
                  </svg>
                </div>{{ item.name }}
              </div>
              <p class="desc">
                <template v-if="item.select()">
                  当前订阅.
                </template>
                <template v-else>
                  订阅未获得.
                </template>
              </p>

              <div class="card-footer">
                <div v-if="item.select()" class="card-progress">
                  <div class="card-progress-inner" :style="`--p: ${100 - (planProgress?.progress || 0)}%`" />
                  <span class="card-progress-text">订阅时间至 {{ planProgress?.text }}</span>
                </div>
                <div v-else-if="index">
                  <el-link href="/plan">
                    立即订阅该计划
                  </el-link>
                </div>
              </div>
            </div>
          </div>
        </el-carousel-item>
      </ElCarousel>
    </div>
    <div class="ModulePlan-Desc">
      <p><span v-if="!userStore.subscription">还在犹豫不绝？</span>联系我们的专家来帮助你。</p>
      <ButtonShiningButton>
        立即咨询
      </ButtonShiningButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ModulePlan-Desc {
  display: flex;
  margin: 0 auto;

  gap: 0.5rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;
}

.ModulePlan .card-bg .shining {
  &::before {
    content: '';
    z-index: 1;
    position: absolute;

    top: 0;
    left: 0;

    width: 10%;
    height: 100%;

    opacity: 0.5;
    filter: blur(10px) brightness(120%);
    background-color: #e4dede;
    animation: shiningBar 5s ease-out infinite;
  }
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
  border-radius: 12px;
}

@keyframes shiningBar {
  0%,
  85% {
    transform: skewX(-35deg) translateX(-1000%);
  }

  100% {
    transform: skewX(-35deg) translateX(1200%);
  }
}

.ModulePlan {
  :deep(.ModulePlan-Card-Item) {
    .card-progress {
      .card-progress-text {
        position: absolute;

        top: 50%;
        left: 50%;

        text-wrap: nowrap;
        font-size: 14px;
        font-weight: 600;
        transform: translate(-50%, -50%);
        color: #212121;
      }

      .card-progress-inner {
        position: absolute;

        top: 0;
        left: 0;

        width: var(--p);
        height: 100%;

        background: #f5f5f550;
      }
      position: relative;

      width: 100%;
      height: 36px;

      backdrop-filter: blur(18px) saturate(180%);
      background-color: #eeeeee50;
    }

    .mobile & {
      width: 85vw;
      height: 60vw;
    }

    position: relative;
    margin: 0 auto;
    padding: 2rem;

    width: 500px;
    height: 350px;

    overflow: hidden;
    cursor: pointer;
    user-select: none;

    transform-style: preserve-3d;
    animation: activeShining 2.5s linear infinite;

    .card-bg {
      .logo {
        position: absolute;

        right: 0.5rem;
        top: 1rem;
      }
      position: absolute;

      top: 50%;
      left: 50%;

      width: 90%;
      height: 300px;

      transform: translate(-50%, -50%);
      .mobile & {
        height: 60vw;
      }
    }

    .card-footer {
      .el-link {
        color: #ccc;
        font-size: 18px;
        font-weight: 600;
      }
      position: absolute;

      bottom: 2rem;
      width: calc(100% - 2rem);

      overflow: hidden;
      border-radius: 8px;

      .mobile & {
        bottom: 15vw;
      }
    }

    .card-content {
      .title {
        color: #fff;
        font-size: 24px;
        font-weight: 600;
      }
      p.desc {
        color: #fff;
        font-size: 20px;
      }
      z-index: 1;
      position: absolute;
      padding: 1rem;

      top: 50%;
      left: 50%;

      width: 90%;
      height: 300px;

      transform: translate(-50%, -50%);

      .mobile & {
        height: 60vw;
      }
    }

    .card-img {
      &.bg {
        z-index: -1;
        position: absolute;

        top: 50%;
        left: 50%;

        width: 100%;
        height: 100%;

        filter: blur(10px);
        opacity: 0.5;

        transform: translate(-50%, -50%);
      }

      object-fit: cover;

      border-radius: 12px;
    }
  }

  width: 520px;
  height: 520px;

  .mobile & {
    width: 85vw;
    height: auto;
    min-height: 20vw;
  }
}

@keyframes activeShining {
  0%,
  100% {
    transform: scale(0.85) perspective(1000px) rotate3d(1, 1, 0.1, 4deg)
      translate(-2px, 2px);
  }

  20% {
    transform: scale(0.86) perspective(1000px) rotate3d(0.1, 1, 1, -1deg)
      translate(1px, -2px);
  }

  40% {
    transform: scale(0.87) perspective(1000px) rotate3d(0.1, 1, 0.1, -3deg)
      translate(3px, 1px);
  }

  50% {
    transform: scale(0.87) perspective(1000px) rotate3d(0.1, 1, 0.1, 3deg)
      translate(2px, -2px);
  }

  70% {
    transform: scale(0.87) perspective(1000px) rotate3d(0.1, 1, 0.1, -2deg)
      translate(-2px, -2px);
  }

  80% {
    transform: scale(0.84) perspective(1000px) rotate3d(1, 0.1, 1, -2deg)
      translate(-2px, 2px);
  }
}
</style>
