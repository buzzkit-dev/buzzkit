import { index, layout, type RouteConfig, route } from '@react-router/dev/routes';

export default [
  index('routes/index.tsx'),
  layout('routes/(auth)/layout.tsx', [
    route('login', 'routes/(auth)/login/index.tsx'),
    route('signup', 'routes/(auth)/signup/index.tsx'),
  ]),
  route('onboarding', 'routes/onboarding/index.tsx'),
  route('invite/:token', 'routes/invite/[token]/index.tsx'),
  route('ui', 'routes/ui/index.tsx'),
  route('design.md', 'routes/design.md/index.ts'),
  route(':slug/onboarding/*', 'routes/[slug]/onboarding/index.tsx'),
  route(':slug', 'routes/[slug]/layout.tsx', [
    index('routes/[slug]/index.tsx'),
    route('settings', 'routes/[slug]/settings/layout.tsx', [index('routes/[slug]/settings/index.tsx')]),
  ]),
] satisfies RouteConfig;
