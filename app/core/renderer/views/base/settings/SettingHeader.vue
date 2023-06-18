<script setup name="SettingHeader" lang="ts">
import { $t } from '@modules/lang'
const props = defineProps({
  env: {
    type: Object,
    required: true
  },
  dev: {
    type: Boolean,
    required: true
  }
})
</script>

<template>
  <div class="AboutApplication activate">
    <div class="About-Image">
      <div class="Home-Logo-Bg">
      </div>

      <img src="@assets/logo.svg" alt="logo" />
    </div>

    <div class="About-Content">
      <div class="Home-Text">
        <svg>
          <text x="0" y="20%"> Talex-Touch </text>
        </svg>
        <span class="version" v-if="env.packageJson" :class="{
          dev,
          'snapshot': env.packageJson.version.indexOf('SNAPSHOT') !== -1,
          'alpha': env.packageJson.version.indexOf('Alpha') !== -1,
        }">{{ env.packageJson.version }}</span>

        <p>{{ $t('app.description') }}</p>
      </div>

      <ul class="About-Footer" v-if="env.process">
        <li>
          <remix-icon name="npmjs" />
          <span>{{ env.process.versions?.node }}</span>
        </li>
        <li>
          <remix-icon name="chrome" />
          <span>{{ env.process.versions?.chrome }}</span>
        </li>
        <li>
          <remix-icon name="vuejs" />
          <span>{{ String(env.packageJson?.devDependencies?.vue).substring(1) }}</span>
        </li>
      </ul>
    </div>

  </div>
</template>

<style lang="scss">
.AboutApplication {
  .About-Content {
    .About-Footer {
      position: absolute;
      padding: 0;
      display: flex;

      left: -1%;

      width: 90%;
      bottom: 0;

      li {
        :deep(.remix) {
          position: relative;
          margin-left: -5px;
          margin-right: 5px;
          padding: 2px;
          top: .15em;

          border-radius: 50%;
          background-color: var(--el-fill-color-darker);
        }

        position: relative;
        //margin-right: 5px;
        padding: 4px 12px;

        border-radius: 8px;
        list-style: none;

        opacity: .85;
        transform: scale(.85);
        background-color: var(--el-fill-color-light);
      }
    }

    position: absolute;

    left: 5%;
    top: 15%;

    width: 70%;
    height: 70%;

    .Home-Text {
      p {
        opacity: .75;
        color: var(--el-fill-color-light)
      }

      & .version {
        &.alpha {
          background-color: var(--el-color-info-light-5);
        }

        &.snapshot {
          background-color: var(--el-color-warning-light-5);
        }

        &.dev {
          background-color: var(--el-color-error-light-5);
        }

        position: absolute;
        margin: 6px 0;
        padding: 2px 8px;

        left: 42%;
        height: 30px;
        line-height: 26px;

        font-size: 14px;
        border-radius: 4px;
        box-sizing: border-box;
        opacity: .85;
        transform: scale(.8);
        background-color: var(--el-color-primary-light-5);
      }

      p {
        position: absolute;
        margin: 0;

        top: 40px;
      }

      svg text {
        //display: flex;
        //align-items: center;

        text-transform: uppercase;
        animation: stroke 2.5s alternate forwards;
        letter-spacing: 5px;
        font-size: 22px;
      }

      @keyframes stroke {
        0% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-dashoffset: 25%;
          stroke-dasharray: 0 50%;
          stroke-width: 0.2;
        }

        50% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-width: 0.5;
        }

        70% {
          fill: rgba(72, 138, 20, 0);
          stroke: rgba(54, 95, 160, 1);
          stroke-width: 1;
        }

        90%,
        100% {
          fill: var(--el-fill-color-light);
          stroke: rgba(54, 95, 160, 0);
          stroke-dashoffset: -25%;
          stroke-dasharray: 50% 0;
          stroke-width: 0;
        }
      }

    }

  }

  .About-Image {

    &:before,
    &:after {
      content: "";
      position: absolute;

      left: 50%;
      top: 50%;

      width: 100%;
      height: 100%;

      border-radius: 50%;
      transform: translate(-50%, -50%);
      border: 1px solid var(--el-fill-color-light);

      animation: breathing 1s linear infinite;
    }

    &:after {
      width: 125%;
      height: 125%;

      animation-delay: .5s;
    }

    position: absolute;
    display: flex;

    align-items: center;

    top: 20%;
    right: 5%;

    height: 60%;
    aspect-ratio: 1 / 1;

    img {
      position: absolute;

      top: 0;
      right: 0;

      height: 100%;

      //transform: scale(.85)
    }
  }

  &.activate {
    &:before {
      opacity: 0;
    }

    opacity: .75;
    background-image: linear-gradient(to right, var(--el-color-primary-light-3) 0%, var(--el-color-primary-dark-2) 50%, var(--el-color-primary-light-3) 100%);
  }

  &:before {
    content: "未激活";
    position: absolute;
    display: flex;

    align-items: center;
    justify-content: center;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    opacity: .5;
    font-size: 20px;
    font-weight: 600;
    border-radius: 4px;
    background-color: var(--el-fill-color-darker);
  }

  position: relative;
  margin-bottom: 15px;

  width: 100%;
  min-height: 180px;
  height: 30%;

  clear: both;
  opacity: .45;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
  background-image: linear-gradient(to right, var(--el-color-primary-light-3) 0%, var(--el-color-info-dark-2) 50%, var(--el-color-primary-light-3) 100%);
  background-size: 200% 100%;
  // filter: drop-shadow(0 0 4px var(--el-color-primary-light-7));

  animation: waving 10s infinite linear;
}

@keyframes breathing {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0);
  }

  30%,
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    opacity: .8;
    transform: translate(-50%, -50%) scale(.8);
  }

  100% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.5);
  }
}

@keyframes waving {
  from {
    background-position: 0;
  }

  to {
    background-position: 200%;
  }
}
</style>