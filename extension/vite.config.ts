import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "path";
import baseManifest from "./manifest.json";

// Dev mode adds localhost host_permissions + connect-src so the extension can
// hit a local FastAPI. Production manifest stays HTTPS-only for security.
function manifestForMode(mode: string) {
  if (mode !== "development") return baseManifest;

  const localHosts = ["http://localhost:8000/*", "http://127.0.0.1:8000/*"];
  const localConnect = ["http://localhost:8000", "http://127.0.0.1:8000"];

  return {
    ...baseManifest,
    host_permissions: [...baseManifest.host_permissions, ...localHosts],
    content_security_policy: {
      ...baseManifest.content_security_policy,
      extension_pages: baseManifest.content_security_policy.extension_pages.replace(
        "connect-src 'self'",
        `connect-src 'self' ${localConnect.join(" ")}`,
      ),
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), crx({ manifest: manifestForMode(mode) as typeof baseManifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
}));
