import type { PingInput } from './types';

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  claude: 'Claude',
  anthropic: 'Claude',
  codex: 'Codex',
  openai: 'OpenAI',
  chatgpt: 'ChatGPT',
  cursor: 'Cursor',
  copilot: 'Copilot',
  'github-copilot': 'Copilot',
  gemini: 'Gemini',
  'gemini-cli': 'Gemini CLI',
  jules: 'Jules',
  windsurf: 'Windsurf',
  zed: 'Zed',
  replit: 'Replit',
  warp: 'Warp',
  v0: 'v0',
  vercel: 'Vercel',
  junie: 'Junie',
  jetbrains: 'JetBrains AI',
  mistral: 'Mistral',
  vibe: 'Mistral Vibe',
  deepseek: 'DeepSeek',
  grok: 'Grok',
  cline: 'Cline',
  roo: 'Roo Code',
  'roo-code': 'Roo Code',
  kilo: 'Kilo Code',
  opencode: 'OpenCode',
  qwen: 'Qwen',
  'qwen-code': 'Qwen Code',
  perplexity: 'Perplexity',
  huggingface: 'Hugging Face',
  ollama: 'Ollama',
  amp: 'Amp',
  trae: 'Trae',
  aider: 'Aider',
};

export function resolveAgentLabel(agent: string): string {
  const known = AGENT_LABELS[agent.toLowerCase().replace(/[_\s]+/g, '-')];
  if (known) return known;

  return agent
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

export function resolveSubtitle(input: Pick<PingInput, 'agent' | 'project'>): string | null {
  const parts = [input.agent ? resolveAgentLabel(input.agent) : null, input.project].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}
