<template>
  <div class="demo">
    <div class="demo__scroll" aria-label="scrollable content">
      <div class="demo__hero" />
      <div class="demo__text">
        <div class="demo__h">
          Scrollable content
        </div>
        <div class="demo__p">
          This panel contains text and image-like blocks. Scroll to see blur/glass react.
        </div>
        <div class="demo__p">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer at urna vitae metus ultricies placerat.
        </div>
        <div class="demo__p">
          Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas.
        </div>
        <div class="demo__p">
          Curabitur laoreet, mi sed luctus luctus, arcu leo commodo ligula, eget commodo augue nisi sit amet risus.
        </div>
        <div class="demo__p">
          Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.
        </div>
        <div class="demo__p">
          Donec vitae sapien ut libero venenatis faucibus. Nullam quis ante. Etiam sit amet orci eget eros faucibus tincidunt.
        </div>
      </div>
    </div>

    <div class="demo__overlay">
      <div class="demo__grid">
        <div class="demo__item">
          <div class="demo__title">
            maskBackground="mask"
          </div>
          <TxProgressBar :percentage="68" height="12px" show-text mask-background="mask" />
        </div>

        <div class="demo__item">
          <div class="demo__title">
            maskBackground="blur"
          </div>
          <TxProgressBar :percentage="68" height="12px" show-text mask-background="blur" />
        </div>

        <div class="demo__item">
          <div class="demo__title">
            maskBackground="glass"
          </div>
          <TxProgressBar :percentage="68" height="12px" show-text mask-background="glass" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo {
  position: relative;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  min-height: 280px;
}

.demo__scroll {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 18px;
  background:
    radial-gradient(900px 420px at 10% 20%, rgba(96, 165, 250, 0.42), transparent 60%),
    radial-gradient(820px 420px at 90% 30%, rgba(167, 139, 250, 0.36), transparent 62%),
    radial-gradient(740px 420px at 40% 90%, rgba(52, 211, 153, 0.30), transparent 64%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
}

.demo__hero {
  height: 140px;
  border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(96, 165, 250, 0.55), rgba(167, 139, 250, 0.45), rgba(52, 211, 153, 0.35));
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
}

.demo__text {
  margin-top: 14px;
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, rgba(0, 0, 0, 0.22) 60%, transparent);
}

.demo__h {
  font-size: 13px;
  font-weight: 700;
  color: color-mix(in srgb, var(--tx-text-color-primary, #fff) 90%, transparent);
  margin-bottom: 8px;
}

.demo__p {
  font-size: 12px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--tx-text-color-primary, #fff) 78%, transparent);
  margin-bottom: 10px;
}

.demo__overlay {
  position: relative;
  padding: 14px;
  pointer-events: none;
}

.demo__grid {
  pointer-events: auto;
  display: grid;
  gap: 12px;
  max-width: 520px;
}

.demo__item {
  padding: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #0b0f17) 72%, transparent);
}

.demo__title {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: color-mix(in srgb, var(--tx-text-color-primary, #fff) 82%, transparent);
}
</style>
