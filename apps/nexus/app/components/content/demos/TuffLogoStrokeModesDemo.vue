<template>
  <div style="display: flex; flex-wrap: wrap; gap: 18px; align-items: center;">
    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <TxTuffLogoStroke :size="84" mode="once" />
      <span style="font-size: 12px; opacity: 0.72;">once</span>
    </div>

    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <TxTuffLogoStroke :size="84" mode="breathe" />
      <span style="font-size: 12px; opacity: 0.72;">breathe</span>
    </div>

    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
      <TxTuffLogoStroke :size="84" mode="hover" />
      <span style="font-size: 12px; opacity: 0.72;">hover me</span>
    </div>
  </div>
</template>
