import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { ensureAuthToken } from "./server/auth-token";

const AUTH_TOKEN = ensureAuthToken();

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5174",
        // Rewrite Host → 127.0.0.1:5174 so the backend's strict Host allowlist
        // passes. The backend still validates the Origin header for browser
        // requests separately.
        changeOrigin: true,
      },
    },
  },
  define: {
    // Injected at build time so the browser can authenticate to our backend.
    __AUTH_TOKEN__: JSON.stringify(AUTH_TOKEN),
  },
});
