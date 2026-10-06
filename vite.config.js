import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';

function dashboardApiPlugin() {
  let supabaseAdmin = null;

  return {
    name: 'dashboard-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/dashboard-registrations' && req.method === 'GET') {
          try {
            if (!supabaseAdmin) {
              const env = loadEnv('development', process.cwd(), '');
              const url = env.VITE_SUPABASE_URL || 'https://rkmzrgektehctcozagnk.supabase.co';
              const key = env.SUPABASE_SERVICE_ROLE_KEY;
              if (url && key) {
                supabaseAdmin = createClient(url, key, {
                  auth: { persistSession: false, autoRefreshToken: false },
                });
              }
            }

            if (!supabaseAdmin) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Supabase admin client not initialized' }));
              return;
            }

            const { data, error } = await supabaseAdmin
              .from('registrations')
              .select(
                'id, registration_code, selected_day, status, created_at, payments(status), selected_event_registrations(event_id, events(id, code, name, day, event_type)), special_event_registrations(special_event_id, special_events(id, code, name))'
              )
              .order('created_at', { ascending: true });

            if (error) throw error;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data || []));
            return;
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dashboardApiPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-qr': ['html5-qrcode', 'qrcode'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
