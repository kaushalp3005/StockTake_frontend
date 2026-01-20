import { defineConfig, loadEnv, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Check if VITE_API_URL is set (for external backend like Render)
  const useExternalBackend = env.VITE_API_URL;
  
  return {
    root: ".",
    server: {
      host: "::",
      port: 3000,
      fs: {
        allow: [".."],
        deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
      },
      // Only use proxy if not using external backend
      ...(useExternalBackend ? {} : {
        proxy: {
          "/api": {
            target: "http://localhost:8000",
            changeOrigin: true,
          },
        },
      }),
    },
  publicDir: "public",
  build: {
    // For standalone Netlify deploys, keep build output inside the frontend repo
    outDir: "dist",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  };
});

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
