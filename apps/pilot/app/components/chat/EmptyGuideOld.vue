<script setup lang="ts">
defineProps<{
  show: boolean
}>()

// 1.全景墙纸 何止是身临其境
// 2.万象卡片 万象再万象，就是亿象
// 3.无极缩放 称心称手，万事顺意
// 4.无限创作 就是无极限
// 5.百变角色 狠角色，很绝色

// 7.涟漪搜索 几度涟漪，几多信息
// 8.神仙指算 今照有指今朝算
// 9.一休夫子 会教的才叫夫子

// 6.妙灵生图 挥毫泼墨，心意随行
// 10.如流设计 弥散流动 生态设计

const features = reactive([
  {
    title: '全景墙纸',
    desc: '何止是身临其境',
    style: '--c1: rgb(65, 88, 188); --c2: rgb(200, 80, 172); --c3: rgb(235, 204, 112)',
  },
  {
    title: '万象卡片',
    desc: '万象再万象，就是亿象',
    style: 'background: radial-gradient(circle at 100% 107%, #ff89cc 0%, #9cb8ec 30%, #00ffee80 60%, #62c2feE0 100%);',
  },
  {
    title: '无极缩放',
    desc: '称心称手，万事顺意',
    style: 'background: linear-gradient(-45deg, #f89b29 0%, #ff0f7b 100% );',
  },
  {
    title: '无限创作',
    desc: '就是无极限',
    style: `background-color: #4158D0;
  background-image: linear-gradient(43deg, #4158D0 0%, #C850C0 46%, #FFCC70 100%);`,
  },
  {
    title: '百变角色',
    desc: '狠角色，很绝色',
    style: `background-color: var(--el-fill-color);
  background-image: radial-gradient(
      at 88% 40%,
      var(--el-fill-color) 0px,
      transparent 85%
    ),
    radial-gradient(at 49% 30%, var(--theme-color) 0px, transparent 85%),
    radial-gradient(at 14% 26%, var(--el-fill-color) 0px, transparent 85%),
    radial-gradient(at 0% 64%, hsla(263, 93%, 56%, 1) 0px, transparent 85%),
    radial-gradient(at 41% 94%, hsla(284, 100%, 84%, 1) 0px, transparent 85%),
    radial-gradient(at 100% 99%, hsla(306, 100%, 57%, 1) 0px, transparent 85%);`,
  },
  {
    title: '妙灵生图',
    desc: '挥毫泼墨，心意随行',
    style: 'background: radial-gradient(#f588d8, #c0a3e5)',
  },
  {
    title: '涟漪搜索',
    desc: '几度涟漪，几多信息',
    style: 'background-image: linear-gradient(15deg, #13547a80 0%, #80d0c780 100%);',
  },
  {
    title: '神仙指算',
    desc: '今照有指今朝算',
    style: 'background: linear-gradient(10deg, #FF6B30 0%, #D220B9 100%);',
  },
  {
    title: '一休夫子',
    desc: '会教的才叫夫子',
    style: 'background: linear-gradient(to right, rgb(34, 197, 94), rgb(132, 204, 22))',
  },
  {
    title: '如流设计',
    desc: '弥散流动 生态设计',
    style: 'background: linear-gradient(40deg, rgba(131,58,180,1) 0%, rgba(253,29,29,1) 50%, rgba(252,176,69,1) 100%);',
  },
])

const tips = reactive([
  {
    icon: 'i-carbon-image',
    color: '#339C42',
    title: '创建图片',
  },
  {
    icon: 'i-carbon:ai-results-low',
    color: '#E2C541',
    title: '制定计划',
  },
  {
    icon: 'i-carbon-document',
    color: '#EA8444',
    title: '总结文本',
  },
  {
    icon: 'i-carbon:unknown',
    color: '#76D0EB',
    title: '询问问题',
  },
  {
    icon: 'i-carbon-code',
    color: '#595DC7',
    title: '攥写代码',
  },
  {
    icon: 'i-carbon-edit',
    color: '#A070A4',
    title: '帮写文本',
  },
])
</script>

<template>
  <div :class="{ show }" class="EmptyGuide">
    <h1 class="EmptyGuide-Brand" text-16 font-bold>
      This!&nbsp;<span class="ai-underline">AI</span>.
    </h1>

    <h1 v-if="!show" class="EmptyGuide-Greet only-pc-display">
      <OtherTextShading
        animation="animation: cubic-bezier(0.6, -0.28, 0.735, 0.045) 0.5s erasing forwards"
        text="尽力为你做任何事."
      />
    </h1>

    <div class="EmptyGuide-Tips only-pc-display transition-cubic">
      <span
        v-for="(tip, index) in tips" :key="index" v-wave class="TipItem"
        :style="`--d: ${index * 0.1 + 1}s;--c: ${tip.color}`"
      >
        <span class="icon" block :class="tip.icon" /><span v-text="tip.title" />
      </span>
    </div>

    <div v-if="false" class="EmptyGuide-Section">
      <div class="EmptyGuide-Banner fake-background">
        <div class="banner-outer" />
        <el-carousel motion-blur>
          <el-carousel-item v-for="item in 4" :key="item">
            <h3 class="small justify-center" text="2xl">
              {{ item }}
            </h3>
          </el-carousel-item>
        </el-carousel>
      </div>
      <div class="EmptyGuide-News fake-background">
        <p v-for="i in 5" :key="i">
          {{ i }}.科塔锐行正式官宣——ThisAI国庆上线
        </p>
      </div>
    </div>

    <div v-if="false" class="EmptyGuide-Feature">
      <div class="EmptyGuide-FeatureInner">
        <div
          v-for="feature in [...features, ...features]" :key="feature.title" :style="feature.style"
          class="EmptyGuide-FeatureItem"
        >
          <p class="title">
            {{ feature.title }}
          </p>
          <p class="desc">
            {{ feature.desc }}
          </p>
        </div>
      </div>
    </div>

    <p v-if="false" relative top-16>
      在你喜欢之中，万里挑一
    </p>
  </div>
</template>

<style lang="scss">
.EmptyGuide-Brand {
  opacity: 0;
}

.mobile .EmptyGuide-Brand,
.show .EmptyGuide-Brand {
  opacity: 1;
}

.EmptyGuide-Tips {
  .show & {
    opacity: 0;

    transition: unset;
  }
  display: flex;

  gap: 0.5rem;

  .TipItem {
    padding: 0.5rem 0.75rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;

    cursor: pointer;
    font-size: 14px;
    border-radius: 12px;
    color: var(--el-text-color-secondary);
    border: 1px solid var(--el-border-color-lighter);
    animation: fade-join 0.25s var(--d) ease-in-out forwards;

    opacity: 0;
    transform: translateY(10px);

    .icon {
      color: var(--c);
    }
  }

  justify-content: center;

  transition: 0.5s 0.75s;
  transform: translateY(calc(50px));
}

@keyframes fade-join {
  to {
    opacity: 1;
    transform: translateY(0px);
  }
}

.EmptyGuide-Greet {
  font-size: 3rem;
  font-weight: 600;

  transform: translateY(-50%);
}

.EmptyGuide-Input {
  height: 50px;
}

@keyframes transforming {
  from {
    transform: translate(0);
  }

  to {
    transform: translate(-50%);
  }
}

.EmptyGuide-Feature {
  .EmptyGuide-FeatureItem {
    p.title {
      color: #fff;
      font-weight: 600;
    }
    p.desc {
      color: #eee;
      opacity: 0.85;
      font-size: 14px;
    }
    &::after {
      content: '';
      position: absolute;

      top: 0.125rem;
      right: 1rem;

      width: 64px;
      height: 64px;

      opacity: 0.75;
      filter: blur(15px) brightness(100%);
      background-image: radial-gradient(
        circle at center,
        var(--c, var(--theme-color)) 0%,
        #0000 50%,
        #0000 50%,
        #0000 100%
      );
    }
    position: relative;
    padding: 0.5rem 1rem;

    width: 180px;

    text-align: left;
    border-radius: 12px;
    background: linear-gradient(
      43deg,
      var(--c1) 0%,
      var(--c2) 46%,
      var(--c3) 100%
    );
    backdrop-filter: blur(18px) saturate(180%);
    // background-color: var(--el-fill-color);
  }

  .EmptyGuide-FeatureInner {
    display: flex;

    gap: 0.5rem;
    width: max-content;

    animation: transforming 30s infinite linear;
  }
  // &::before {
  //   z-index: 1;
  //   content: '';
  //   position: absolute;

  //   top: 0;
  //   left: 0;

  //   width: 10px;
  //   height: 100%;

  //   background-image: linear-gradient(to right, var(--theme-color), #0000);
  // }
  position: relative;
  padding: 0.25rem 0;

  left: 50%;
  width: 100%;

  overflow: hidden;
  border-radius: 18px;
  transform: translate(-50%);
  backdrop-filter: blur(18px) saturate(180%);
}

.EmptyGuide-Section {
  .EmptyGuide-Banner {
    .banner-outer {
      margin-bottom: calc(var(--vh, 1vh) * -20);
      padding-top: calc(var(--vh, 1vh) * 20);
    }
    .el-carousel__item {
      background-color: var(--el-fill-color);
    }
    position: relative;
    // padding: 1rem;

    max-width: 70%;

    flex: 1;
    overflow: hidden;
    border-radius: 18px;
    backdrop-filter: blur(18px) saturate(180%);
  }

  .EmptyGuide-News {
    p {
      // margin: 0.5rem 0;
      font-size: 18px;

      max-width: 100%;

      cursor: pointer;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    position: relative;
    display: flex;
    padding: 1rem;

    flex-direction: column;
    justify-content: space-around;
    max-width: 30%;

    flex: 1;
    overflow: hidden;
    border-radius: 18px;
    backdrop-filter: blur(18px) saturate(180%);
  }

  &-Item {
    p {
      font-size: 22px;

      font-weight: bold;
    }
    &:hover {
      cursor: pointer;

      transform: scale(1.0125);
    }

    &::before {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.5;
      border-radius: 16px;
      background-color: var(--el-bg-color);
    }
    position: relative;
    padding: 0.75rem;

    min-width: 350px;
    max-width: 380px;

    text-align: left;
    transition: 0.25s;
    border-radius: 16px;
  }
  display: flex;
  margin: 1rem 0;

  gap: 2rem;
  width: 100%;
}

@media (max-width: 1440px) {
  .EmptyGuide-Section-Item span {
    display: none;
  }

  .EmptyGuide-Section-Item {
    min-width: unset;
  }

  .EmptyGuide-Section {
    flex-wrap: wrap;
  }
}

.EmptyGuide {
  &.show {
    h1 {
      opacity: 0.025;
      filter: grayscale(100%);
    }
    top: 50%;

    transform: translate(-50%, 0%);
    .EmptyGuide-Section,
    .EmptyGuide-Feature,
    p {
      opacity: 0;
    }

    pointer-events: none;
  }

  h1 {
    .ai-underline {
      &::before {
        content: '';
        position: absolute;

        bottom: 8px;

        width: 100%;
        height: 5px;

        border-radius: 16px;
        background-color: var(--theme-color);
      }
      position: relative;

      top: -5px;
      font-size: 3.75rem;
    }

    .mobile & {
      .ai-underline {
        &::before {
          height: 3px;
          bottom: 5px;
        }

        top: 0;

        font-size: 40px;
      }
      font-size: 40px;
    }

    transition: 0.25s;
  }
  z-index: 1;
  position: absolute;
  padding: 0.5rem;

  top: 50%;
  left: 50%;

  width: 70%;
  max-width: 1280px;

  text-align: center;
  transition: 0.25s;
  border-radius: 16px;
  transform: translate(-50%, -50%);
}
</style>
