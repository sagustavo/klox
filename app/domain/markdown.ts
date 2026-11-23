/**
 * Pure, zero-dependency, XSS-safe basic Markdown renderer for Task descriptions (ADR-0007).
 * Escapes all raw HTML first, then transforms headings, bold, italic, inline code,
 * links (http/https only), bullet lists, and task checkboxes (- [ ] / - [x]).
 */

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(escapedLine: string): string {
  return (
    escapedLine
      // Inline code: `code`
      .replace(
        /`([^`]+)`/g,
        '<code class="border border-border-hairline bg-bg-primary px-1 py-0.5 font-mono text-xs text-accent">$1</code>'
      )
      // Bold: **text**
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-text-primary">$1</strong>')
      // Italic: *text*
      .replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
      // Safe HTTP(S) Links: [label](https://...)
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent underline hover:opacity-80">$1</a>'
      )
  );
}

export function renderBasicMarkdown(markdown: string | undefined | null): string {
  if (!markdown || !markdown.trim()) return '';

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const htmlBlocks: string[] = [];
  let inList = false;

  const closeListIfOpen = () => {
    if (inList) {
      htmlBlocks.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      closeListIfOpen();
      continue;
    }

    const escaped = escapeHtml(trimmed);

    // Headings (#, ##, ###)
    if (escaped.startsWith('### ')) {
      closeListIfOpen();
      htmlBlocks.push(
        `<h4 class="font-semibold text-text-primary text-xs mt-1.5">${renderInlineMarkdown(escaped.slice(4))}</h4>`
      );
      continue;
    }
    if (escaped.startsWith('## ')) {
      closeListIfOpen();
      htmlBlocks.push(
        `<h3 class="font-semibold text-text-primary text-xs uppercase tracking-wider mt-2">${renderInlineMarkdown(escaped.slice(3))}</h3>`
      );
      continue;
    }
    if (escaped.startsWith('# ')) {
      closeListIfOpen();
      htmlBlocks.push(
        `<h2 class="font-semibold text-text-primary text-sm mt-2">${renderInlineMarkdown(escaped.slice(2))}</h2>`
      );
      continue;
    }

    // Checklist items: - [ ] or - [x]
    const uncheckedMatch = /^[-*]\s+\[\s\]\s+(.*)$/.exec(escaped);
    if (uncheckedMatch) {
      if (!inList) {
        htmlBlocks.push('<ul class="space-y-1 my-1">');
        inList = true;
      }
      htmlBlocks.push(
        `<li class="flex items-start gap-1.5"><span class="text-text-muted">☐</span><span>${renderInlineMarkdown(uncheckedMatch[1] ?? '')}</span></li>`
      );
      continue;
    }

    const checkedMatch = /^[-*]\s+\[[xX]\]\s+(.*)$/.exec(escaped);
    if (checkedMatch) {
      if (!inList) {
        htmlBlocks.push('<ul class="space-y-1 my-1">');
        inList = true;
      }
      htmlBlocks.push(
        `<li class="flex items-start gap-1.5 text-text-muted line-through"><span class="text-accent">☑</span><span>${renderInlineMarkdown(checkedMatch[1] ?? '')}</span></li>`
      );
      continue;
    }

    // Standard bullet list: - item or * item
    const bulletMatch = /^[-*]\s+(.*)$/.exec(escaped);
    if (bulletMatch) {
      if (!inList) {
        htmlBlocks.push('<ul class="list-disc list-inside space-y-0.5 my-1">');
        inList = true;
      }
      htmlBlocks.push(`<li>${renderInlineMarkdown(bulletMatch[1] ?? '')}</li>`);
      continue;
    }

    closeListIfOpen();
    htmlBlocks.push(`<p class="leading-relaxed">${renderInlineMarkdown(escaped)}</p>`);
  }

  closeListIfOpen();
  return htmlBlocks.join('\n');
}
