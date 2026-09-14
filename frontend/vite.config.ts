import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [react(), cesium()],
  server: {
    port: 5173,
    host: true,
    headers: {
      "Content-Disposition": "inline",
    },
    watch: {
      // Needed for file changes on Docker Desktop (Windows/Mac bind mounts)
      usePolling: process.env.VITE_USE_POLLING === "true",
    },
  },
});
