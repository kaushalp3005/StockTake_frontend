import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "../backend";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  root: ".",
  server: {
    host: "::",
    port: 3000,
    fs: {
      allow: [".."],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  publicDir: "public",
  build: {
    outDir: "../dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@shared": path.resolve(__dirname, "../backend/shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  // Removed - backend runs separately on port 8000
  return {
    name: "express-plugin",
    apply: "serve",
    configureServer() {
      // Backend runs separately, no need to integrate here
    },
  };
}
