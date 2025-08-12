<script setup lang="ts">
import TouchRay from './TouchRay.vue'

</script>

<template>
  <div class="touch-feature">
    <TouchRay />

    <div class="content-wrapper">
      <div class="beta-tag">
        <span class="beta-text">BETA</span>
      </div>

      <p class="subtitle">More than imagination.</p>

      <div class="introduction">
        <p>Depends on your needs, it integrates various practical tools and features, aiming to make your desktop smarter, more efficient, and convenient.</p>
      </div>

      <div class="features-section">
        <h2 class="section-title">Why Choose Touch?</h2>
        <div class="features-grid">
          <div class="feature-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="rgba(255, 255, 255, 0.8)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-3.5l6-4.5-6-4.5z"/>
              </svg>
            </div>
            <h3 class="card-title">Innovative Design</h3>
            <p class="card-description">Experience a modern and intuitive interface that boosts your productivity with every click.</p>
          </div>
          <div class="feature-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="rgba(255, 255, 255, 0.8)" d="M7 2v11h3v9l7-12h-4l4-8z"/>
              </svg>
            </div>
            <h3 class="card-title">Lightning Fast</h3>
            <p class="card-description">Blazing-fast performance powered by cutting-edge technologies for seamless workflow.</p>
          </div>
          <div class="feature-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="rgba(255, 255, 255, 0.8)" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
              </svg>
            </div>
            <h3 class="card-title">Secure & Reliable</h3>
            <p class="card-description">Military-grade encryption and robust security measures to keep your data safe.</p>
          </div>
          <div class="feature-card">
            <div class="card-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 26 26"><!-- Icon from Garden SVG Icons by Zendesk - https://github.com/zendeskgarden/svg-icons/blob/main/LICENSE.md --><path fill="currentColor" d="m22.475 18.881l-8.891 4.925c-.525.259-.643.259-1.168 0l-8.89-4.925c-1.164-.644-.195-2.385.97-1.74L13 21.85l8.505-4.71c1.164-.645 2.133 1.096.97 1.74zm0-5l-8.891 4.925c-.525.259-.643.259-1.168 0l-8.89-4.925c-1.164-.644-.195-2.385.97-1.74L13 16.85l8.505-4.71c1.164-.645 2.133 1.096.97 1.74zM3.515 8.89a1 1 0 0 1-.002-1.749l9-5.015a1 1 0 0 1 .974 0l9 5.015a1 1 0 0 1-.003 1.749l-9.007 4.985a1 1 0 0 1-.97 0z"/></svg>
            </div>
            <h3 class="card-title">Cross-Platform</h3>
            <p class="card-description">Work seamlessly across all your devices with perfect synchronization.</p>
          </div>
          <div class="feature-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="rgba(255, 255, 255, 0.8)" d="M19 7h-3V6a4 4 0 0 0-8 0v1H5a1 1 0 0 0-1 1v11a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8a1 1 0 0 0-1-1zM10 6a2 2 0 0 1 4 0v1h-4zm9 12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V9h2v1a1 1 0 0 0 2 0V9h6v1a1 1 0 0 0 2 0V9h2z"/>
              </svg>
            </div>
            <h3 class="card-title">Extensible</h3>
            <p class="card-description">Easily extend functionality with plugins and custom modules to fit your specific needs.</p>
          </div>
          <div class="feature-card">
            <div class="card-icon">
              <svg viewBox="0 0 24 24" width="48" height="48">
                <path fill="rgba(255, 255, 255, 0.8)" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zm0-2V4a8 8 0 1 1 0 16zm-5.5-8.5l3.5 3.5 7-7-1.5-1.5-5.5 5.5-2-2L6.5 11.5z"/>
              </svg>
            </div>
            <h3 class="card-title">Customizable</h3>
            <p class="card-description">Fully customizable interface and workflows to match your personal preferences and work style.</p>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.touch-feature {
  position: relative;
  width: 100%;
  height: 100%;
  /* height: var(--vh, 100%); */
  overflow: hidden;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.content-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  color: white;
  z-index: 10;
  position: relative;
  padding: 2rem 1rem;
  /* max-width: 1200px; */
  width: 100%;
}

.beta-tag {
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 5px 15px;
  margin-bottom: 1rem;
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
}

.beta-text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.subtitle {
  font-size: 2rem;
  margin-top: 1rem;
  margin-bottom: 2rem;
  font-weight: 300;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
  position: relative;
  padding-bottom: 1rem;
}

.subtitle::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 3px;
  background: linear-gradient(90deg, transparent, #64b5f6, transparent);
  border-radius: 3px;
}

.introduction {
  max-width: 600px;
  margin: 0 auto 2rem;
  font-size: 1.1rem;
  line-height: 1.6;
  font-weight: 300;
  position: relative;
}

.features-section {
  width: 100%;
  padding: 2rem 0;
}

.section-title {
  font-size: 2rem;
  font-weight: 300;
  margin-bottom: 3rem;
  color: white;
  text-align: center;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
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

@media (max-width: 768px) {
  .features-grid {
    gap: 1.5rem;
    padding: 0 0.5rem;
  }
  
  .feature-card {
    padding: 1.5rem;
  }
  
  .card-icon svg {
    width: 40px;
    height: 40px;
  }
  
  .card-title {
    font-size: 1.1rem;
    margin-bottom: 0.75rem;
  }
  
  .card-description {
    font-size: 0.9rem;
  }
  
  .section-title {
    font-size: 1.5rem;
    margin-bottom: 2rem;
  }
}

@media (max-width: 480px) {
  .features-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  
  .feature-card {
    padding: 1.25rem;
  }
  
  .card-icon svg {
    width: 36px;
    height: 36px;
  }
  
  .card-title {
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }
  
  .card-description {
    font-size: 0.85rem;
  }
  
  .section-title {
    font-size: 1.3rem;
    margin-bottom: 1.5rem;
  }
}
</style>
