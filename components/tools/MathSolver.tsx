'use client';

import { useEffect, useRef, useState } from 'react';
import { MathRenderer, MathText } from '@/components/math/MathRenderer';
import { solveOffline, MathSolution, MathStep } from '@/lib/math/offline-solver';
import { useI18n } from '@/lib/i18n/useI18n';

interface VerificationResult {
  isLikelyCorrect: boolean;
  confidence: 'high' | 'medium' | 'low';
  sources: {
    title: string;
    url: string;
    snippet: string;
    agrees: boolean;
  }[];
  explanation: string;
}

interface MathSolverProps {
  onGraphExpression?: (expression: string) => void;
}

export function MathSolver({ onGraphExpression }: MathSolverProps = {}) {
  const { t } = useI18n({
    'Please enter a math problem': 'يرجى إدخال مسألة رياضية',
    'Matrix inputs are best handled in MATLAB Lab. Switch to the MATLAB Lab tool.': 'إدخالات المصفوفات تُعالج بشكل أفضل في MATLAB Lab. انتقل إلى أداة MATLAB Lab.',
    'Failed to solve': 'تعذر الحل',
    'Failed to solve problem': 'تعذر حل المسألة',
    'Verification failed': 'فشل التحقق',
    'Failed to verify answer': 'تعذر التحقق من الإجابة',
    'Math Solver': 'محلل الرياضيات',
    'Offline': 'بدون إنترنت',
    'Calculus, Algebra, Arithmetic & more': 'تفاضل وتكامل، جبر، حساب والمزيد',
    'Reset': 'إعادة ضبط',
    'Offline Mode': 'وضع بدون إنترنت',
    'AI Mode': 'وضع الذكاء الاصطناعي',
    'MATLAB Syntax Mode': 'وضع صياغة MATLAB',
    'Enabled': 'مفعّل',
    'Disabled': 'معطل',
    'Try an example:': 'جرّب مثالًا:',
    'MATLAB-ready templates:': 'قوالب جاهزة لـ MATLAB:',
    'Enter your math problem:': 'أدخل المسألة الرياضية:',
    'Examples:': 'أمثلة:',
    'Supports MATLAB style: `.^`, `.*`, `./` and standard math (`x^2`, `sqrt()`).': 'يدعم صياغة MATLAB مثل `.^`, `.*`, `./` والرياضيات القياسية (`x^2`, `sqrt()`).',
    'Structured input': 'إدخال منظم',
    'Use the built-in math keyboard for fractions, roots, exponents, and integrals.': 'استخدم لوحة الرياضيات المدمجة للكسور والجذور والأسس والتكاملات.',
    'Type with MathLive': 'اكتب باستخدام MathLive',
    'Type a math problem': 'اكتب مسألة رياضية',
    'Preview:': 'معاينة:',
    'Solving...': 'جارٍ الحل...',
    'Solve Problem': 'حل المسألة',
    'Solved Offline': 'تم الحل بدون إنترنت',
    'Problem': 'المسألة',
    'Step-by-Step Solution': 'حل خطوة بخطوة',
    'Final Answer': 'الإجابة النهائية',
    'Verifying...': 'جارٍ التحقق...',
    'Verify Answer (Web Search)': 'تحقق من الإجابة (بحث ويب)',
    'Could not verify': 'تعذر التحقق',
    'Copy Solution': 'نسخ الحل',
    'New Problem': 'مسألة جديدة',
    'Graph this': 'ارسمها',
    'Try with AI': 'جرّب بالذكاء الاصطناعي',
    'Likely Correct ({confidence} confidence)': 'غالبًا صحيحة (ثقة {confidence})',
    'AI mode uses OpenAI for complex problems like Linear Algebra, Series, and advanced Calculus. Requires API key in settings.': 'يستخدم وضع الذكاء الاصطناعي OpenAI للمسائل المعقدة مثل الجبر الخطي والمتسلسلات والتفاضل المتقدم. يتطلب مفتاح API في الإعدادات.',
    'Problem:': 'المسألة:',
    'Type:': 'النوع:',
    'Solution:': 'الحل:',
    'Step {n}:': 'الخطوة {n}:',
    Derivative: 'مشتقة',
    Integral: 'تكامل',
    Quadratic: 'تربيعية',
    Linear: 'خطية',
    Arithmetic: 'حسابية',
    'Trig Derivative': 'مشتقة مثلثية',
    Limit: 'نهاية',
    'Polynomial Root': 'جذر متعدد حدود',
    'Series Sum': 'مجموع متسلسلة',
    'Linear Solve': 'حل خطي',
    'Matrix Hint': 'تلميح مصفوفة',
    'Definite Integral': 'تكامل محدد',
    'Fraction': 'كسر',
    'Parentheses': 'أقواس',
    'Integral with bounds': 'تكامل بحدود',
    'Use AI mode for detailed solution': 'استخدم وضع الذكاء الاصطناعي للحصول على حل تفصيلي',
    arithmetic: 'حسابية',
    derivative: 'مشتقة',
    integral: 'تكامل',
    limit: 'نهاية',
    quadratic: 'تربيعية',
    'linear-equation': 'معادلة خطية',
    'polynomial-root': 'جذر متعدد حدود',
    'series-sum': 'مجموع متسلسلة',
  });
  const [problem, setProblem] = useState('');
  const [solution, setSolution] = useState<MathSolution | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [solving, setSolving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [useAI, setUseAI] = useState(false);
  const [matlabMode, setMatlabMode] = useState(true);
  const mathfieldHostRef = useRef<HTMLDivElement | null>(null);
  const mathfieldRef = useRef<any>(null);
  const syncingMathfieldRef = useRef(false);
  const aiDetailFallback = t('Use AI mode for detailed solution');

  const normalizeMatlabSyntax = (input: string) => {
    let out = input;
    out = out.replace(/\.\*/g, '*').replace(/\.\//g, '/').replace(/\.\^/g, '^');
    out = out.replace(/\bpi\b/gi, 'pi');
    out = out.replace(/(\d)\s+(\d)/g, '$1*$2');
    return out;
  };

  const normalizeMathLiveAscii = (input: string) => {
    let out = String(input || '').trim();
    if (!out) return '';

    out = out.replace(/∞/g, 'inf');
    out = out.replace(/\s+/g, ' ');
    out = out.replace(/int_\(([^)]+)\)\^\(([^)]+)\)\s*/gi, 'integral from $1 to $2 of ');
    out = out.replace(/int_([^ ^]+)\^([^ ]+)\s*/gi, 'integral from $1 to $2 of ');
    out = out.replace(/\bint\s*/gi, 'integral ');
    out = out.replace(/lim_\(([^)]+)\)\s*/gi, 'limit $1 ');
    out = out.replace(/lim_([^ ]+)\s*/gi, 'limit $1 ');
    out = out.replace(/->/g, '->');
    out = out.replace(/sum_\(([^)]+)\)\^\(([^)]+)\)\s*/gi, 'sum from $1 to $2 of ');
    out = out.replace(/sqrt\(([^)]+)\)/gi, 'sqrt($1)');
    out = out.replace(/\{([^{}]+)\}/g, '$1');
    out = out.replace(/\s+dx\b/gi, ' dx');
    out = out.replace(/\s+/g, ' ');
    return out.trim();
  };

  const solverSyntaxToLatex = (input: string) => {
    const source = String(input || '').trim();
    if (!source) return '';

    const definiteIntegral = source.match(/^integral from (.+?) to (.+?) of (.+?) dx$/i);
    if (definiteIntegral) {
      return `\\int_{${definiteIntegral[1]}}^{${definiteIntegral[2]}} ${definiteIntegral[3]}\\,dx`;
    }

    const plainIntegral = source.match(/^integral (.+?) dx$/i);
    if (plainIntegral) {
      return `\\int ${plainIntegral[1]}\\,dx`;
    }

    const derivative = source.match(/^d\/dx\s*\((.+)\)$/i);
    if (derivative) {
      return `\\frac{d}{dx}\\left(${derivative[1]}\\right)`;
    }

    const limit = source.match(/^limit\s+(.+?)\s+(.+)$/i);
    if (limit) {
      return `\\lim_{${limit[1].replace(/->/g, '\\to ')}} ${limit[2]}`;
    }

    const series = source.match(/^sum from (.+?) to (.+?) of (.+)$/i);
    if (series) {
      return `\\sum_{${series[1]}}^{${series[2]}} ${series[3]}`;
    }

    return source
      .replace(/\bpi\b/gi, '\\pi')
      .replace(/\binf\b/gi, '\\infty');
  };

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void import('mathlive').then(({ MathfieldElement }) => {
      if (disposed || !mathfieldHostRef.current) return;

      const mf = new MathfieldElement();
      mf.setAttribute('style', 'display:block; width:100%; min-height:84px;');
      mf.setAttribute('aria-label', t('Type with MathLive'));
      mf.mathVirtualKeyboardPolicy = 'auto';
      mf.placeholder = t('Type a math problem');
      mf.setValue(solverSyntaxToLatex(problem || ''));

      const syncFromField = () => {
        syncingMathfieldRef.current = true;
        setProblem(normalizeMathLiveAscii(mf.getValue('ascii-math')));
        window.requestAnimationFrame(() => {
          syncingMathfieldRef.current = false;
        });
      };

      mf.addEventListener('input', syncFromField);
      mathfieldHostRef.current.innerHTML = '';
      mathfieldHostRef.current.appendChild(mf);
      mathfieldRef.current = mf;

      cleanup = () => {
        mf.removeEventListener('input', syncFromField);
        if (mathfieldHostRef.current?.contains(mf)) {
          mathfieldHostRef.current.removeChild(mf);
        }
        if (mathfieldRef.current === mf) {
          mathfieldRef.current = null;
        }
      };
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mf = mathfieldRef.current;
    if (!mf || syncingMathfieldRef.current) return;
    const latex = solverSyntaxToLatex(problem);
    if (mf.getValue('latex') !== latex) {
      mf.setValue(latex);
    }
  }, [problem]);

  useEffect(() => {
    const mf = mathfieldRef.current;
    if (!mf) return;
    mf.placeholder = t('Type a math problem');
  }, [t]);

  const handleSolve = async () => {
    if (!problem.trim()) {
      setError(t('Please enter a math problem'));
      return;
    }

    setError('');
    setSolving(true);
    setSolution(null);
    setVerification(null);

    try {
      const normalized = matlabMode ? normalizeMatlabSyntax(problem.trim()) : problem.trim();

      if (/\[.*\]/.test(normalized)) {
        setError(t('Matrix inputs are best handled in MATLAB Lab. Switch to the MATLAB Lab tool.'));
        setSolving(false);
        return;
      }

      if (useAI) {
        // Use AI API
        const res = await fetch('/api/math/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem: normalized }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || t('Failed to solve'));
        }

        const data = await res.json();
        setSolution({ ...data, isOffline: false });
      } else {
        // Use offline solver
        const result = solveOffline(normalized);
        setSolution(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Failed to solve problem'));
    } finally {
      setSolving(false);
    }
  };

  const handleVerify = async () => {
    if (!solution) return;

    setVerifying(true);
    setVerification(null);

    try {
      const res = await fetch('/api/math/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem: solution.problem,
          answer: solution.finalAnswer,
          problemType: solution.problemType,
        }),
      });

      if (!res.ok) {
        throw new Error(t('Verification failed'));
      }

      const data = await res.json();
      setVerification(data);
    } catch {
      setError(t('Failed to verify answer'));
    } finally {
      setVerifying(false);
    }
  };

  const handleReset = () => {
    setProblem('');
    setSolution(null);
    setVerification(null);
    setError('');
  };

  const handleCopy = () => {
    if (!solution) return;

    let text = `${t('Problem:')} ${solution.problem}\n\n`;
    text += `${t('Type:')} ${formatProblemType(solution.problemType)}\n\n`;
    text += `${t('Solution:')}\n`;
    solution.steps.forEach(step => {
      text += `\n${t('Step {n}:', { n: step.step })} ${step.description}\n`;
      if (step.expression) text += `  ${step.expression}\n`;
      text += `  ${step.explanation}\n`;
    });
    text += `\n${t('Final Answer')}: ${solution.finalAnswer}`;

    navigator.clipboard.writeText(text);
  };

  const formatProblemType = (type: string): string => {
    const map: Record<string, string> = {
      arithmetic: t('arithmetic'),
      derivative: t('derivative'),
      integral: t('integral'),
      limit: t('limit'),
      quadratic: t('quadratic'),
      'linear-equation': t('linear-equation'),
      'polynomial-root': t('polynomial-root'),
      'series-sum': t('series-sum'),
    };
    return map[type] || type
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const exampleProblems = [
    { label: t('Derivative'), problem: 'Find the derivative of x^3 + 2x^2 - 5x + 3' },
    { label: t('Integral'), problem: 'Integrate x^2 + 3x - 2 dx' },
    { label: t('Definite Integral'), problem: 'Integral from 0 to 2 of x^2 dx' },
    { label: t('Quadratic'), problem: 'Solve x^2 - 5x + 6 = 0' },
    { label: t('Linear'), problem: 'Solve 3x + 7 = 22' },
    { label: t('Arithmetic'), problem: 'Calculate 2^8 + 15 * 4 - 32/4' },
    { label: t('Trig Derivative'), problem: 'Find the derivative of sin(x) + cos(x)' },
    { label: t('Limit'), problem: 'Find the limit as x->0 of sin(x)/x' },
    { label: t('Polynomial Root'), problem: 'Solve x^3 - 6x^2 + 11x - 6 = 0' },
    { label: t('Series Sum'), problem: 'Calculate sum from n=1 to 10 of n^2' },
  ];

  const matlabTemplates = [
    { label: t('Derivative'), value: 'd/dx (x^3 + 2*x)' },
    { label: t('Integral'), value: 'integral x^2 dx' },
    { label: t('Integral with bounds'), value: 'integral from 0 to 1 of x^2 dx' },
    { label: t('Limit'), value: 'limit x->0 sin(x)/x' },
    { label: t('Linear Solve'), value: 'Solve 2x + 3 = 11' },
    { label: t('Matrix Hint'), value: '[1 2; 3 4] (use MATLAB Lab for matrix ops)' },
  ];

  return (
    <div className="math-solver">
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 'var(--space-4)'
      }}>
        <div>
          <h3 style={{ marginBottom: 'var(--space-1)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>{t('Math Solver')}</span>
            {solution?.isOffline && (
              <span style={{
                fontSize: 'var(--font-tiny)',
                background: 'var(--bg-inset)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-muted)'
              }}>
                {t('Offline')}
              </span>
            )}
          </h3>
          <p style={{ fontSize: 'var(--font-meta)', color: 'var(--text-muted)', margin: 0 }}>
            {t('Calculus, Algebra, Arithmetic & more')}
          </p>
        </div>
        {(solution || problem) && (
          <button className="btn ghost" onClick={handleReset} style={{ fontSize: 'var(--font-meta)' }}>
            {t('Reset')}
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--error-muted)',
          color: 'var(--error)',
          borderRadius: 'var(--radius-md)',
          marginBottom: 'var(--space-4)',
          fontSize: 'var(--font-meta)'
        }}>
          {error}
        </div>
      )}

      {/* Input Section */}
      {!solution && (
        <>
          {/* Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            padding: 'var(--space-2)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-md)',
          }}>
            <button
              className={`btn ${!useAI ? '' : 'ghost'}`}
              onClick={() => setUseAI(false)}
              style={{ flex: 1, fontSize: 'var(--font-meta)' }}
            >
              {t('Offline Mode')}
            </button>
            <button
              className={`btn ${useAI ? '' : 'ghost'}`}
              onClick={() => setUseAI(true)}
              style={{ flex: 1, fontSize: 'var(--font-meta)' }}
            >
              {t('AI Mode')}
            </button>
          </div>

          <div style={{
            display: 'flex',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-4)',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            fontSize: 'var(--font-meta)'
          }}>
            <span>{t('MATLAB Syntax Mode')}</span>
            <button
              className={`btn ${matlabMode ? '' : 'ghost'}`}
              onClick={() => setMatlabMode(prev => !prev)}
              style={{ fontSize: 'var(--font-tiny)' }}
            >
              {matlabMode ? t('Enabled') : t('Disabled')}
            </button>
          </div>

          {useAI && (
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--primary-muted)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
              fontSize: 'var(--font-meta)',
              color: 'var(--primary)'
            }}>
              {t('AI mode uses OpenAI for complex problems like Linear Algebra, Series, and advanced Calculus. Requires API key in settings.')}
            </div>
          )}

          {/* Example Problems */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{
              fontSize: 'var(--font-meta)',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: 'var(--space-2)'
            }}>
              {t('Try an example:')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {exampleProblems.map((ex) => (
                <button
                  key={ex.label}
                  className="btn ghost"
                  onClick={() => setProblem(ex.problem)}
                  style={{
                    fontSize: 'var(--font-tiny)',
                    padding: 'var(--space-1) var(--space-2)'
                  }}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{
              fontSize: 'var(--font-meta)',
              color: 'var(--text-muted)',
              display: 'block',
              marginBottom: 'var(--space-2)'
            }}>
              {t('MATLAB-ready templates:')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {matlabTemplates.map((tpl) => (
                <button
                  key={tpl.label}
                  className="btn ghost"
                  onClick={() => setProblem(tpl.value)}
                  style={{ fontSize: 'var(--font-tiny)', padding: 'var(--space-1) var(--space-2)' }}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Problem Input */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <label style={{
              fontSize: 'var(--font-meta)',
              fontWeight: 600,
              marginBottom: 'var(--space-2)',
              display: 'block'
            }}>
              {t('Enter your math problem:')}
            </label>
            <div style={{
              padding: 'var(--space-3)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-inset)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-2)',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)' }}>
                  {t('Structured input')}
                </span>
                <span style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)' }}>
                  {t('Use the built-in math keyboard for fractions, roots, exponents, and integrals.')}
                </span>
              </div>
              <div ref={mathfieldHostRef} className="mathlive-host" />
            </div>
            <p style={{
              fontSize: 'var(--font-tiny)',
              color: 'var(--text-muted)',
              marginTop: 'var(--space-2)'
            }}>
              {t('Supports MATLAB style: `.^`, `.*`, `./` and standard math (`x^2`, `sqrt()`).')}
            </p>
          </div>

          {/* Live Preview */}
          {problem && (
            <div style={{
              padding: 'var(--space-3)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
            }}>
              <label style={{
                fontSize: 'var(--font-tiny)',
                color: 'var(--text-muted)',
                display: 'block',
                marginBottom: 'var(--space-2)'
              }}>
                {t('Preview:')}
              </label>
              <div style={{ fontSize: 'var(--font-lg)' }}>
                <MathRenderer math={problem} display={true} />
              </div>
            </div>
          )}

          {/* Solve Button */}
          <button
            className="btn"
            onClick={handleSolve}
            disabled={solving || !problem.trim()}
            style={{
              width: '100%',
              padding: 'var(--space-4)',
              fontSize: 'var(--font-body)',
              fontWeight: 600
            }}
          >
            {solving ? t('Solving...') : t('Solve Problem')}
          </button>
        </>
      )}

      {/* Solution Display */}
      {solution && (
        <div className="math-solution">
          {/* Problem Type Badge */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <span style={{
              padding: 'var(--space-1) var(--space-2)',
              background: 'var(--primary-muted)',
              color: 'var(--primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-tiny)',
              fontWeight: 600
            }}>
              {formatProblemType(solution.problemType)}
            </span>
            {solution.isOffline && (
              <span style={{
                padding: 'var(--space-1) var(--space-2)',
                background: 'var(--bg-inset)',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--font-tiny)'
              }}>
                {t('Solved Offline')}
              </span>
            )}
          </div>

          {/* Original Problem */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: 'var(--font-tiny)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>
              {t('Problem')}
            </div>
            <div style={{ fontSize: 'var(--font-xl)' }}>
              <MathRenderer math={solution.problem} display={true} />
            </div>
          </div>

          {/* Steps */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-body)', fontWeight: 600 }}>
              {t('Step-by-Step Solution')}
            </h4>

            {solution.steps.map((step, index) => (
              <StepCard key={index} step={step} index={index} />
            ))}
          </div>

          {/* Final Answer */}
          <div style={{
            padding: 'var(--space-4)',
            background: 'var(--success-muted)',
            border: '2px solid var(--success)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: 'var(--font-meta)',
              color: 'var(--success)',
              fontWeight: 600,
              marginBottom: 'var(--space-2)'
            }}>
              {t('Final Answer')}
            </div>
            <div style={{ fontSize: 'var(--font-xl)', fontWeight: 600 }}>
              {solution.finalAnswer === 'Use AI mode for detailed solution'
                ? aiDetailFallback
                : <MathRenderer math={solution.finalAnswer} display={true} />}
            </div>
          </div>

          {/* Verification Section */}
          {!verification && solution.finalAnswer !== 'Use AI mode for detailed solution' && (
            <button
              className="btn secondary"
              onClick={handleVerify}
              disabled={verifying}
              style={{ width: '100%', marginBottom: 'var(--space-3)' }}
            >
              {verifying ? t('Verifying...') : t('Verify Answer (Web Search)')}
            </button>
          )}

          {verification && (
            <div style={{
              padding: 'var(--space-3)',
              background: verification.isLikelyCorrect ? 'var(--success-muted)' : 'var(--warning-muted)',
              border: `1px solid ${verification.isLikelyCorrect ? 'var(--success)' : 'var(--warning)'}`,
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-2)'
              }}>
                <span style={{ fontSize: '1.2em' }}>
                  {verification.isLikelyCorrect ? '✓' : '?'}
                </span>
                <strong>
                  {verification.isLikelyCorrect
                    ? t('Likely Correct ({confidence} confidence)', { confidence: verification.confidence })
                    : t('Could not verify')}
                </strong>
              </div>
              <p style={{ fontSize: 'var(--font-meta)', margin: 0 }}>
                {verification.explanation}
              </p>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <button className="btn secondary" onClick={handleCopy}>
              {t('Copy Solution')}
            </button>
            <button className="btn secondary" onClick={() => setSolution(null)}>
              {t('New Problem')}
            </button>
            {onGraphExpression && solution.problemType !== 'arithmetic' && (
              <button
                className="btn secondary"
                onClick={() => {
                  // Extract a plottable expression from the problem
                  const expr = problem
                    .replace(/^(find the derivative of|integrate|solve|calculate|d\/dx|d\/dx of)\s*/i, '')
                    .replace(/\s*dx$/i, '')
                    .replace(/\s*=\s*0$/i, '')
                    .trim();
                  onGraphExpression(expr);
                }}
              >
                📈 {t('Graph this')}
              </button>
            )}
            {solution.isOffline && solution.finalAnswer === 'Use AI mode for detailed solution' && (
              <button
                className="btn"
                onClick={() => {
                  setSolution(null);
                  setUseAI(true);
                }}
              >
                {t('Try with AI')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Step Card Component with proper math rendering
function StepCard({ step, index }: { step: MathStep; index: number }) {
  return (
    <div
      style={{
        padding: 'var(--space-3)',
        background: index % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-inset)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 'var(--space-2)',
        borderLeft: '3px solid var(--primary)'
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-2)'
      }}>
        <span style={{
          width: '24px',
          height: '24px',
          background: 'var(--primary)',
          color: 'white',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--font-tiny)',
          fontWeight: 600,
          flexShrink: 0
        }}>
          {step.step}
        </span>
        <strong style={{ fontSize: 'var(--font-body)' }}>
          {step.description}
        </strong>
      </div>

      {step.expression && (
        <div style={{
          padding: 'var(--space-3)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 'var(--space-2)',
          overflowX: 'auto',
          textAlign: 'center'
        }}>
          <MathRenderer math={step.expression} display={true} />
        </div>
      )}

      <p style={{
        fontSize: 'var(--font-meta)',
        color: 'var(--text-secondary)',
        margin: 0,
        lineHeight: 1.5
      }}>
        <MathText>{step.explanation}</MathText>
      </p>
    </div>
  );
}
