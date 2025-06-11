import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    nodePolyfills({
      // To exclude specific polyfills, add them to this list.
      // By default, it includes polyfills for most Node.js globals.
      exclude: [],
      // Whether to polyfill `global`.
      globals: {
        Buffer: true, // Provide a global Buffer polyfill.
        global: true,
        process: true, // Optional: Some libraries might need process.
      },
      // Whether to polyfill `node:` protocol imports.
      protocolImports: true,
    }),
  ],
});
