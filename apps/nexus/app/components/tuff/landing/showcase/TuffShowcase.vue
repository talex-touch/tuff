<template>
  <div class="tuff-showcase flex flex-col gap-12" aria-hidden="true">
    <TuffLandingShowcaseTuffShowcaseMockHeader />
    <TuffLandingShowcaseTuffShowcaseDisplayer />
  </div>
</template>

<style scoped>
.tuff-showcase {
  --showcase-width: 320px;
  --showcase-effective-width: min(92vw, var(--showcase-width));

  position: relative;
  padding: 1rem;
  width: var(--showcase-effective-width);
  max-width: 100%;
  aspect-ratio: 16 / 9;
  flex-shrink: 0;
  background: transparent;
}

/* Fixed width presets tied to common device classes */
@media (min-width: 390px) {
  .tuff-showcase {
    --showcase-width: 390px;
  }
}

@media (min-width: 768px) {
  .tuff-showcase {
    --showcase-width: 720px; /* 1280 × 720 baseline */
  }
}

@media (min-width: 1024px) {
  .tuff-showcase {
    --showcase-width: 768px; /* Tablet portrait */
  }
}

@media (min-width: 1280px) {
  .tuff-showcase {
    --showcase-width: 900px; /* 1440 × 900 productivity */
  }
}

@media (min-width: 1366px) {
  .tuff-showcase {
    --showcase-width: 1024px; /* 1366 × 768 mainstream */
  }
}

@media (min-width: 1440px) {
  .tuff-showcase {
    --showcase-width: 1080px; /* 1920 × 1080 FHD */
  }
}

@media (min-width: 1920px) {
  .tuff-showcase {
    --showcase-width: 1280px; /* 2560 × 1440 laptops / 2K */
  }
}

@media (min-width: 2560px) {
  .tuff-showcase {
    --showcase-width: 1440px; /* QHD desktop */
  }
}

@media (min-width: 3440px) {
  .tuff-showcase {
    --showcase-width: 1600px; /* Ultrawide */
  }
}

@media (min-width: 3840px) {
  .tuff-showcase {
    --showcase-width: 1800px; /* UHD / 4K */
  }
}
</style>
