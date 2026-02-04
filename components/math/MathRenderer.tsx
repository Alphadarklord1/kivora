'use client';

import { useEffect, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRendererProps {
  math: string;
  display?: boolean; // true for display mode (centered, larger), false for inline
  className?: string;
}

// Convert common text notation to LaTeX
function textToLatex(text: string): string {
  let latex = text;

  // Handle fractions: a/b -> \frac{a}{b}
  // Match patterns like 3/4, (x+1)/(x-1), etc.
  latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
  latex = latex.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');
  latex = latex.replace(/([a-zA-Z])\/([a-zA-Z\d])/g, '\\frac{$1}{$2}');

  // Handle exponents: x^2, x^{10}, 2^3
  latex = latex.replace(/\^(\d+)/g, '^{$1}');
  latex = latex.replace(/\^([a-zA-Z])/g, '^{$1}');

  // Handle square roots: sqrt(x) -> \sqrt{x}
  latex = latex.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');

  // Handle nth roots: cbrt(x) -> \sqrt[3]{x}, nthroot(n,x)
  latex = latex.replace(/cbrt\(([^)]+)\)/gi, '\\sqrt[3]{$1}');
  latex = latex.replace(/nthroot\((\d+),\s*([^)]+)\)/gi, '\\sqrt[$1]{$2}');

  // Handle common functions
  latex = latex.replace(/\bsin\b/g, '\\sin');
  latex = latex.replace(/\bcos\b/g, '\\cos');
  latex = latex.replace(/\btan\b/g, '\\tan');
  latex = latex.replace(/\bcot\b/g, '\\cot');
  latex = latex.replace(/\bsec\b/g, '\\sec');
  latex = latex.replace(/\bcsc\b/g, '\\csc');
  latex = latex.replace(/\barcsin\b/gi, '\\arcsin');
  latex = latex.replace(/\barccos\b/gi, '\\arccos');
  latex = latex.replace(/\barctan\b/gi, '\\arctan');
  latex = latex.replace(/\bln\b/g, '\\ln');
  latex = latex.replace(/\blog\b/g, '\\log');
  latex = latex.replace(/\bexp\b/g, '\\exp');
  latex = latex.replace(/\blim\b/g, '\\lim');
  latex = latex.replace(/\bsum\b/gi, '\\sum');
  latex = latex.replace(/\bprod\b/gi, '\\prod');

  // Handle Greek letters
  latex = latex.replace(/\balpha\b/gi, '\\alpha');
  latex = latex.replace(/\bbeta\b/gi, '\\beta');
  latex = latex.replace(/\bgamma\b/gi, '\\gamma');
  latex = latex.replace(/\bdelta\b/gi, '\\delta');
  latex = latex.replace(/\bepsilon\b/gi, '\\epsilon');
  latex = latex.replace(/\btheta\b/gi, '\\theta');
  latex = latex.replace(/\blambda\b/gi, '\\lambda');
  latex = latex.replace(/\bmu\b/gi, '\\mu');
  latex = latex.replace(/\bpi\b/gi, '\\pi');
  latex = latex.replace(/\bsigma\b/gi, '\\sigma');
  latex = latex.replace(/\bphi\b/gi, '\\phi');
  latex = latex.replace(/\bomega\b/gi, '\\omega');

  // Handle infinity
  latex = latex.replace(/\binfinity\b/gi, '\\infty');
  latex = latex.replace(/\binf\b/gi, '\\infty');

  // Handle integrals: int or integral
  latex = latex.replace(/\bintegral\b/gi, '\\int');
  latex = latex.replace(/\bint\b/g, '\\int');

  // Handle derivatives: d/dx -> \frac{d}{dx}
  latex = latex.replace(/d\/d([a-zA-Z])/g, '\\frac{d}{d$1}');
  latex = latex.replace(/dy\/dx/g, '\\frac{dy}{dx}');
  latex = latex.replace(/d\^2y\/dx\^2/g, '\\frac{d^2y}{dx^2}');

  // Handle partial derivatives
  latex = latex.replace(/∂/g, '\\partial');
  latex = latex.replace(/partial/gi, '\\partial');

  // Handle multiplication (convert * to cdot for clarity)
  latex = latex.replace(/\*/g, ' \\cdot ');

  // Handle plus/minus
  latex = latex.replace(/\+-/g, '\\pm');
  latex = latex.replace(/±/g, '\\pm');

  // Handle arrows
  latex = latex.replace(/->/g, '\\rightarrow');
  latex = latex.replace(/=>/g, '\\Rightarrow');
  latex = latex.replace(/approaches/gi, '\\rightarrow');

  // Handle comparisons
  latex = latex.replace(/<=/g, '\\leq');
  latex = latex.replace(/>=/g, '\\geq');
  latex = latex.replace(/!=/g, '\\neq');
  latex = latex.replace(/~=/g, '\\approx');

  // Handle absolute value |x| -> \left|x\right|
  latex = latex.replace(/\|([^|]+)\|/g, '\\left|$1\\right|');

  // Handle matrices: [[a,b],[c,d]]
  const matrixMatch = latex.match(/\[\[([^\]]+)\](,\s*\[[^\]]+\])*\]/);
  if (matrixMatch) {
    const matrixStr = matrixMatch[0];
    const rows = matrixStr.match(/\[([^\]]+)\]/g);
    if (rows) {
      const matrixContent = rows
        .map(row => row.replace(/[\[\]]/g, '').split(',').join(' & '))
        .join(' \\\\ ');
      latex = latex.replace(matrixStr, `\\begin{bmatrix} ${matrixContent} \\end{bmatrix}`);
    }
  }

  return latex;
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

  const latex = useMemo(() => textToLatex(math), [math]);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(latex, containerRef.current, {
          displayMode: display,
          throwOnError: false,
          errorColor: '#cc0000',
          trust: true,
          strict: false,
        });
      } catch (error) {
        // If KaTeX fails, just show the original text
        if (containerRef.current) {
          containerRef.current.textContent = math;
        }
      }
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

// Utility to convert expression to display-ready format
export function formatMathExpression(expr: string): string {
  // If already has LaTeX commands, return as-is
  if (expr.includes('\\')) {
    return expr;
  }
  return textToLatex(expr);
}
