import { memo } from 'react';

interface Props {
  content: string;
}

function MarkdownComponent({ content }: Props) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';

  const parseInline = (text: string): React.ReactNode[] => {
    // Regex matches inline code `code`, bold **bold**, italics *italics*
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={idx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={idx}>{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={idx} className="inline-code">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  lines.forEach((line, lineIdx) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${lineIdx}`} className="code-block">
            {codeBlockLang && <div className="code-lang-label">{codeBlockLang}</div>}
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        codeBlockLang = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      elements.push(<p key={lineIdx}>{parseInline(line)}</p>);
    }
  });

  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key="code-unclosed" className="code-block">
        {codeBlockLang && <div className="code-lang-label">{codeBlockLang}</div>}
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="markdown">{elements}</div>;
}

export const Markdown = memo(MarkdownComponent);
