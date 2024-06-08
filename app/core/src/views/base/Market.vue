<template>
  <div class="Market-Container cubic-transition">
    <div class="Market-Header">
      <div class="Market-Header-Search">
        <FlatCompletion :fetch="fetch" />
        <FlatButton mini> <div class="i-carbon-list" /> </FlatButton>
      </div>
      <div class="Market-Header-Labels">
        <div class="Market-Header-Labels-Inner">
          <span
            @click="tagInd = index"
            :class="{ active: tagInd === index }"
            v-for="(item, index) in tags"
          >
            {{ item.tag }}</span
          >
        </div>
        <div class="Market-Header-Labels-Order">
          <TLabelSelect v-model="orderType">
            <TLabelSelectItem value="list" icon="i-carbon-list-boxes" />
            <TLabelSelectItem value="flow" icon="i-carbon-table-split" />
          </TLabelSelect>
        </div>
      </div>
    </div>

    <transition-group
      :css="false"
      class="Market-List"
      tag="ul"
      @before-enter="onBeforeEnterList"
      @enter="onEnterList"
      @leave="onLeaveList"
    >
      <MarketItem :data-index="index" :item="item" v-for="(item, index) in value" />
    </transition-group>
  </div>
</template>

<script name="Market" setup>
import gsap from "gsap";
import FlatCompletion from "@comp/base/input/FlatCompletion.vue";
import MarketItem from "@comp/market/MarketItem.vue";

const orderType = ref("flow");
const tagInd = ref(0);
const tags = reactive([
  {
    tag: "All",
    filter: "",
  },
  {
    tag: "Feature",
    filter: "feature",
  },
  {
    tag: "UI",
    filter: "ui",
  },
  {
    tag: "UX",
    filter: "ux",
  },
  {
    tag: "Enhancement",
    filter: "enhancement",
  },
  {
    tag: "Bug",
    filter: "bug",
  },
  {
    tag: "Live",
    filter: "live",
  },
]);
const value = ref([]);

function fetch(key) {
  value.value = [];

  while (value.value.length < Math.min(key.length, 9)) {
    value.value.push({
      name: "test" + key[value.value.length],
      description: "test",
    });
  }

  return [];
}

function onBeforeEnterList(el) {
  el.style.opacity = 0;
  el.style.transform = "translateX(10px)";
}

function onLeaveList(el, done) {
  gsap.to(el, {
    opacity: 0,
    transform: "translateX(-10px)",
    duration: 0.2,
    onComplete: done,
    delay: el.dataset.index * 0.5,
  });
}

function onEnterList(el, done) {
  gsap.to(el, {
    opacity: 1,
    transform: "translateX(0)",
    duration: 0.2,
    onComplete: done,
    delay: el.dataset.index * 0.5,
  });
}
</script>

<style lang="scss" scoped>
.Market-Header-Labels-Inner {
  span {
    &::before {
      content: "";
      position: absolute;

      width: 100%;
      height: 2px;

      bottom: 0;
      opacity: 0.75;
      transition: 0.25s;
      transform: scaleX(0);
      background-color: var(--el-color-primary);
    }
    position: relative;

    opacity: 0.75;
    cursor: pointer;

    transition: 0.25s;
    &.active {
      &::before {
        transform: scaleX(1);
      }
      opacity: 1;
    }
  }

  display: flex;

  gap: 0.5rem;
}

.Market-List {
  position: relative;
  padding: 1% 1.5%;
  display: flex;

  gap: 16px;
  flex-wrap: wrap;

  top: 5%;

  width: 100%;
  height: 80%;

  list-style: none;

  box-sizing: border-box;
}

.Market-Header-Search {
  &::before {
    z-index: -1;
    content: "TOUCH";
    position: absolute;

    width: 100%;

    opacity: 0.025;
    text-align: center;
    font-size: 1.75rem;
    letter-spacing: 10rem;

    transform: skewX(-15deg);
  }
  :deep(& > .FlatInput-Container) {
    margin: 0;

    width: 70%;
  }
  display: flex;
  align-items: center;
  justify-content: center;

  gap: 1rem;
  width: 100%;
}

.Market-Header-Labels {
  &-Inner {
    flex: 1;
    width: 70%;
  }
  &-Order {
    display: flex;

    width: 30%;

    justify-content: flex-end;
  }
  position: relative;
  padding: 0.25rem 0.5rem;
  display: flex;

  width: 100%;
  height: 24px;

  align-items: center;
  justify-content: space-between;
}

.Market-Header {
  position: relative;
  display: flex;
  padding: 1% 1%;
  margin-top: 2%;

  gap: 0.5rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;

  left: 10%;

  width: 80%;

  box-sizing: border-box;
  //box-shadow: var(--el-box-shadow-lighter);
}

.Market-Container {
  position: relative;

  width: 100%;
  height: 100%;
}
</style>
