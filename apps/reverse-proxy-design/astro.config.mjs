import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://tuff-reverse-proxy-design.tagzxia.com',
  output: 'static',
  build: {
    format: 'directory',
  },
})
