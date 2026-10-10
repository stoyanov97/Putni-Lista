import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // pdfmake и exceljs са големи, но се зареждат чак при експорт.
  build: { chunkSizeWarningLimit: 1500 },
})
