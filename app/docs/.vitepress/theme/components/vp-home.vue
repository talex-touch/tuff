<script lang="ts" setup>
import { onMounted } from 'vue';
import Logo from './base/Logo.vue';
import TouchBubbles from './base/TouchBubbles.vue';
import Bg from './../../../images/assets/home.png'

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

onMounted(() => {
  logoInit()
})

function logoInit() {
  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: '#home-logo-img',
      start: 'top 0',
      end: '+=700',
      scrub: 1,
    }
  })

  timeline.to('#home-logo-img', {
    scaleX: 2,
    scaleY: 10,
    duration: 5,
    opacity: 1,
    // filter: 'blur(50px) saturate(100%) brightness(1)',
    ease: 'power2.inOut',
  })

  gsap.to('#home-logo-logo', {
    transform: 'translateX(-50%) scale(1)',
    y: '800px',
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-logo',
      start: 'top 0',
      end: '+=600',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-title', {
    opacity: 1,
    scale: 1,
    y: -250,
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-title',
      start: 'top 0',
      end: '+=600',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-desc', {
    duration: 5,
    left: '100%',
    opacity: 1,
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-desc',
      start: 'top 500px',
      end: '+=650',
      scrub: 1,
    }
  })

  timeline.to('.attach-text-mp', {
    opacity: 1,
    y: 500,
    ease: 'power2.inOut',
    stagger: 0.1,
  })

  timeline.to('.attach-text-mp2', {
    opacity: 1,
    y: -450,
    ease: 'power2.inOut',
    stagger: 0.1,
    scrollTrigger: {
      trigger: '.TouchBubbles-Bubble',
      start: 'top 500px',
      end: '+=800',
      scrub: 1,
    }
  })

  gsap.to('.TouchBubbles-Bubble', {
    opacity: 1,
    y: 500,
    ease: 'power2.inOut',
    stagger: 2,
    scrollTrigger: {
      trigger: '.TouchBubbles-Bubble',
      start: 'top 200px',
      end: '+=500',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-attach-bg', {
    opacity: 1,
    y: 500,
    transform: 'translate(-50%, -50%) scale(5) rotate(45deg)',
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-attach-bg',
      start: 'top 500px',
      end: '+=600',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-attach2-bg', {
    opacity: 1,
    y: 600,
    transform: 'translate(-50%, -50%) scale(5) rotate(45deg)',
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-attach2-bg',
      start: 'top 1200px',
      end: '+=200',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-last h1', {
    transform: 'translateX(0%)',
    opacity: 1,
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-last h1',
      start: 'top 500px',
      end: '+=100',
      scrub: 1,
    }
  })

  gsap.to('#home-logo-version', {
    y: -50,
    scale: 1,
    opacity: 1,
    ease: 'power2.inOut',
    scrollTrigger: {
      trigger: '#home-logo-version',
      start: 'top 1000px',
      end: '+=200',
      scrub: 1,
    }
  })
}
</script>

<template>
  <div class="Home">
    <div class="Home-Logo">
      <img id="home-logo-img" :src="Bg" alt="home-bg" />

      <Logo id="home-logo-logo" />

      <h1 id="home-logo-title">TalexTouch</h1>
      <span id="home-logo-desc">A strong adaptation more platform all-tool program.</span>

      <div class="Home-Logo-Attach">
        <div id="home-logo-attach-bg" />
        <span class="attach-text-mp" v-for="i in 'MASTERPIECE'">{{ i }}</span>
      </div>


      <TouchBubbles id="home-logo-touch-bubbles" />
      <div class="Home-Logo-Attach2">
        <div id="home-logo-attach2-bg" />
        <span class="attach-text-mp2" v-for="i in 'AllEPlatforms'">{{ i }}</span>
      </div>
    </div>

    <div id="home-logo-last">
      <h1>More than imagination</h1>
    </div>

    <h1 id="home-logo-version">The All New 2.0.0</h1>
  </div>
</template>

<style lang="scss" scoped>
#home-logo-version {
  position: absolute;
  bottom: 10rem;

  width: 100%;

  font-size: 4rem;

  opacity: 0;
  transform: translateY(50px) scale(0);
  mix-blend-mode: color-burn;
  text-align: center;
}

#home-logo-last {
  h1 {
    font-size: 4rem;
    font-weight: 700;

    height: 80px;
    line-height: 80px;

    opacity: 0;
    background-clip: text;
    transform: translateX(-100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-image: linear-gradient(to top, #5ee7df 0%, #b490ca 100%);
  }

  position: absolute;

  top: 3600px;

  width: 100%;

  font-size: 4rem;

  overflow: hidden;
  text-align: center;
  mix-blend-mode: lighten;
}

.Home-Logo-Attach2 {
  #home-logo-attach2-bg {
    position: absolute;

    left: 50%;
    top: 50%;

    width: 256px;
    height: 256px;

    opacity: 0;
    border: 5px solid #ff00ff80;

    transform: translate(-50%, -50%) scale(0);
  }

  & :nth-child(5) {
    margin-right: 50%;

    transform: scale(0)
  }

  span {

    opacity: 0;
  }

  position: absolute;
  // padding: 0 30rem;
  display: flex;

  left: 0;
  top: 3000px;

  width: 100%;

  font-size: 8rem;
  font-weight: 500;

  box-sizing: border-box;
  justify-content: center;
  mix-blend-mode: difference;
}

.Home-Logo-Attach {
  #home-logo-attach-bg {
    position: absolute;

    left: 50%;
    top: 50%;

    width: 256px;
    height: 256px;

    opacity: 0;
    border: 5px solid #ff00ff80;

    transform: translate(-50%, -50%) scale(0);
  }

  span {
    opacity: 0;
  }

  position: absolute;
  padding: 0 4rem;
  display: flex;

  left: 0;
  top: 1000px;

  width: 100%;

  font-size: 8rem;
  font-weight: 500;

  box-sizing: border-box;
  justify-content: space-between;
  mix-blend-mode: difference;
}

#home-logo-desc {
  position: absolute;

  left: 0%;
  top: 800px;

  width: max-content;

  font-size: 1.5rem;
  font-weight: 500;

  opacity: 0;
  mix-blend-mode: difference;
}

#home-logo-title {
  position: absolute;

  left: 50%;

  font-size: 4rem;
  font-weight: 700;

  opacity: 0;

  mix-blend-mode: difference;
  transform: translateX(-50%) scale(0);
}

#home-logo-logo {
  position: absolute;

  left: 50%;
  top: 0px;

  transform: translateX(-50%) scale(2);
}

.Home {
  position: relative;

  width: 100%;
  height: 100%;

  &-Logo {
    img {

      opacity: .75;

      filter: blur(40px) saturate(80%) brightness(0.8);

      transform: scale(5, 15);
      // transition: .25s;
    }

    position: relative;

    top: 0;
    left: 0;

    width: 100%;
    height: 5000px;

    overflow: hidden;
  }
}
</style>

<style lang="scss">
.VPContent.is-home {
  padding: 0 !important;

  .VPHome {
    position: relative;
    padding: 0;
    width: 100%;
    height: 100%;
  }
}
</style>