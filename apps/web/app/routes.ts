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
    route('subscribers', 'routes/[slug]/subscribers/index.tsx'),
    route('topics', 'routes/[slug]/topics/index.tsx'),
    route('messages', 'routes/[slug]/messages/index.tsx'),
    route('messages/:id', 'routes/[slug]/messages/[id]/index.tsx'),
    route('events', 'routes/[slug]/events/index.tsx'),
    route('keys', 'routes/[slug]/keys/index.tsx'),
    route('subscribers/:externalId', 'routes/[slug]/subscribers/[externalId]/index.tsx'),
    route('settings', 'routes/[slug]/settings/layout.tsx', [index('routes/[slug]/settings/index.tsx')]),
    route('*', 'routes/[slug]/planned/index.tsx'),
  ]),
] satisfies RouteConfig;
