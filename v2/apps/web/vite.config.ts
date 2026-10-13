import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunk: app updates don't invalidate the cached libraries.
        // One vendor chunk for all libraries: splitting React from the libraries that use it
        // created a circular chunk import that broke React 19 at startup.
        manualChunks(id) {
          return id.includes("node_modules") ? "vendor" : undefined;
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], globals: true },
});
