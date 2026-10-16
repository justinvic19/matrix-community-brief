import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  // Relative assets work at both a GitHub Pages repository path and a custom domain.
  // Revisit this if the app gains history-based client-side routes.
  base: './',
  plugins: [react()],
  test: { environment: 'jsdom', clearMocks: true },
});
