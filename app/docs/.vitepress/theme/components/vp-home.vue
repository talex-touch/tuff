<script lang="ts" setup>
import Logo from './base/Logo.vue';
import TouchBubbles from './base/TouchBubbles.vue';
</script>

<template>
  <div class="Home-Header">
    <h1>TalexTouch</h1>
    <p>A strong adaptation more platform all-tool program.</p>
    <Logo />
    <TouchBubbles />
  </div>

  <f-main>
    <f-text align="center" line-height="70px" bold block size="25px">
      Tutorial
    </f-text>

    <f-text align="center">
      <f-button round type="primary" class="start" href="/docs/hello.html">
        😊 Quick start
      </f-button>
      <f-button round href="https://github.com/talex-touch/talex-touch" target="_blank">
        Github
      </f-button>
    </f-text>

    <f-divider margin="40px" color="#eef" />

    <f-text bold block>Features</f-text>
    <f-text>📌 Multiple platform supports!</f-text>
    <f-text>
      🚀 With
      <f-link href="https://github.com/FightingDesign/fighting-design" type="primary">
        fighting-design
      </f-link>
      perfectly combined!
    </f-text>
    <f-text>💪 Use Vue.js latest version develop</f-text>
    <f-text>🐆 Extends Vite, faster than your imagination.</f-text>
    <f-text>🖍️ In time to follow the latest version Electron</f-text>
    <f-text>✔️ Simple & Elegant TDesignS</f-text>
    <f-text>🚩 Wrapper extensions to explore more.</f-text>
    <f-text>📃 Community plugins shows acme magic degrees.</f-text>
  </f-main>
</template>

<style lang="scss" scoped>
.Home-Header {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    right: -15%;
    top: 0%;

    width: 60%;
    height: 100%;

    opacity: .1;
    transform: skewX(20deg);
    background-color: var(--vp-home-hero-name-color);
  }
  h1 {
    font-size: 50px;
    font-weight: 700;
    margin-bottom: 20px;
  }
  p {
    font-size: 20px;
    font-weight: 400;
    margin-bottom: 20px;
  }
  position: relative;
  margin-top: -3%;
  padding: 5% 0;
  display: flex;

  flex-direction: column;
  justify-self: center;
  align-items: center;

  width: 100%;
  height: 30%;

  overflow: hidden;
}
.f-main {
  max-width: 620px;
  margin: 40px auto;
  box-sizing: border-box;
  padding: 40px;
  padding-bottom: 0;
}

.f-button-default {
  margin-left: 10px;
}

.f-text {
  display: block;
  line-height: 40px;
}
</style>
