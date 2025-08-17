import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Ensure assets are served from the repository subpath on GitHub Pages
  // and locally available at http://localhost:5173/virus.exe/
  base: '/virus.exe/',
  plugins: [react()],
});
