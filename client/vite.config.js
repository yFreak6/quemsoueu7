import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Em desenvolvimento, o Vite encaminha o Socket.io para o servidor (porta 3001).
// Assim o cliente usa sempre a mesma origem e não precisa de CORS.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // three/R3F mudam raramente: em chunk separado ficam em cache entre versões do jogo
        manualChunks: { three: ['three'], r3f: ['@react-three/fiber', '@react-three/drei'], react: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    host: true, // permite abrir pelo IP da rede (outros dispositivos)
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
