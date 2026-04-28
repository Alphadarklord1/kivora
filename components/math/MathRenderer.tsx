'use client';

import { useEffect, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { formatMathExpression } from '@/lib/math/latex';

interface MathRendererProps {
  math: string;
  display?: boolean; // true for display mode (centered, larger), false for inline
  className?: string;
}

// Render mixed text and math (text with $math$ or $$math$$ blocks)
function renderMixedContent(content: string): { type: 'text' | 'math' | 'display-math'; content: string }[] {
  const parts: { type: 'text' | 'math' | 'display-math'; content: string }[] = [];

  // Match $$...$$ for display math and $...$ for inline math
  const regex = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }

    // Add the math
    const mathContent = match[0];
    if (mathContent.startsWith('$$')) {
      parts.push({ type: 'display-math', content: mathContent.slice(2, -2) });
    } else {
      parts.push({ type: 'math', content: mathContent.slice(1, -1) });
    }

    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts;
}

// Single math expression component
export function MathRenderer({ math, display = false, className = '' }: MathRendererProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  const latex = useMemo(() => formatMathExpression(math), [math]);

  useEffect(() => {
    if (!containerRef.current) return;
    try {
      katex.render(latex, containerRef.current, {
        displayMode: display,
        throwOnError: false,
        errorColor: '#cc0000',
        trust: true,
        strict: false,
      });
      // Defensive: if KaTeX silently produced nothing visible (rare but
      // happens with malformed input + throwOnError:false), fall back to
      // the raw text so the user always sees something.
      const html = containerRef.current.innerHTML.trim();
      if (!html) containerRef.current.textContent = math;
    } catch {
      if (containerRef.current) containerRef.current.textContent = math;
    }
  }, [latex, display, math]);

  return (
    <span
      ref={containerRef}
      className={`math-renderer ${display ? 'math-display' : 'math-inline'} ${className}`}
    />
  );
}

// Component for rendering text that may contain math expressions
interface MathTextProps {
  children: string;
  className?: string;
}

export function MathText({ children, className = '' }: MathTextProps) {
  const parts = useMemo(() => renderMixedContent(children), [children]);

  return (
    <span className={`math-text ${className}`}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return <span key={index}>{part.content}</span>;
        } else if (part.type === 'display-math') {
          return (
            <span key={index} style={{ display: 'block', textAlign: 'center', margin: '0.5em 0' }}>
              <MathRenderer math={part.content} display={true} />
            </span>
          );
        } else {
          return <MathRenderer key={index} math={part.content} />;
        }
      })}
    </span>
  );
}

export { formatMathExpression } from '@/lib/math/latex';
