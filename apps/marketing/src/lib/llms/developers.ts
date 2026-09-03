import { site } from '../site';

export function renderDevelopersIndex(): string {
  return `# BuzzKit for developers

> The integration surface of BuzzKit, the open source notification orchestration layer: the API, its OpenAPI document, authentication, the SDKs and the files agents read.

- [Developer hub](${site.url}/developers.md): quickstart, keys and scopes, reference, SDKs, sandbox
- [Authentication](${site.url}/auth.md): how to obtain, send and revoke API keys, with every error code
- [OpenAPI document](${site.url}/openapi.json): every /v1 operation with its scope and schemas
- [API catalog](${site.url}/.well-known/api-catalog): the RFC 9727 linkset
- [Documentation](${site.docsUrl}): guides and the reference for every resource
- [iOS SDK](${site.iosDocsUrl}): registration, identity, events, action buttons, Live Activities
- [Integration skill](${site.url}/.well-known/agent-skills/buzzkit/SKILL.md): the steps packaged for coding agents
- Everything on the site: ${site.url}/llms.txt
`;
}
