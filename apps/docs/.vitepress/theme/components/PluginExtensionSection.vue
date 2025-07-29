<script setup lang="ts">
import TouchButton from './base/TouchButton.vue'
</script>

<template>
  <!-- Plugin & Extension 版面 -->
  <div class="plugin-extension-section">
    <div class="section-content">
      <div class="beta-tag">
        <span class="beta-text">EXTENSIBLE</span>
      </div>
      
      <h2 class="section-title">Powerful Plugin & Extension System</h2>
      <p class="section-subtitle">Lightweight plugins and heavyweight extensions for ultimate customization</p>
      
      <div class="introduction">
        <p>Polyglot Toolbox features a sophisticated plugin architecture that allows you to tailor the application to your exact needs. From simple lightweight plugins to complex heavyweight extensions, our system provides unparalleled flexibility and power.</p>
      </div>
      
      <div class="features-grid">
        <div class="feature-card">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <path fill="rgba(255, 255, 255, 0.8)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5z"/>
            </svg>
          </div>
          <h3 class="card-title">Lightweight Plugins</h3>
          <p class="card-description">Simple, focused plugins that add specific functionality without overhead. Perfect for quick enhancements and minor customizations.</p>
        </div>
        <div class="feature-card">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <path fill="rgba(255, 255, 255, 0.8)" d="M7 2v11h3v9l7-12h-4l4-8z"/>
            </svg>
          </div>
          <h3 class="card-title">Heavyweight Extensions</h3>
          <p class="card-description">Comprehensive extensions that transform the core functionality of the application. Build entire new workflows and capabilities.</p>
        </div>
        <div class="feature-card">
          <div class="card-icon">
            <svg viewBox="0 0 24 24" width="48" height="48">
              <path fill="rgba(255, 255, 255, 0.8)" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </div>
          <h3 class="card-title">Seamless Integration</h3>
          <p class="card-description">All plugins and extensions integrate smoothly with the core application, maintaining performance and consistency.</p>
        </div>
        <div class="feature-card">
          <div class="card-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 26 26"><!-- Icon from Garden SVG Icons by Zendesk - https://github.com/zendeskgarden/svg-icons/blob/main/LICENSE.md --><path fill="currentColor" d="m22.475 18.881l-8.891 4.925c-.525.259-.643.259-1.168 0l-8.89-4.925c-1.164-.644-.195-2.385.97-1.74L13 21.85l8.505-4.71c1.164-.645 2.133 1.096.97 1.74zm0-5l-8.891 4.925c-.525.259-.643.259-1.168 0l-8.89-4.925c-1.164-.644-.195-2.385.97-1.74L13 16.85l8.505-4.71c1.164-.645 2.133 1.096.97 1.74zM3.515 8.89a1 1 0 0 1-.002-1.749l9-5.015a1 1 0 0 1 .974 0l9 5.015a1 1 0 0 1-.003 1.749l-9.007 4.985a1 1 0 0 1-.97 0z"/></svg>
          </div>
          <h3 class="card-title">Developer Friendly</h3>
          <p class="card-description">Comprehensive SDK and documentation make it easy for developers to create their own plugins and extensions.</p>
        </div>
      </div>
      
      <div class="cta-section">
        <TouchButton>
          Explore Plugins & Extensions
        </TouchButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plugin-extension-section {
  padding: 4rem 1rem;
  height: 100%;
  /* height: var(--vh, 100%); */
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.section-content {
  max-width: 1200px;
  margin: 0 auto;
  text-align: center;
}

.beta-tag {
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 5px 15px;
  margin: 0 auto 1rem;
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
  display: inline-block;
}

.beta-text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.section-title {
  font-size: 2rem;
  font-weight: 300;
  margin-bottom: 1rem;
  color: white;
}

.section-subtitle {
  font-size: 1.2rem;
  font-weight: 300;
  margin-bottom: 2rem;
  color: rgba(255, 255, 255, 0.8);
}

.introduction {
  max-width: 600px;
  margin: 0 auto 2rem;
  font-size: 1.1rem;
  line-height: 1.6;
  font-weight: 300;
  position: relative;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
  transform: translateY(0);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.feature-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.card-icon {
  margin-bottom: 1rem;
  transition: all 0.3s ease;
}

.feature-card:hover .card-icon {
  transform: scale(1.1);
}

.feature-card:hover .card-icon path {
  fill: rgba(255, 255, 255, 1);
}

.card-title {
  font-size: 1.3rem;
  font-weight: 400;
  margin-bottom: 1rem;
  color: white;
  transition: all 0.3s ease;
}

.feature-card:hover .card-title {
  color: #64b5f6;
}

.card-description {
  font-size: 1rem;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  text-align: center;
  transition: all 0.3s ease;
}

.feature-card:hover .card-description {
  color: rgba(255, 255, 255, 0.9);
}

.cta-section {
  margin-top: 2rem;
}

@media (max-width: 768px) {
  .plugin-extension-section {
    padding: 2rem 1rem;
  }

  .section-title {
    font-size: 1.5rem;
  }
  
  .section-subtitle {
    font-size: 1rem;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }
}
</style>