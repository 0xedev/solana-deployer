import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      exclude: [],
      // Whether to polyfill `global`.
      globals: {
        Buffer: true, // Provide a global Buffer polyfill.
        global: true, // Provide a global `global` polyfill.
        process: true, // Provide a global `process` polyfill.
      },
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
});
