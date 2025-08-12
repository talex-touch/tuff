import { defineConfig  } from "vitest/dist/config";

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
})