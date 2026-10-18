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
        // The heavy export libraries (Excel, PDF, page capture) stay out of it: they are imported
        // only when a file is made, so they load then and not with every page.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            /[\\/]node_modules[\\/](\.pnpm[\\/])?(exceljs|jspdf|modern-screenshot|html2canvas|canvg|dompurify|core-js|fflate|jszip)/.test(
              id,
            )
          )
            return undefined;
          return "vendor";
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], globals: true },
});
