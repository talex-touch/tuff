<script setup name="IntelligenceHeader" lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { useIntelligenceManager } from '~/modules/hooks/useIntelligenceManager'

const { t } = useI18n()
const { providers, capabilities } = useIntelligenceManager()

const providerCount = computed(() => (providers.value ? providers.value.length : 0))
const capabilityCount = computed(() => Object.keys(capabilities.value || {}).length)
const totalChannels = computed(() => providerCount.value)
</script>

<template>
  <div class="intelligence-header activate">
    <div class="header-image"></div>

    <div class="header-content">
      <div class="header-text">
        <div>
          <svg>

            <text x="0" y="20%">Intelligence<tuff-beta-tag /></text>
          </svg>
        </div>
        <p>{{ t('settings.aisdk.pageDesc') }}</p>
      </div>

      <ul class="header-stats">
        <li class="fake-background" flex items-center gap-2>
          <div inline-block class="i-carbon-api-1" />
          <span>{{ t('settings.aisdk.providerStat', { count: providerCount }) }}</span>
        </li>
        <li class="fake-background" flex items-center gap-2>
          <div inline-block class="i-carbon-flow" />
          <span>{{ t('settings.aisdk.capabilityStat', { count: capabilityCount }) }}</span>
        </li>
        <li class="fake-background" flex items-center gap-2>
          <div inline-block class="i-carbon-network-4" />
          <span>{{ totalChannels }} 个渠道</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.intelligence-header {
  .header-content {
    position: absolute;
    left: 5%;
    top: 15%;
    width: 70%;
    height: 70%;

    .header-stats {
      position: absolute;
      padding: 0;
      display: flex;
      left: -1%;
      width: 90%;
      bottom: 0;

      li {
        position: relative;
        padding: 4px 12px;
        border-radius: 8px;
        list-style: none;
        --fake-inner-opacity: 0.75;
        overflow: hidden;
        transform: scale(0.85);
        backdrop-filter: blur(18px);
        margin-right: 8px;
      }
    }

    .header-text {
      p {
        opacity: 0.75;
        color: var(--el-fill-color-light);
        position: absolute;
        margin: 0;
        top: 40px;
      }

      svg text {
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

  .header-image {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;

    inset: 0;
    overflow: hidden;
    border-radius: 12px;
    backdrop-filter: blur(18px) saturate(180%);

    &:after {
      content: '';
      position: absolute;
      inset: 0;

      filter: blur(50px);
      transform: scale(1.05);

      // opacity: 0.75;
      background-image: linear-gradient(
        to right,
        #1c15d0,
        hsl(27deg 93% 60%),
        #6500ff,
        #ff0056,
        #1c15d0
      );
      background-size: 200% 100%;
      animation: waving 5s infinite linear;
    }
  }

  position: relative;
  margin: 0.5rem 0;
  width: 100%;
  height: 180px;
  clear: both;
  border-radius: 12px;
  border: 1px solid var(--el-border-color);
}

@keyframes header-breathing {
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
    opacity: 0.8;
    transform: translate(-50%, -50%) scale(0.8);
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
