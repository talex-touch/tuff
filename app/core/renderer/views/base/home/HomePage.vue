<template>
  <div class="Home-Container">
    <div absolute left-0 top-0 w-full h-full ref="vantaRef" class="Home-Background">

    </div>
    <div class="Home-Logo">
      <div class="Home-Logo-Bg">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300px"
          height="300px">
          <circle class="g-polygon-move" cx="150" cy="150" r="150" fill="none" />
        </svg>
      </div>

      <img src="@assets/logo.svg" alt="logo" />
    </div>
  </div>
</template>

<script name="HomePage" setup>
</script>

<style lang="scss" scoped>
.Home-Background {
  :deep(canvas) {
    width: 100%;
    height: 100%;

    background: transparent !important;
  }

  filter: blur(1px)
}

.Home-Logo {
  position: absolute;

  top: 50%;
  left: 50%;

  width: 150px;
  height: 150px;

  transform: translate(-50%, -50%);
  transition: all .25s ease-in-out;
  filter: drop-shadow(0 0 4px var(--el-color-primary));

  img {
    position: absolute;

    top: 0;

  }

  .Home-Logo-Bg {
    svg {
      overflow: visible;
    }

    .g-polygon-wrap,
    .g-polygon-move {
      fill: none;
      stroke: var(--el-color-primary);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }

    .g-polygon-move {
      transform-origin: center center;
      transform: scale(1.05);
      //stroke: linear-gradinet(180deg, red, transprent);
      stroke-width: 1.5;
      stroke-dasharray: 280, 700;
      stroke-dashoffset: 8;
      animation: move 2.4s infinite linear;
    }

    @keyframes move {
      0% {
        stroke-dashoffset: 8;
      }

      100% {
        stroke-dashoffset: -972;
      }
    }

    transform: scale(.5) translate(-50%, -50%);
  }
}

.Home-Container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;

  height: 100%;

  box-sizing: border-box;
}
</style>