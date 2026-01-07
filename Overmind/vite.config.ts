import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 1111,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'https://chat.hindley.tech',
          changeOrigin: true,
          secure: false, // Accept self-signed certs just in case
        }
      },
    },
    plugins: [
      react(),
      {
        name: 'log-usage-middleware',
        configureServer(server) {
          server.middlewares.use('/log-usage', (req, res, next) => {
            if (req.method === 'POST') {
              let body = '';
              req.on('data', chunk => {
                body += chunk.toString();
              });
              req.on('end', () => {
                const logEntry = `[${new Date().toISOString()}] ${body}\n`;
                fs.appendFileSync(path.resolve(__dirname, 'ai_usage.log'), logEntry);
                res.statusCode = 200;
                res.end('Logged');
              });
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
