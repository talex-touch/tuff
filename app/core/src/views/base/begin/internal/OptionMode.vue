<script setup lang="ts" name="OptionMode">
import Forbidden from "./Forbidden.vue";
import Done from "./Done.vue";

const choice = ref(0);
const step = inject("step")!;

function handleAgree() {
  step({
    comp: !choice.value ? Forbidden : Done,
  });
}
</script>

<template>
  <div class="OptionMode">
    <div class="OptionMode-Display">
      <div class="diaplyer transition-cubic" :class="{ fill: choice }"></div>
    </div>
    <div class="OptionMode-Choice">
      <div
        :class="{ active: !choice }"
        @click="choice = 0"
        class="transition-cubic OptionMode-Section"
      >
        <h1>Novice<span class="tag">RECOMMENDED</span></h1>
        <span>
          I'm a novice. And I have not yet learned how to use this software even other
          similar apps. Please help me.
        </span>
      </div>
      <div
        :class="{ active: choice }"
        @click="choice = 1"
        class="transition-cubic OptionMode-Section"
      >
        <h1>Experienced</h1>
        <span>
          I'm an experienced user. I have used other similar apps. Skip the base tutorial.
        </span>
      </div>
    </div>
    <div class="OptionMode-Next">
      <FlatButton primary @click="handleAgree"> SURE </FlatButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes shining {
  from {
    opacity: var(--ob, 0);
    transform: scale(var(--s, 1.25));
  }

  to {
    opacity: var(--ot, 1);
    transform: scale(var(--t, 1));
  }
}

.diaplyer {
  &::before,
  &::after {
    content: "";
    position: absolute;

    inset: 0;

    border-radius: 50%;
    transform: scale(1.25);
    border: 2px solid var(--el-color-primary);
    // background-color: var(--el-color-primary);
    animation: shining 0.5s infinite;
  }

  &::after {
    --s: 2;
    --t: 0;
    animation: shining 1s infinite;
  }

  position: relative;
  width: 5rem;
  height: 5rem;

  --s: 2.5;
  --t: 0.5;
  border-radius: 50%;
  border: 2px solid var(--el-color-primary);
  animation: shining 1.25s infinite;
}

.diaplyer.fill {
  &::before {
    --s: 0;
    --t: 1.75;
    --ob: 1;
    --ot: 0;
  }
  &::after {
    --s: 0;
    --t: 2.5;
    --ob: 1;
    --ot: 0;
  }

  --s: 0;
  --t: 1.5;
  --ob: 1;
  --ot: 0;
}

@keyframes join {
  to {
    opacity: 1;
  }
}

.OptionMode {
  &-Display {
    display: flex;

    align-items: center;
    justify-content: center;

    height: 60%;
  }

  &-Choice {
    margin: 10px 0;
    display: flex;

    height: 30%;

    gap: 1rem;
  }

  &-Next {
    height: 10%;
  }

  &-Section {
    .tag {
      margin-left: 5px;
      font-size: 14px;

      background-color: #b7aa46a0;
    }
    h1 {
      margin: 0;
    }

    &:hover {
      border-color: var(--el-border-color);
    }

    &.active {
      border-color: var(--el-color-primary);
      background-color: var(--el-color-primary-light-7);
    }

    width: 50%;

    padding: 1rem;

    cursor: pointer;
    border-radius: 8px;
    box-sizing: border-box;
    border: 1px solid transparent;
  }

  position: relative;

  height: 100%;
}
</style>
