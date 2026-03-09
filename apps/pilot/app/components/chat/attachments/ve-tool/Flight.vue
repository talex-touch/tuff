<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  data: any
  value: any
}>()

function calcMin(num: number) {
  if (num < 3600)
    return `${num / 60}分`

  else return `${Math.floor(num / 3600)}时${Math.floor((num / 60) % 60)}分`
}

function formatStatus(status: string) {
  if (status === '到达')
    return '--c: #1ED76D50'
  else if (status === '计划')
    return '--c: #1E4EBAE0'
  return '--c: #DD1923'
}

const airlines: Record<string, string> = {
  'CA': '中国国际航空公司',
  'MU': '中国东方航空公司',
  'CZ': '中国南方航空公司',
  'HU': '海南航空公司',
  '3U': '四川航空公司',
}
</script>

<template>
  <div class="Flight">
    <el-scrollbar>
      <div class="Flight-Inner">
        <div v-for="(flight, index) in value.list" :key="index" v-wave class="Flight-Item">
          <span class="badge">
            {{ formatDate(flight.departurePlanTimestamp * 1000, 'YYYY/MM/DD') }}
          </span>

          <div class="Flight-Start">
            <p class="time">
              {{ formatDate((flight.departureActualTimestamp || flight.departurePlanTimestamp) * 1000, 'HH:mm') }}
            </p>
            <p class="name">
              <template v-if="flight.departureCn">
                {{ flight.departureCn }}{{ flight.departureTerminal }}
              </template>
              <template v-else>
                未知地点
              </template>
            </p>
          </div>
          <div class="Flight-Info">
            <p class="cost-time">
              {{ calcMin((flight.arrivalActualTimestamp || flight.arrivalPlanTimestamp) - (flight.departureActualTimestamp || flight.departurePlanTimestamp)) }}
            </p>
            <div class="flight-indicator" />
            <p class="info">
              {{ flight.flightNumber }} - {{ formatNumber(flight.distance) }}KM
            </p>
          </div>
          <div class="Flight-Start">
            <p class="time">
              {{ formatDate((flight.arrivalActualTimestamp || flight.arrivalPlanTimestamp) * 1000, 'HH:mm') }}
            </p>
            <p class="name">
              <template v-if="flight.arrivalCn">
                {{ flight.arrivalCn }}{{ flight.arrivalTerminal }}
              </template>
              <template v-else>
                未知地点
              </template>
            </p>
          </div>

          <div class="Flight-Extra">
            <p flex gap-2>
              <span class="business">
                <template v-if="airlines[flight.airlinesName]">
                  {{ airlines[flight.airlinesName] }}
                </template>
                <template v-else>
                  {{ flight.airlinesName }}
                </template>
              </span>
              <span v-if="flight.airModels" class="model">
                {{ flight.airModels }}
              </span>
            </p>

            <span :style="formatStatus(flight.flightStatus)" class="status">
              {{ flight.flightStatus }}
            </span>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <!-- <div class="Weather-Inner" /> -->
  </div>
</template>

<style lang="scss" scoped>
.Flight-Item {
  .Flight-Extra {
    position: absolute;
    display: flex;

    bottom: 1rem;

    width: 90%;

    gap: 1rem;
    align-items: center;
    justify-content: space-between;

    opacity: 0.75;
    font-size: 12px;
  }

  .badge {
    position: absolute;
    padding: 0.25rem 0.5rem;

    top: 0;
    left: 0;

    font-size: 16px;

    opacity: 0.75;
    transform: scale(0.5) translate(-50%, -50%);
    border-radius: 8px 0 8px 0;
    background-color: var(--el-border-color);
  }
  .status {
    &::first-letter {
      letter-spacing: 0.125rem;
    }
    position: relative;
    padding: 0.25rem 0.5rem;

    font-size: 12px;
    font-weight: 600;

    transform: scale(0.8);
    border-radius: 8px;
    background-color: var(--c, #0000);
    border: 1px solid var(--el-border-color);

    filter: brightness(150%);
  }

  .Flight-Info {
    .flight-indicator {
      &::after {
        content: '';
        position: absolute;

        width: 0;
        height: 0;

        right: 0;
        bottom: 2px;

        border-left: 5px solid var(--el-border-color);
        border-bottom: 5px solid #0000;

        transform: rotate(-90deg);
      }
      position: absolute;

      top: 50%;
      left: 0;

      width: 100%;
      height: 2px;

      transform: translateY(-50%);
      background-color: var(--el-border-color);
    }

    p.cost-time,
    p.info {
      opacity: 0.75;
      font-size: 12px;
    }
    position: relative;
    display: flex;

    flex: 1;

    gap: 0.5rem;
    align-items: center;
    flex-direction: column;
    justify-content: center;

    width: 200px;
    height: 100%;

    font-size: 14px;
  }
  p.time {
    font-size: 20px;
    font-weight: 600;

    color: var(--theme-color);

    filter: brightness(200%);
  }
  p.name {
    opacity: 0.85;
    font-size: 14px;
  }

  &:hover {
    background-color: var(--el-fill-color-light);
  }
  position: relative;
  display: flex;
  padding: 1rem 1.25rem;
  padding-bottom: 3rem;
  margin: 0.5rem 0;

  gap: 1rem;
  align-items: center;

  cursor: pointer;
  border-radius: 16px;
  background-color: var(--el-fill-color);
}

.Flight {
  &-Inner {
    position: relative;
    padding-right: 1rem;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;
  }

  :deep(.el-scrollbar__bar.is-vertical) {
    width: 3px;
  }

  position: relative;

  width: 100%;
  height: 20rem;

  overflow: hidden;
  border-radius: 8px;
}
</style>
