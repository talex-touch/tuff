<template>
  <div
    style="
      position: relative;
      width: 100%;
      height: 380px;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.08);
      background: #fafbfc;
    "
  >
    <div
      style="
        position: absolute;
        inset: 0;
        overflow-y: auto;
        padding: 24px;
        line-height: 1.6;
      "
    >
      <h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 700; color: rgba(0, 0, 0, 0.88);">
        Article Title
      </h3>
      <p style="margin: 0 0 16px; font-size: 14px; color: rgba(0, 0, 0, 0.65);">
        Published on Dec 25, 2025
      </p>
      <p style="margin: 0 0 14px; font-size: 14px; color: rgba(0, 0, 0, 0.75);">
        This article background gives the glass panel real content to refract, so the demo shows blur,
        contrast, and depth without leaking markup into the preview.
      </p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;">
        <div style="height: 120px; border-radius: 12px; background: rgba(0, 0, 0, 0.06);" />
        <div style="height: 120px; border-radius: 12px; background: rgba(0, 0, 0, 0.04);" />
      </div>
      <p style="margin: 0 0 14px; font-size: 14px; color: rgba(0, 0, 0, 0.75);">
        The frosted surface stays readable while preserving the shape and tone of the content below it.
      </p>
      <p style="margin: 0 0 14px; font-size: 14px; color: rgba(0, 0, 0, 0.75);">
        Scroll this area to check how the overlay keeps its position as the background moves.
      </p>
      <div style="height: 200px;" />
    </div>

    <div
      style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
      "
    >
      <TxGlassSurface :width="380" :height="140" :border-radius="20" :background-opacity="0">
        <div style="padding: 16px; font-weight: 700; color: rgba(0, 0, 0, 0.72);">
          GlassSurface
        </div>
      </TxGlassSurface>
    </div>
  </div>
</template>
