<script setup lang="ts">
import { computed } from 'vue'

interface ShowcaseSearchScenario {
  media?: {
    src: string
    alt: string
  }
}

const props = withDefaults(defineProps<{
  scenario?: ShowcaseSearchScenario | null
  active?: boolean
}>(), {
  scenario: null,
  active: false,
})

const media = computed(() => props.scenario?.media ?? null)
</script>

<template>
  <article
    class="showcase-search"
    :class="{ 'is-active': active }"
  >
    <div class="corebox-mock">
      <div class="corebox-mock__media">
        <div class="corebox-mock__media-frame">
          <img
            v-if="media?.src"
            :src="media.src"
            :alt="media.alt"
            loading="lazy"
          >
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.showcase-search {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  color: #0f172a;
}

.corebox-mock {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  border-radius: 16px;
  background: linear-gradient(180deg, #e6e8eb, #d7dbe0);
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 32px 80px rgba(15, 23, 42, 0.25);
  transition: transform 420ms ease, box-shadow 420ms ease, border-color 420ms ease, opacity 420ms ease;
  transform: translate3d(0, 10px, 0) scale(1.02);
  opacity: 0.92;
}

.corebox-mock__media {
  flex: 1;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.corebox-mock__media-frame {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: #e5e7eb;
  border: 1px solid rgba(15, 23, 42, 0.08);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}

.corebox-mock__media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.showcase-search.is-active .corebox-mock {
  transform: translate3d(0, 0, 0) scale(1);
  opacity: 1;
  border-color: rgba(15, 23, 42, 0.12);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 40px 110px rgba(15, 23, 42, 0.3);
}

.corebox-mock__header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.55rem 0.85rem;
  height: 64px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(90deg, #eceff2, #e3e6ea);
}

.corebox-mock__prefix {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.corebox-mock__logo {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  position: relative;
  background: radial-gradient(circle at 30% 30%, rgba(255, 107, 203, 0.9), rgba(71, 118, 230, 0.9));
  box-shadow:
    0 0 0 3px rgba(255, 255, 255, 0.7),
    0 10px 20px rgba(71, 118, 230, 0.25);
  flex-shrink: 0;
}

.corebox-mock__logo::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0));
  opacity: 0.7;
}

.corebox-mock__input {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  height: 52px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #f5f6f7;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 8px 18px rgba(15, 23, 42, 0.08);
  min-width: 0;
}

.corebox-mock__input-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: #475569;
  font-size: 0.7rem;
  font-weight: 600;
}

.corebox-mock__input-icon {
  font-size: 1rem;
  color: #64748b;
}

.corebox-mock__input-text {
  flex: 1;
  min-width: 0;
  font-size: clamp(0.92rem, 0.55vw + 0.82rem, 1.15rem);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #111827;
}

.corebox-mock__actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: #f3f4f6;
  color: #64748b;
}

.corebox-mock__action {
  font-size: 1.05rem;
}

.corebox-mock__content {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem 0.65rem 0.8rem;
  flex: 1;
  min-height: 0;
}

.corebox-mock__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.corebox-mock__tag {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: #eef1f4;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6b7280;
}

.corebox-mock__tag.is-active {
  background: #e0ecff;
  border-color: rgba(59, 130, 246, 0.65);
  color: #1d4ed8;
}

.corebox-mock__assist {
  margin: 0;
  font-size: 0.78rem;
  color: #6b7280;
  line-height: 1.5;
}

.corebox-mock__insight {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: #f5f6f7;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.corebox-mock__insight-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.15);
  font-size: 0.6rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #2563eb;
  flex-shrink: 0;
}

.corebox-mock__insight-text {
  font-size: 0.75rem;
  line-height: 1.5;
  color: #475569;
}

.corebox-mock__results {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-height: 0;
}

.corebox-mock__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0.8rem;
  min-height: 52px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.7);
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.corebox-mock__item.is-active {
  background: #ffffff;
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.corebox-mock__item-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #111827;
  font-size: 1rem;
}

.corebox-mock__item-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 0.25rem;
}

.corebox-mock__item-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.corebox-mock__item-subtitle {
  margin: 0;
  font-size: 0.78rem;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.corebox-mock__item-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.corebox-mock__item-source {
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: #eef2f6;
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
  font-weight: 600;
}

.corebox-mock__item-key {
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: #e2e8f0;
  font-size: 0.6rem;
  font-weight: 600;
  color: #475569;
}

.corebox-mock__item-accent {
  position: absolute;
  left: 0;
  top: 20%;
  width: 3px;
  height: 60%;
  border-radius: 999px;
  background: #3b82f6;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.45);
  opacity: 0;
  transition: opacity 180ms ease;
}

.corebox-mock__item.is-active .corebox-mock__item-accent {
  opacity: 1;
}

.corebox-mock__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.4rem 0.85rem;
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  background: #f5f6f7;
  font-size: 0.65rem;
  color: #6b7280;
}

.corebox-mock__footer-title {
  color: #111827;
  text-transform: none;
  letter-spacing: 0;
}

.corebox-mock__footer-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.corebox-mock__footer-subtitle {
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: #e2e8f0;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  color: #64748b;
  text-transform: none;
}

.corebox-mock__footer-hints {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.corebox-mock__footer-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.corebox-mock__footer-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: #e2e8f0;
  color: #334155;
  font-weight: 600;
  font-size: 0.55rem;
}

.corebox-mock__footer-label {
  font-size: 0.58rem;
  color: #64748b;
  text-transform: none;
  letter-spacing: 0.08em;
}

.showcase-search__placeholder {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  color: rgba(210, 212, 230, 0.72);
}

.showcase-search__placeholder-title {
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(200, 204, 228, 0.6);
}

.showcase-search__placeholder p {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(222, 224, 244, 0.76);
  line-height: 1.6;
}

@media (max-width: 640px) {
  .corebox-mock__header {
    flex-direction: column;
    align-items: stretch;
    height: auto;
  }

  .corebox-mock__actions {
    align-self: flex-end;
  }

  .corebox-mock__item {
    align-items: flex-start;
  }

  .corebox-mock__item-meta {
    margin-left: 0;
  }

  .corebox-mock__footer {
    flex-direction: column;
    align-items: flex-start;
  }

  .corebox-mock__footer-hints {
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .corebox-mock {
    transition: none;
    transform: none;
  }
}
</style>
