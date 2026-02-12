import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "Dijital Esnaf Defteri",
        short_name: "Esnaf Defteri",
        description: "Gelir-gider, fatura ve kasa takibi.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        lang: "tr",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        runtimeCaching: [
          // Backend API'yi cache'leme (stale data istemiyoruz)
          {
            urlPattern: ({ url }) =>
              url.origin.includes("127.0.0.1:8000") || url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
