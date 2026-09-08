type FaqAnswerPart = {
  start: number;
  text: string;
  href?: string;
};

export function parseFaqAnswer(answer: string): FaqAnswerPart[] {
  const parts: FaqAnswerPart[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  for (const match of answer.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) {
      parts.push({ start: last, text: answer.slice(last, index) });
    }
    parts.push({ start: index, text: match[1] ?? '', href: match[2] });
    last = index + match[0].length;
  }
  if (last < answer.length) {
    parts.push({ start: last, text: answer.slice(last) });
  }
  return parts;
}

export function plainFaqAnswer(answer: string): string {
  return parseFaqAnswer(answer)
    .map((part) => part.text)
    .join('');
}

export function absolutizeFaqLinks(answer: string, origin: string): string {
  return parseFaqAnswer(answer)
    .map((part) => {
      if (!part.href) {
        return part.text;
      }
      const href = part.href.startsWith('/') ? `${origin}${part.href}` : part.href;
      return `[${part.text}](${href})`;
    })
    .join('');
}
