<template>
  <div style="display: flex; flex-direction: column; gap: 18px;">
    <TxKeyframeStrokeText text="TuffEx" :font-size="56" />

    <TxKeyframeStrokeText
      text="Stroke + Fill"
      stroke-color="#0ea5e9"
      fill-color="#0f172a"
      :duration-ms="2400"
      :stroke-width="1.8"
      :font-size="42"
      :font-weight="600"
    />
  </div>
</template>
