/** Unit tests for the Creative plugins; client specs select jsdom with a per-file @vitest-environment pragma. */
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './scripts/vitest-shared.ts'
import { upstreamClientSource } from './scripts/vitest-upstream-client.ts'

export default defineConfig({
  resolve: {
    alias: {
      '@winterhuan/dsh-story/client': new URL('./packages/creative/story/src/client/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-story': new URL('./packages/creative/story/src/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-short-drama/client': new URL('./packages/creative/short-drama/src/client/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-short-drama': new URL('./packages/creative/short-drama/src/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-video-recap/client': new URL('./packages/creative/video-recap/src/client/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-video-recap': new URL('./packages/creative/video-recap/src/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-novel-to-game/client': new URL('./packages/creative/novel-to-game/src/client/index.ts', import.meta.url).pathname,
      '@winterhuan/dsh-novel-to-game': new URL('./packages/creative/novel-to-game/src/index.ts', import.meta.url).pathname,
    },
  },
  plugins: [standardDecoratorPlugin(), upstreamClientSource()],
  test: {
    include: ['packages/*/*/tests/**/*.spec.{ts,tsx}'],
    setupFiles: ['./scripts/test-dom-environment.ts'],
    pool: 'forks',
    execArgv: vitestExecArgv,
    testTimeout: 30_000,
    // DSH client packages import CSS and client source subpaths that only Vite and the plugin above can resolve.
    server: { deps: { inline: [/@deepseek-ai\/dsh-client-/] } },
  },
})
