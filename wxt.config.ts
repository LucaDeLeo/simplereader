import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Content Security Policy - REQUIRED for Kokoro TTS (WebAssembly)
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    // Minimal permissions per NFR8
    permissions: [
      'activeTab',  // Access current tab for content extraction
      'storage',    // Persist user preferences
      'offscreen',  // Create offscreen document for TTS
    ],
  },
});
