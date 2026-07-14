import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    watch: {
      // Needed for file changes on Docker Desktop (Windows/Mac bind mounts)
      usePolling: process.env.VITE_USE_POLLING === "true",
    },
  },
});

