<template>
  <div class="TouchBubbles-Container">
    <div class="TouchBubbles-Bubble" v-for="item in bubbles" :style="`width: ${item.size}px;transform: translate(${item.pos.x}%, ${item.pos.y}%) scale(var(--scale, 1));${item.color}`">
      <div :style="`--iconScale: ${item.iconScale}`" class="TouchBubbles-Bubble-Icon" v-html="item.icon"></div>
    </div>
  </div>
</template>

<script setup>
const bubbles = [
  {
    name: 'Windows',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256"><path fill="#0078D4" d="M0 0h121.329v121.329H0V0Zm134.671 0H256v121.329H134.671V0ZM0 134.671h121.329V256H0V134.671Zm134.671 0H256V256H134.671V134.671Z"/></svg>',
    color: 'background-image: linear-gradient(to top, #E0E0df 0%, #EEEbf0 10%);radial-gradient(at top center, rgba(255,200,255,0.40) 0%, rgba(0,0,0,0.40) 120%) #FFFFFF',
    size: '128',
    pos: {
      x: -400,
      y: -50
    },
    iconScale: 1.5
  },
  {
    name: 'MacOS',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="black" d="M17.05 20.28c-.98.95-2.05.8-3.08.35c-1.09-.46-2.09-.48-3.24 0c-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8c1.18-.24 2.31-.93 3.57-.84c1.51.12 2.65.72 3.4 1.8c-3.12 1.87-2.38 5.98.48 7.13c-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25c.29 2.58-2.34 4.5-3.74 4.25z"/></svg>',
    color: 'background-image: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);',
    size: '128',
    pos: {
      x: 250,
      y: -25
    },
    iconScale: 1.75
  },
  {
    name: 'Linux',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M14.62 8.35c-.42.28-1.75 1.04-1.95 1.19c-.39.31-.75.29-1.14-.01c-.2-.16-1.53-.92-1.95-1.19c-.48-.31-.45-.7.08-.92c1.64-.69 3.28-.64 4.91.03c.49.21.51.6.05.9m7.22 7.28c-.93-2.09-2.2-3.99-3.84-5.66a4.31 4.31 0 0 1-1.06-1.88c-.1-.33-.17-.67-.24-1.01c-.2-.88-.29-1.78-.7-2.61c-.73-1.58-2-2.4-3.84-2.47c-1.81.05-3.16.81-3.95 2.4c-.21.43-.36.88-.46 1.34c-.17.76-.32 1.55-.5 2.32c-.15.65-.45 1.21-.96 1.71c-1.61 1.57-2.9 3.37-3.88 5.35c-.14.29-.28.58-.37.88c-.19.66.29 1.12.99.96c.44-.09.88-.18 1.3-.31c.41-.15.57-.05.67.35c.65 2.15 2.07 3.66 4.24 4.5c4.12 1.56 8.93-.66 9.97-4.58c.07-.27.17-.37.47-.27c.46.14.93.24 1.4.35c.49.09.85-.16.92-.64c.03-.26-.06-.49-.16-.73"/></svg>',
    color: 'background-color: #DCD9D4; background-image: linear-gradient(to bottom, rgba(255,255,255,0.50) 0%, rgba(0,0,0,0.50) 100%), radial-gradient(at 50% 0%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.50) 50%); background-blend-mode: soft-light,screen;',
    size: '88',
    pos: {
      x: 350,
      y: -250
    },
    iconScale: 1.5
  },
  {
    name: 'WatchOS',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M18 8c0-.909-.613-1.67-1.445-1.912l-1.31-3.443A1 1 0 0 0 14.311 2H8.689a1 1 0 0 0-.934.645l-1.31 3.443A1.996 1.996 0 0 0 5 8v8c0 .909.613 1.67 1.445 1.912l1.31 3.443a1 1 0 0 0 .934.645h5.621c.415 0 .787-.257.935-.645l1.31-3.443A1.996 1.996 0 0 0 18 16v-2h1v-4h-1V8zm-1.998 8H7V8h9l.002 8z"/></svg>',
    color: 'background: linear-gradient(to bottom, rgba(255,255,255,0.85) 0%, rgba(0,0,0,0.15) 100%), radial-gradient(at top center, rgba(255,255,255,0.40) 0%, rgba(0,0,0,0.40) 120%) #FFFFF8; background-blend-mode: multiply,multiply;',
    size: '64',
    pos: {
      x: -560,
      y: 300
    },
    iconScale: 1.5
  },
  {
    name: 'Android',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M1 18q.225-2.675 1.638-4.925T6.4 9.5L4.55 6.3q-.15-.225-.075-.475T4.8 5.45q.2-.125.45-.05t.4.3L7.5 8.9Q9.65 8 12 8t4.5.9l1.85-3.2q.15-.225.4-.3t.45.05q.25.125.325.375t-.075.475L17.6 9.5q2.35 1.325 3.762 3.575T23 18H1Zm6-2.75q.525 0 .888-.363T8.25 14q0-.525-.363-.888T7 12.75q-.525 0-.888.363T5.75 14q0 .525.363.888T7 15.25Zm10 0q.525 0 .888-.363T18.25 14q0-.525-.363-.888T17 12.75q-.525 0-.888.363T15.75 14q0 .525.363.888t.887.362Z"/></svg>',
    color: 'background-color: #EFEFFF; background-image: linear-gradient(to bottom, rgba(255,255,255,0.50) 0%, rgba(0,0,0,0.50) 100%), radial-gradient(at 50% 0%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.50) 50%); background-blend-mode: soft-light,screen;',
    size: '88',
    pos: {
      x: -450,
      y: -250
    },
    iconScale: 1.5
  },
  {
    name: 'iOS',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M2.09 16.8h1.66V9.76H2.09m.83-.92a.9.9 0 0 0 .92-.9c0-.5-.4-.9-.92-.9a.9.9 0 0 0-.92.9c0 .5.4.9.92.9m6.33-1.78C6.46 7.06 4.7 8.96 4.7 12c0 3.06 1.76 4.96 4.55 4.96s4.55-1.9 4.55-4.96c0-3.04-1.76-4.94-4.55-4.94m0 1.44c1.71 0 2.8 1.37 2.8 3.5c0 2.15-1.09 3.5-2.8 3.5c-1.71 0-2.79-1.35-2.79-3.5c0-2.13 1.08-3.5 2.79-3.5m5.25 5.61c.07 1.76 1.5 2.85 3.72 2.85c2.32 0 3.78-1.14 3.78-2.96c0-1.43-.82-2.23-2.77-2.68l-1.1-.25c-1.18-.28-1.66-.65-1.66-1.29c0-.78.73-1.33 1.81-1.33c1.1 0 1.85.55 1.93 1.44h1.63c-.04-1.69-1.43-2.83-3.55-2.83c-2.08 0-3.56 1.15-3.56 2.85c0 1.37.83 2.22 2.6 2.62l1.24.29c1.21.29 1.7.68 1.7 1.38c0 .8-.8 1.37-1.96 1.37s-2.05-.57-2.15-1.46H14.5Z"/></svg>',
    color: 'background-color: #DCD9F4; background-image: linear-gradient(to bottom, rgba(255,255,255,0.50) 0%, rgba(0,0,0,0.50) 100%), radial-gradient(at 50% 0%, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.50) 50%); background-blend-mode: soft-light,screen;',
    size: '64',
    pos: {
      x: 450,
      y: 300
    },
    iconScale: 1.5
  }
]
</script>

<style lang="scss">
.TouchBubbles-Bubble-Icon {
  position: absolute;

  left: 50%;
  top: 50%;

  filter: drop-shadow(0 0 10px rgba(50, 50, 50, .5));
  transform: translate(-50%, -50%) scale(var(--iconScale, 1));
}

.TouchBubbles-Bubble {
  &:hover {
    --scale: 1.25;
  }
  position: absolute;

  aspect-ratio: 1 / 1;

  left: 50%;
  top: 55%;

  transform: translate(-500%, -280%);
  border-radius: 50%;
  transition: .25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, .25));
}

.TouchBubbles-Container {
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

}
</style>
