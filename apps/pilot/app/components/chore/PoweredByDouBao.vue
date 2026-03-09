<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
}>()
</script>

<template>
  <div>
    <a href="/" class="brutalist-button doubao">
      <div class="doubao-logo">
        <img class="doubao-icon" src="/doubao.png" alt="DouBao">
        <span class="doubao-text">豆包</span>
      </div>
      <div class="button-text">
        <span>Powered by</span>
        <span>DouBao</span>
      </div>
    </a>
  </div>
</template>

<style lang="scss">
.brutalist-button.doubao {
  display: flex;
  align-items: center;
  width: 240px;
  height: 70px;
  background-color: var(--el-color-primary-light-9);
  color: #dadada;
  text-decoration: none;
  font-weight: bold;
  padding: 0 12px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  transition: all 0.3s ease;

  border-radius: 16px;
  border: 3px solid #000000;
  transform: translate(2px, 2px);
  box-shadow: 3px 3px 0 var(--el-fill-color-lighter);
}

.brutalist-button.doubao::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    120deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: all 0.6s ease;

  animation: waving_forward 2s ease infinite;
}

@keyframes waving_forward {
  50%,
  100% {
    left: 100%;
  }
}

@keyframes spin-and-zoom {
  0% {
    transform: rotate(0deg) scale(1.1);
  }

  100% {
    transform: rotate(360deg) scale(1.1);
  }
}

.doubao-logo {
  display: flex;
  align-items: center;
  margin-right: 16px;
}

.doubao-icon {
  width: 28px;
  height: 28px;
  margin-right: 10px;
  margin-bottom: 2px;
  fill: #000;
  transition: all 0.3s ease;

  animation: spin-and-zoom 1s linear infinite;
}

.doubao-text {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #dadada;
  transition: all 0.3s ease;
}

.button-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.button-text span:first-child {
  font-size: 9px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.button-text span:last-child {
  font-size: 16px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: color 0.3s ease;

  color: #2eae7f;
}
</style>
