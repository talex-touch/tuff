<script setup lang="ts">
const props = defineProps<{
  data: any
}>()

// 从a-b区间映射到c-d分区间
function getFortuneScore(value: number) {
  return Math.round(mapperRange([12, 29], [0, 100], value))
}

const fortuneScore = computed(() => getFortuneScore(props.data?.content.score || 0))
</script>

<template>
  <div flex-col style="align-items: flex-start" class="TouchDialog-Title">
    <div flex items-center gap-2>
      <div i-carbon:transform-instructions />每日运势
    </div>
    <p style="font-size: 16px" op-50>
      每日运势仅供参考，没有实际含义。
    </p>
  </div>
  <div class="ModuleFortune Fortune TouchDialog-Content">
    <div v-if="data" class="Fortune-Main">
      <div class="Fortune-Display">
        <p class="title">
          § {{ data.main }} §
          <span class="score">({{ fortuneScore }}分)</span>
        </p>

        <div class="Fortune-Content">
          <div
            v-for="(item, index) in data.content.list" :key="index" :class="{ good: item.fortune === '吉' }"
            class="Fortune-Item"
          >
            <p class="main">
              <span v-if="item.score">
                {{ item.fortune }}
              </span>
              <span v-else>
                {{ item.score >= 5 ? '宜' : '忌' }}
              </span>
              ：{{ item.topic }}
            </p>
            <p flex class="desc">
              {{ item.desc }}
              <el-tooltip :teleported="false" :content="`${item.tip}`">
                <i i-carbon:information block cursor-pointer />
              </el-tooltip>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Fortune-Item {
  .main {
    &.good {
      color: var(--el-color-danger);
    }
  }

  .desc {
    gap: 0.25rem;
    align-items: center;

    opacity: 0.75;
    font-size: 12px;
  }

  margin: 0.25rem;
}

.Fortune {
  &-Display {
    .title {
      .score {
        font-size: 1rem;
        font-weight: 600;

        color: var(--el-text-color-regular);
      }
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--el-color-danger);
    }
  }

  &-Content {
    display: grid;

    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  &-Main {
    position: relative;
    display: flex;

    flex-direction: column;

    gap: 1rem;
    width: 100%;
    height: calc(100% - 27px);
    // align-items: center;
    justify-content: space-between;
  }

  position: relative;
  display: flex;

  flex-direction: column;

  width: max-content;
  min-height: 70px;

  border-radius: 12px;
  // box-shadow: var(--el-box-shadow);
  // background-color: var(--el-bg-color);
}
</style>
