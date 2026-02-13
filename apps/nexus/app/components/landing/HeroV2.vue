<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useParticleLogoSystem } from '~/composables/useParticleLogoSystem'

interface CommandItem {
  id: string
  icon: string
  label: string
  desc: string
  type: string
  shortcut: string
}

const commands: CommandItem[] = [
  {
    id: 'ai',
    icon: 'i-heroicons-chat-bubble-left-right',
    label: 'Ask AI',
    desc: 'Draft content, answer questions...',
    type: 'AI',
    shortcut: 'ENTER'
  },
  {
    id: 'project',
    icon: 'i-heroicons-rocket-launch',
    label: 'Launch Project',
    desc: 'Open recent workspace',
    type: 'Workflow',
    shortcut: 'CMD+1'
  },
  {
    id: 'meeting',
    icon: 'i-heroicons-calendar',
    label: 'Schedule Meeting',
    desc: 'Google Calendar',
    type: 'App',
    shortcut: 'CMD+2'
  },
  {
    id: 'files',
    icon: 'i-heroicons-folder-open',
    label: 'Search Files',
    desc: 'Looking in /Users/Dev...',
    type: 'System',
    shortcut: 'CMD+3'
  },
  {
    id: 'theme',
    icon: 'i-heroicons-swatch',
    label: 'Theme Settings',
    desc: 'Dark / Light / System',
    type: 'Config',
    shortcut: 'CMD+,'
  }
]

const query = ref('')
const activeIndex = ref(0)
const isFlash = ref(false)
const flashTimer = ref<number | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const swirlRef = ref<HTMLElement | null>(null)

const { setMouse, triggerBurst, setFormationStrength } = useParticleLogoSystem(canvasRef, {
  logoScale: 1.6,
  logoOffsetY: -120,
  colors: {
    outline: '#4C4CFF',
    ring: ['#D73E4D', '#7F007F'],
    core: ['#199FFE', '#810DC6'],
    ambient: [220, 260],
  },
})

const visibleCommands = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return commands
  return commands.filter((command) => command.label.toLowerCase().includes(keyword))
})

watch(query, (val) => {
  activeIndex.value = 0
  setFormationStrength(val.trim() ? 0.3 : 1.0)
})

watch(visibleCommands, (value) => {
  if (!value.length) {
    activeIndex.value = 0
    return
  }
  if (activeIndex.value >= value.length) {
    activeIndex.value = 0
  }
})

// Enter flash → particle burst
watch(isFlash, (val) => { if (val) triggerBurst() })

const triggerFlash = () => {
  if (flashTimer.value) window.clearTimeout(flashTimer.value)
  isFlash.value = true
  flashTimer.value = window.setTimeout(() => {
    isFlash.value = false
    flashTimer.value = null
  }, 180)
}

const handleKeydown = (event: KeyboardEvent) => {
  const list = visibleCommands.value
  if (!list.length) return

  if (event.key === 'ArrowDown') {
    activeIndex.value = (activeIndex.value + 1) % list.length
    event.preventDefault()
    return
  }

  if (event.key === 'ArrowUp') {
    activeIndex.value = (activeIndex.value - 1 + list.length) % list.length
    event.preventDefault()
    return
  }

  if (event.key === 'Enter') {
    triggerFlash()
    query.value = ''
    activeIndex.value = 0
    event.preventDefault()
  }
}

const handleMouseMove = (event: MouseEvent) => {
  setMouse(event.clientX, event.clientY)

  const swirl = swirlRef.value
  if (!swirl) return
  const w = window.innerWidth
  const h = window.innerHeight
  const xMove = (event.clientX - w / 2) / 50
  const yMove = (event.clientY - h / 2) / 50
  swirl.style.transform = `scale(1.1) translate(${-xMove}px, ${-yMove}px)`
}

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  if (flashTimer.value) window.clearTimeout(flashTimer.value)
})
</script>

<template>
  <div
    class="relative w-full min-h-screen overflow-hidden bg-[#020202] text-white font-sans selection:bg-white/20 selection:text-white"
  >
    <div ref="swirlRef" class="hero-swirl" />
    <canvas ref="canvasRef" class="hero-fusion" />
    <div class="hero-noise" />
    <div class="hero-vignette" />

    <nav class="fixed top-0 w-full z-40 px-8 py-6 flex items-center justify-between text-sm font-medium tracking-wide">
      <div class="flex items-center gap-3 group cursor-pointer">
        <div class="w-2 h-2 rounded-full bg-[#4f6bff] shadow-[0_0_12px_rgba(79,107,255,0.9)]" />
        <span class="text-white font-bold tracking-tight">
          Tuff
          <span class="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded ml-1 border border-white/10">BETA</span>
        </span>
      </div>

      <div class="hidden md:flex items-center gap-8 text-white/60">
        <a href="#" class="nav-link hover:text-white transition-colors">Market</a>
        <a href="#" class="nav-link hover:text-white transition-colors">Docs</a>
        <a href="#" class="nav-link hover:text-white transition-colors">Updates</a>
        <a href="#" class="nav-link hover:text-white transition-colors">Pricing</a>
      </div>

      <div class="flex items-center gap-6">
        <div class="flex gap-4 text-white/60">
          <a href="#" class="hover:text-white transition-colors">
            <span class="i-heroicons-command-line w-4 h-4" />
          </a>
          <a href="#" class="hover:text-white transition-colors">
            <span class="i-heroicons-code-bracket w-4 h-4" />
          </a>
        </div>
        <a href="#" class="text-white/80 hover:text-white transition-colors">Log in</a>
      </div>
    </nav>

    <main class="relative z-10 w-full min-h-screen flex flex-col items-center justify-center px-4">
      <div class="text-center mb-10 md:mb-16 animate-float relative">
        <h1 class="hero-title select-none">
Tuff
</h1>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-white/10 blur-[80px] rounded-full pointer-events-none" />
      </div>

      <p class="text-white/50 text-lg md:text-xl mb-12 font-light tracking-wide text-center max-w-lg mx-auto">
        Profoundly Powerful. Deceptively Simple.
        <br>
        <span class="text-white/30 text-sm">The OS for your mind.</span>
      </p>

      <div class="w-full max-w-[720px]">
        <div class="hero-launcher" :class="{ 'is-flash': isFlash }">
          <div class="relative flex items-center h-16 px-6 border-b border-white/5">
            <span class="i-heroicons-magnifying-glass w-5 h-5 text-white/40 mr-4" />
            <input
              v-model="query"
              type="text"
              class="w-full bg-transparent border-none outline-none text-xl text-white placeholder-white/20 font-light caret-[#7aa2ff]"
              placeholder="Type a command..."
              @keydown="handleKeydown"
            >
            <div class="flex items-center gap-2 opacity-40">
              <span class="text-xs font-mono border border-white/20 rounded px-1.5 py-0.5">ESC</span>
            </div>
          </div>

          <div class="p-2 space-y-1 max-h-[300px] overflow-y-auto no-scrollbar">
            <div v-if="!visibleCommands.length" class="py-8 text-center text-white/20 text-sm font-light">
              No commands found. Try "help".
            </div>
            <div
              v-for="(command, index) in visibleCommands"
              v-else
              :key="command.id"
              class="flex items-center gap-4 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200"
              :class="index === activeIndex ? 'item-active' : 'hover:bg-white/5 border-l-3 border-transparent'"
              @mouseenter="activeIndex = index"
            >
              <div
                class="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                :class="index === activeIndex ? 'bg-[#4f6bff] text-white' : 'bg-white/5 text-white/50'"
              >
                <span :class="`${command.icon} w-4 h-4`" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium" :class="index === activeIndex ? 'text-white' : 'text-white/80'">
                  {{ command.label }}
                </div>
                <div class="text-[11px] text-white/40 truncate">
                  {{ command.desc }}
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[9px] font-bold text-white/30 uppercase tracking-wider">{{ command.type }}</span>
                <span class="text-[10px] font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
                  {{ command.shortcut }}
                </span>
              </div>
            </div>
          </div>

          <div class="h-9 bg-black/20 border-t border-white/5 flex items-center justify-between px-4 text-[10px] text-white/40 font-mono uppercase tracking-widest">
            <div class="flex gap-3">
              <span class="hover:text-white/70 cursor-pointer transition-colors">Context: Global</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
              <span>AI Ready</span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-12 flex items-center gap-4 opacity-0 animate-fade-in">
        <button
          class="px-6 py-2.5 bg-white text-black rounded-full text-sm font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
        >
          <span class="i-heroicons-play-circle w-5 h-5" />
          Join waitlist
        </button>
        <button
          class="px-6 py-2.5 bg-transparent border border-white/20 text-white rounded-full text-sm font-medium hover:bg-white/5 transition-colors flex items-center gap-2"
        >
          <span class="i-heroicons-code-bracket w-5 h-5" />
          Developer docs
        </button>
      </div>
    </main>

    <div class="fixed right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-30">
      <div class="w-12 h-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform cursor-pointer group">
        <span class="i-heroicons-microphone w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
      </div>
      <div class="w-12 h-12 rounded-full border border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform cursor-pointer group">
        <span class="i-heroicons-clock w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero-swirl {
  position: fixed;
  inset: 0;
  background-image:
    radial-gradient(60% 60% at 25% 45%, rgba(43, 107, 255, 0.45), transparent 70%),
    radial-gradient(60% 60% at 70% 45%, rgba(255, 107, 43, 0.45), transparent 72%),
    conic-gradient(from 120deg at 50% 50%, rgba(43, 107, 255, 0.35), rgba(255, 107, 43, 0.3), rgba(43, 107, 255, 0.35));
  filter: contrast(1.1) brightness(0.9);
  opacity: 0.85;
  transform: scale(1.1) translate(0px, 0px);
  transition: transform 0.35s ease;
}

.hero-fusion {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  mix-blend-mode: screen;
  opacity: 0.8;
  pointer-events: none;
}

.hero-noise {
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.25'/%3E%3C/svg%3E");
  opacity: 0.25;
  mix-blend-mode: overlay;
  pointer-events: none;
}

.hero-vignette {
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at center, rgba(2, 2, 2, 0) 0%, rgba(2, 2, 2, 0.6) 70%, rgba(2, 2, 2, 0.9) 100%);
  pointer-events: none;
}

.hero-title {
  font-size: clamp(3.5rem, 12vw, 8rem);
  letter-spacing: 0.06em;
  font-weight: 800;
  background: linear-gradient(to bottom, #ffffff 40%, rgba(255, 255, 255, 0.6));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 25px rgba(255, 255, 255, 0.35)) drop-shadow(0 0 60px rgba(79, 107, 255, 0.3));
}

.hero-launcher {
  background: rgba(15, 15, 20, 0.4);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 20px 60px rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
  overflow: hidden;
}

.hero-launcher:focus-within {
  background: rgba(20, 20, 28, 0.6);
  border-color: rgba(255, 255, 255, 0.15);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.1),
    0 30px 80px rgba(0, 0, 0, 0.9),
    0 0 30px rgba(79, 107, 255, 0.15);
  transform: translateY(-2px) scale(1.005);
}

.hero-launcher.is-flash {
  transform: scale(0.98);
  filter: brightness(1.2);
}

.item-active {
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 100%);
  border-left: 3px solid #7aa2ff;
}

.nav-link {
  position: relative;
}

.nav-link::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 0;
  height: 1px;
  background: white;
  transition: all 0.3s ease;
  transform: translateX(-50%);
}

.nav-link:hover::after {
  width: 100%;
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}

.no-scrollbar {
  scrollbar-width: none;
}

@keyframes subtle-pulse {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-subtle-pulse {
  animation: subtle-pulse 2s infinite;
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-fade-in {
  animation: fadeIn 1s ease-out 0.5s forwards;
}
</style>
