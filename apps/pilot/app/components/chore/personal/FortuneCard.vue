<script setup lang="ts">
import { $endApi } from '../../../composables/api/base'

const data = ref()

onMounted(async () => {
  const res = await $endApi.v1.account.dailyFortune()

  if (res.code !== 200)
    return

  data.value = res.data

  if (data.value.content)
    data.value.content = JSON.parse(decodeText(data.value.content) || '[]')
})
</script>

<template>
  <div class="Fortune">
    <p>每日运势</p>

    <div v-if="data" class="Fortune-Main">
      <p>每日运势仅供参考，没有实际含义。</p>

      <div class="Fortune-Display">
        <p class="title">
          § {{ data.main }} §
        </p>

        <div class="Fortune-Content">
          <div v-for="(item, index) in data.content" :key="index" :class="{ good: item.fortune === '吉' }" class="Fortune-Item">
            <p class="main">
              {{ item.fortune === '吉' ? '宜' : '忌' }}：{{ item.topic }}
            </p>
            <p flex class="desc">
              {{ item.desc }}
              <el-tooltip :content="item.tip">
                <i i-carbon:information block />
              </el-tooltip>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
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
  & > p {
    position: relative;

    font-size: 18px;
    font-weight: 600;
  }
  position: relative;
  margin: 0.5rem 0;
  display: flex;
  padding: 1rem;

  flex-direction: column;

  width: max-content;
  min-height: 70px;

  border-radius: 12px;
  // box-shadow: var(--el-box-shadow);
  // background-color: var(--el-bg-color);
}
</style>
