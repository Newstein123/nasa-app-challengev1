import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import viteReact from '@vitejs/plugin-react'

// Nitro produces the server output for the host: Vercel is detected
// automatically on Vercel builds; locally it builds a Node server in .output/.
export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact()],
})
