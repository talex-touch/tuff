<script setup lang="ts">
import TextShaving from '../other/TextShaving.vue'
import RoundShavingLoading from '../loaders/RoundShavingLoading.vue'

const props = defineProps<{
  price: {
    origin: number
    discount: number
    discounted: number
    saved: number
  }
  type: string
  name: string
  desc: string
  got: boolean
}>()

const emits = defineEmits(['click'])
</script>

<template>
  <div class="PlanCard">
    <div class="PlanCard-Background">
      <RoundShavingLoading />
    </div>

    <div class="PlanCard-Inner">
      <p class="plan-title">
        {{ type }} | {{ name }}
      </p>
      <span class="pricing">
        <span>
          <span class="unit">￥</span>{{ price.discounted }}<span
            v-if="price.origin !== price.discounted"
            class="origin-price"
          >({{ price.origin }})</span> <small>/ 月</small>

        </span>
        <span v-if="price.discount" class="pricing origin">
          {{ (price.discount * 10).toFixed(2) }} 折
        </span>
      </span>

      <p class="info">
        {{ desc }}
      </p>
      <ul class="features">
        <slot />
        <!-- <li>
          <span class="icon">
            <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 0h24v24H0z" fill="none" />
              <path fill="currentColor" d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" />
            </svg>
          </span>
          <span><strong>20</strong> team members</span>
        </li>
        <li>
          <span class="icon">
            <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 0h24v24H0z" fill="none" />
              <path fill="currentColor" d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" />
            </svg>
          </span>
          <span>Plan <strong>team meetings</strong></span>
        </li>
        <li>
          <span class="icon">
            <svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 0h24v24H0z" fill="none" />
              <path fill="currentColor" d="M10 15.172l9.192-9.193 1.415 1.414L10 18l-6.364-6.364 1.414-1.414z" />
            </svg>
          </span>
          <span>File sharing</span>
        </li> -->
      </ul>
      <div v-wave :class="{ got }" class="action" @click="emits('click', $event)">
        <span class="button" href="#">
          {{ got ? '当前方案' : '立即订阅' }}
        </span>
      </div>
    </div>
  </div>
</template>

<style>
.PlanCard {
  position: relative;

  width: 300px;

  &:hover {
    .PlanCard-Inner {
      background-color: var(
        --wallpaper-color-light,
        var(--el-mask-color-extra-light)
      );
      /* box-shadow: 0 30px 30px -25px var(--wallpaper-color-light); */
    }

    .PlanCard-Background {
      opacity: 1;
    }
  }

  .plan-title {
    margin: 1rem 0;

    font-weight: 600;
    font-size: 1.25rem;

    opacity: 1;
    color: var(--el-text-color-primary);
    .wallpaper & {
      text-shadow: 0 0 4px var(--theme-color);
    }
  }

  .pricing {
    &.origin {
      font-weight: 600;
      color: #f4d553;
      text-shadow: 0 0 4px #000e;
    }

    .origin-price {
      margin: 0 5px;

      opacity: 0.75;
      text-decoration: line-through;
    }

    .unit {
      position: relative;

      top: -2.5px;
      margin-right: 2.5px;

      font-size: 0.75em;
    }

    width: max-content;
    backdrop-filter: blur(18px) saturate(180%) brightness(90%);
    /* background: var(--theme-color-light); */

    display: flex;
    align-items: center;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    margin: 0 0 0.25rem;

    border-radius: 12px;
  }
}

.PlanCard-Background {
  z-index: -1;
  position: absolute;

  top: -15%;
  left: 50%;

  opacity: 0;
  transition: 0.25s;
  transform: translateX(-50%);
}

.PlanCard strong {
  font-weight: 600;
  color: var(--wallpaper-color);
}

.PlanCard .PlanCard-Inner {
  height: 100%;

  align-items: center;
  padding: 20px;
  padding-top: 40px;
  color: var(--el-text-color-primary);

  border-radius: 12px;
  position: relative;
  display: flex;
  flex-direction: column;

  cursor: pointer;
  /* box-shadow: 0 30px 30px -25px var(--wallpaper-color-lighter); */
  box-shadow: var(--el-box-shadow);
  backdrop-filter: blur(18px) saturate(180%);
  background-color: var(--wallpaper-color-lighter, var(--el-bg-color));
}

.PlanCard .pricing small {
  font-size: 0.75em;
  margin-left: 0.25em;

  opacity: 0.75;
}

.PlanCard .info + * {
  margin-top: 1rem;
}

.PlanCard .features {
  display: flex;
  flex-direction: column;
}

.PlanCard .features li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.PlanCard .features li + * {
  margin-top: 0.75rem;
}

.PlanCard .features .icon {
  background-color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 50%;
  width: 20px;
  height: 20px;
}

.PlanCard .features .icon svg {
  width: 14px;
  height: 14px;
}

.PlanCard .features + * {
  margin-top: 1.25rem;
}

.PlanCard .action {
  &.got {
    opacity: 0.5;
    cursor: not-allowed;
  }

  width: 100%;
  display: flex;
  align-items: center;
  justify-content: end;
}

.PlanCard .button {
  background-color: var(--theme-color-light);

  color: #fff;
  font-weight: 500;
  font-size: 1.125rem;
  text-align: center;
  border: 0;
  outline: 0;
  width: 100%;
  padding: 0.625em 0.75em;
  text-decoration: none;

  border-radius: 12px;
}

.PlanCard .button:hover,
.PlanCard .button:focus {
  background-color: var(--theme-color);
}
</style>
