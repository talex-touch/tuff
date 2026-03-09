<script lang="ts" setup>
import { Vue3Lottie } from 'vue3-lottie'
import ModuleTour from './ModuleTour.vue'
import AiCircle from './animations/AiCircle.json'
import ChatMsg from './animations/ChatMsg.json'
import Files from './animations/Files.json'
import Brush from './animations/Brush.json'

const handleNext: any = inject('handleNext')
</script>

<template>
  <div class="Features">
    <!-- motion-blur -->
    <el-carousel>
      <el-carousel-item>
        <div class="FeatureAnimation">
          <div class="FeatureAnimation-Text">
            <h1>科塔智爱</h1>
            <p>全情境分析感知</p>
          </div>

          <Vue3Lottie :animation-data="AiCircle" />
        </div>
      </el-carousel-item>
      <el-carousel-item>
        <div class="FeatureAnimation">
          <div class="FeatureAnimation-Text">
            <h1>融合对话</h1>
            <p>尽全力为你做任何事</p>
          </div>

          <Vue3Lottie class="adapt-style" :animation-data="ChatMsg" />
        </div>
      </el-carousel-item>
      <el-carousel-item>
        <div class="FeatureAnimation">
          <div class="FeatureAnimation-Text">
            <h1>文件分析</h1>
            <p>快速分析 提取结构 重新创作 直接导出</p>
          </div>

          <Vue3Lottie :animation-data="Files" />
        </div>
      </el-carousel-item>
      <el-carousel-item>
        <div class="FeatureAnimation">
          <div class="FeatureAnimation-Text">
            <h1>妙灵生图</h1>
            <p>挥毫泼墨，心意随行</p>
          </div>

          <Vue3Lottie :animation-data="Brush" />
        </div>
      </el-carousel-item>
      <!-- <el-carousel-item v-for="item in 4" :key="item">
        <h3 class="small justify-center" text="2xl">
          {{ item }}123123
        </h3>
      </el-carousel-item> -->
    </el-carousel>

    <ButtonArrowButton
      @click="handleNext({
        component: ModuleTour,
        data: {},
      })"
    >
      下一步
    </ButtonArrowButton>
  </div>
</template>

<style lang="scss">
.FeatureAnimation {
  &-Text {
    h1 {
      margin: 0.5rem 0;

      font-weight: 600;
      font-size: 1.5rem;
    }
    p {
      font-size: 1.25rem;
      color: var(--el-text-color-secondary);
    }
    z-index: 100;
    position: relative;
    display: flex;

    align-items: center;
    flex-direction: column;
    justify-content: center;

    color: var(--el-text-color-primary);
  }
  position: relative;

  width: 100%;
  height: 100%;
}

.Features {
  .el-carousel,
  .el-carousel__container {
    .lottie-animation-container {
      height: 80%;
    }
    width: 100%;
    height: 100%;
  }

  position: absolute;
  padding: 2rem;
  display: flex;
  flex-direction: column;

  gap: 2rem;
  align-items: center;
  justify-content: space-between;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;
}
</style>
