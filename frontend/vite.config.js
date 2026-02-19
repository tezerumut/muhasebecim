import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      // 🔥 FIX: İkonları zorunlu olmaktan çıkar
      includeAssets: [],
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
        // 🔥 FIX: Basit inline ikon (base64)
        icons: [
          {
            src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%230b1220'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='200' fill='%23fff' text-anchor='middle' dominant-baseline='middle'%3E₺%3C/text%3E%3C/svg%3E",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // 🔥 FIX: Glob pattern'i daha spesifik yap
        globPatterns: ["**/*.{js,css,html,ico,svg}"],
        // 🔥 FIX: Sadece backend API'yi NetworkOnly yap
        runtimeCaching: [
          {
            urlPattern: ({ url }) => {
              // Backend API çağrıları
              return url.hostname.includes("muhasebecim-backend") || 
                     url.hostname.includes("onrender.com") ||
                     url.pathname.startsWith("/api/");
            },
            handler: "NetworkOnly",
          },
          {
            // Statik dosyalar için cache
            urlPattern: /\.(?:js|css|html)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "static-resources",
            },
          },
        ],
        // 🔥 FIX: Hata veren dosyaları ignore et
        navigateFallbackDenylist: [
          /^\/api\//,
          /pwa-.*\.png$/,
          /manifest\.webmanifest$/
        ],
      },
      // 🔥 FIX: Development'ta PWA'yi devre dışı bırak
      devOptions: {
        enabled: false
      }
    }),
  ],
  server: {
    port: 5173,
  },
});