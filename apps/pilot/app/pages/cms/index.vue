<script setup lang="ts">
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'
import monitor from './system/monitor.vue'

definePageMeta({
  name: '管理中心',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

const greeting = computed(() => {
  // 根据当前时间决定问候语
  const time = new Date()

  const hour = time.getHours()
  if (hour < 12)
    return '早上好'
  else if (hour < 18)
    return '下午好'
  else
    return '晚上好'
})

// nuxt3 fetch https://api.vvhan.com/api/dailyEnglish get data

const { data: oneSay } = await useAsyncData<any>('dailyEnglish', () => $fetch('https://api.vvhan.com/api/dailyEnglish', {
  method: 'get',
  headers: {
    'Content-Type': 'application/json',
  },
}))

const { data: books } = await useAsyncData<any>('books', () => $fetch('https://api.vvhan.com/api/hotlist/woShiPm'))

const { data: visitorInfo } = await useAsyncData<any>('visitorInfo', () => $fetch('https://api.vvhan.com/api/visitor.info'))
</script>

<template>
  <div class="CmsWrapper">
    <el-scrollbar>
      <div class="Cms">
        <div class="Cms-Addon">
          <el-card class="cms-card">
            <div class="CmsApplication-Header cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:user" />
                {{ greeting }}, {{ userStore.nickname }}!
              </div>
            </div>
            <p mt-4>
              {{ visitorInfo.location }}:{{ visitorInfo.tip }}
            </p>
          </el-card>
          <el-card class="Cms-Application cms-card">
            <lazy-cms-application />
          </el-card>

          <el-card class="cms-card">
            <div class="cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:recommend" />
                推荐阅读 (产品经理)
              </div>
              <div v-if="false" class="cms-end">
                <el-link type="primary">
                  刷新
                </el-link>
              </div>
            </div>

            <ul class="Books">
              <li v-for="book in books.data" :key="book.index">
                <a :href="book.url" target="_blank" class="name">{{ book.title }}</a>
                <span class="time">{{ book.hot }}</span>
              </li>
            </ul>
          </el-card>
        </div>

        <div class="Cms-Content">
          <el-card class="cms-card">
            <div class="cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:notification" />
                系统公告
              </div>
              请注意保护系统隐私,请勿在公共场合打开管理系统.
              <div class="cms-end">
                <el-link type="primary">
                  更多公告
                </el-link>
              </div>
            </div>
          </el-card>
          <el-card class="cms-card">
            <div class="cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:application-web" />
                系统监控
              </div>

              <div class="cms-end">
                <el-link type="primary">
                  查看更多
                </el-link>
              </div>
            </div>

            <monitor />
          </el-card>
        </div>

        <div class="Cms-User">
          <LazyCmsUser />

          <el-card class="cms-card">
            <el-config-provider :locale="zhCn">
              <el-calendar>
                <template #date-cell="{ data }">
                  <p :class="data.isSelected ? 'is-selected' : ''">
                    {{ data.day.split('-').slice(2).join('') }}
                    {{ data.isSelected ? '✔️' : '' }}
                  </p>
                </template>
                <template #header="{ date }">
                  <span>工作日历</span>
                  <span>{{ date }}</span>
                </template>
              </el-calendar>
            </el-config-provider>
          </el-card>

          <el-card class="cms-card">
            <ChorePersonalFortuneCard />
          </el-card>

          <el-card v-if="oneSay" class="cms-card">
            <div class="cms-header">
              <div class="cms-start">
                <IconMimicIcon color="var(--el-color-primary);color: #fff" icon="i-carbon:ica-2d" />
                今日精彩
              </div>
            </div>

            <div class="OneSay-Main">
              <img :src="oneSay.data.pic">

              <div class="OneSay-Text">
                <p :title="oneSay.data.en">
                  {{ oneSay.data.en }}
                </p>
                <p :title="oneSay.data.zh">
                  {{ oneSay.data.zh }}
                </p>
              </div>
            </div>
          </el-card>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
.CmsWrapper {
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: calc(100% - 72px);
}

ul.Books {
  li {
    a {
      &:hover {
        color: var(--theme-color);
      }
      max-width: 80%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .time {
      color: var(--el-text-color-placeholder);
    }

    display: flex;
    justify-content: space-between;
    align-items: center;

    padding: 0.25rem 0.5rem;

    display: flex;
  }

  margin: 0.5rem -1rem -0.5rem;
}

.OneSay-Main {
  .OneSay-Text {
    z-index: 1;
    position: absolute;
    padding: 0.25rem 0.5rem;

    bottom: 0;
    width: 100%;

    overflow: hidden;
    background-image: linear-gradient(
      to bottom,
      transparent,
      rgba(0, 0, 0, 0.75) 80%
    );
  }

  position: relative;
  margin-top: 1rem;

  overflow: hidden;
  border-radius: 16px;
}

.Cms-Application {
  height: 40%;
}

.cms-card {
  .cms-header {
    .cms-start {
      display: flex;

      gap: 0.5rem;
      opacity: 0.75;
      align-items: center;
    }

    display: flex;

    font-size: 14px;
    justify-content: space-between;
  }

  margin: 1rem 0;

  flex-shrink: 0;

  overflow: hidden;
  border-radius: 16px;
  background-color: var(--el-fill-color);
}

.Cms-Addon {
  height: 100%;
  min-width: 200px;
  width: 35%;
  max-width: 480px;
}

.Cms-Content {
  width: 100%;
  height: 100%;

  border-radius: 16px;
}

.Cms-User {
  min-width: 200px;
  width: 30%;
  max-width: 480px;
}

.Cms {
  position: relative;
  padding: 1rem;
  display: flex;

  width: 100%;
  min-height: 100%;

  gap: 1rem;

  justify-content: space-between;
}
</style>
