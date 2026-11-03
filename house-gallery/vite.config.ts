import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 120_000 },
});
