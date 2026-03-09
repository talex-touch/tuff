<script setup lang="ts">
definePageMeta({
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})
</script>

<template>
  <div class="WeChatMenu">
    <div class="PhoneFrame">
      <div class="device iphone">
        <div class="frame">
          <div class="content" />
        </div>
        <div class="stripe" />
        <div class="header">
          <div class="sensors" />
        </div>
        <div class="btns" />
        <div class="power" />
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.WeChatMenu {
  padding: 2rem;
}

.device *,
.device *::before,
.device *::after {
  box-sizing: border-box;
  display: block;
}

.device {
  margin: 50px auto;
  position: relative;
}

.device .frame {
  z-index: 1;
}

.iphone {
  height: 650px;
  width: 342px;
}

.iphone .frame {
  background: #222;
  border-radius: 54px;
  box-shadow:
    inset 0 0 0 2px #606467,
    inset 0 0 0 4px #e2e3e4;
  height: 650px;
  padding: 22px;
  width: 342px;
}

.iphone .content {
  background-color: #fff;
  border-radius: 32px;
  height: 600px;
  position: relative;
  width: 300px;
}

.iphone .stripe::after,
.iphone .stripe::before {
  border: solid rgba(51, 51, 51, 0.25);
  border-width: 0 6px;
  content: '';
  height: 5px;
  left: 0;
  position: absolute;
  width: 100%;
  z-index: 9;
}

.iphone .stripe::after {
  top: 68px;
}

.iphone .stripe::before {
  bottom: 68px;
}

.iphone .header {
  background: #222;
  height: 42px;
  left: 56%;
  margin-left: -82px;
  position: absolute;
  top: 27px;
  width: 133px;
  z-index: 199;
  border-radius: 30px;
}

.iphone .header::after {
  background: radial-gradient(
    circle at bottom left,
    transparent 0,
    transparent 75%,
    #222 75%,
    #222 100%
  );
  left: -6px;
}

.iphone .header::before {
  background: radial-gradient(
    circle at bottom right,
    transparent 0,
    transparent 75%,
    #222 75%,
    #222 100%
  );
  right: -6px;
}

.iphone .sensors::after,
.iphone .sensors::before {
  content: '';
  position: absolute;
}

.iphone .sensors::before {
  background: #444;
  border-radius: 50%;
  height: 11px;
  left: 50%;
  margin-left: 39px;
  top: 15px;
  width: 11px;
  background: radial-gradient(
    circle at 70% 30%,
    #6b7bc3,
    #4c2290 10%,
    #5256a1,
    transparent
  );
  box-shadow:
    0 0 2px #131420,
    0 0 2px #131420 inset,
    2px 0 4px #5256a1 inset;
}

.iphone .btns {
  background: #606467;
  height: 26px;
  left: -2px;
  position: absolute;
  top: 92px;
  width: 3px;
}

.iphone .btns::after,
.iphone .btns::before {
  background: #606467;
  content: '';
  height: 50px;
  left: 0;
  position: absolute;
  width: 3px;
}

.iphone .btns::after {
  top: 48px;
}

.iphone .btns::before {
  top: 112px;
}

.iphone .power {
  background: #606467;
  height: 80px;
  position: absolute;
  right: -2px;
  top: 160px;
  width: 3px;
}
</style>
