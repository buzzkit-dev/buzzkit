import { cloudflare } from '@cloudflare/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const ESM_ENV_BROWSER = 'esm-env/browser';
const ESM_ENV_BROWSER_FALSE = '\0esm-env-browser:false';

function serverIsNotBrowser(): Plugin {
  return {
    name: 'buzzkit:esm-env-server',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'ssr',
    resolveId: (id) => (id === ESM_ENV_BROWSER ? ESM_ENV_BROWSER_FALSE : null),
    load: (id) => (id === ESM_ENV_BROWSER_FALSE ? 'export default false;' : null),
  };
}

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' }, inspectorPort: false }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    serverIsNotBrowser(),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router'],
  },
  environments: {
    ssr: {
      optimizeDeps: {
        exclude: ['@number-flow/react', 'number-flow', 'esm-env'],
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router',
      'motion/react',
      '@number-flow/react',
      'better-auth/client',
      'better-auth/client/plugins',
      'clsx',
      'tailwind-merge',
      'class-variance-authority',
      'sonner',
      'vaul',
      '@base-ui/react/alert-dialog',
      '@base-ui/react/avatar',
      '@base-ui/react/button',
      '@base-ui/react/checkbox',
      '@base-ui/react/dialog',
      '@base-ui/react/input',
      '@base-ui/react/menu',
      '@base-ui/react/merge-props',
      '@base-ui/react/popover',
      '@base-ui/react/radio',
      '@base-ui/react/radio-group',
      '@base-ui/react/scroll-area',
      '@base-ui/react/select',
      '@base-ui/react/separator',
      '@base-ui/react/switch',
      '@base-ui/react/tabs',
      '@base-ui/react/tooltip',
      '@base-ui/react/use-render',
    ],
  },
});
