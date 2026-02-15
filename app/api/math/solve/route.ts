import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { evaluateAiScope } from '@/lib/ai/policy';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

// Math solving API - uses AI for complex problems
// Supports: Calculus I/II, Linear Algebra, Differential Equations, etc.

interface MathStep {
  step: number;
  description: string;
  expression: string;
  explanation: string;
}

interface MathSolution {
  problem: string;
  problemType: string;
  steps: MathStep[];
  finalAnswer: string;
  verification?: {
    isCorrect: boolean;
    source?: string;
  };
}

// Detect the type of math problem
function detectProblemType(problem: string): string {
  const p = problem.toLowerCase();

  // Linear Algebra
  if (/matrix|matrices|determinant|det\s*\(|eigenvalue|eigenvector|rank|nullity|row\s*reduce|rref|inverse\s*matrix|\[\s*\[/.test(p)) {
    return 'linear-algebra';
  }
  if (/vector|cross\s*product|dot\s*product|magnitude|unit\s*vector|span|basis|linear\s*(in)?dependence/.test(p)) {
    return 'vectors';
  }

  // Calculus II
  if (/\bintegra(l|te)\b|∫|antiderivative/.test(p)) {
    if (/double\s*integral|triple\s*integral|surface\s*integral|line\s*integral|∬|∭/.test(p)) {
      return 'multivariable-calculus';
    }
    if (/by\s*parts|partial\s*fraction|trig\s*substitution|u[\s-]substitution/.test(p)) {
      return 'integration-techniques';
    }
    if (/improper|converge|diverge/.test(p)) {
      return 'improper-integrals';
    }
    return 'integration';
  }

  if (/series|∑|sigma|taylor|maclaurin|power\s*series|convergence\s*test|ratio\s*test|root\s*test/.test(p)) {
    return 'series';
  }

  if (/sequence|a_n|recursive|nth\s*term/.test(p)) {
    return 'sequences';
  }

  if (/parametric|polar\s*(coordinate|equation|curve)|r\s*=\s*.*θ|theta/.test(p)) {
    return 'parametric-polar';
  }

  // Calculus I
  if (/derivative|d\/dx|differentiate|f'\s*\(|slope\s*of\s*tangent/.test(p)) {
    return 'differentiation';
  }

  if (/\blimit\b|lim|→|approaches|infinity/.test(p)) {
    return 'limits';
  }

  // Differential Equations
  if (/differential\s*equation|dy\/dx|d²y|separable|homogeneous\s*equation|particular\s*solution/.test(p)) {
    return 'differential-equations';
  }

  // Basic
  if (/solve|equation|=/.test(p) && /x|y|z/.test(p)) {
    if (/quadratic|x\^2|x²/.test(p)) return 'quadratic';
    if (/system/.test(p)) return 'system-of-equations';
    return 'algebra';
  }

  return 'general';
}

// Build AI prompt based on problem type
function buildMathPrompt(problem: string, problemType: string): string {
  const typeInstructions: Record<string, string> = {
    'linear-algebra': `
This is a Linear Algebra problem. Show steps for:
- Matrix operations (multiplication, inverse, transpose)
- Row reduction to RREF
- Finding determinants (cofactor expansion or row operations)
- Eigenvalues (characteristic polynomial) and eigenvectors
- Rank, nullity, and dimension`,

    'vectors': `
This is a Vector problem. Show steps for:
- Vector operations (addition, scalar multiplication)
- Dot product and cross product
- Magnitude and unit vectors
- Angle between vectors
- Linear independence/dependence`,

    'integration': `
This is an Integration problem. Show steps for:
- Identify the integration technique needed
- Apply substitution, by parts, partial fractions, or trig substitution as needed
- Show each step of the antiderivative
- Add constant of integration for indefinite integrals
- Evaluate bounds for definite integrals`,

    'integration-techniques': `
This requires advanced integration techniques. Show:
- For u-substitution: identify u, find du, rewrite, integrate, substitute back
- For integration by parts: identify u and dv, apply ∫udv = uv - ∫vdu
- For partial fractions: factor denominator, decompose, integrate each term
- For trig substitution: identify which substitution (sin, tan, sec), show triangle`,

    'series': `
This is a Series problem. Show steps for:
- Identify the type of series
- Apply appropriate convergence test (ratio, root, comparison, integral, alternating series)
- For Taylor/Maclaurin: find derivatives, evaluate at center, write general term
- Find radius and interval of convergence`,

    'differentiation': `
This is a Differentiation problem. Show steps for:
- Apply derivative rules (power, product, quotient, chain)
- Show each application of the chain rule explicitly
- Simplify the final answer`,

    'limits': `
This is a Limits problem. Show steps for:
- Try direct substitution first
- If indeterminate (0/0, ∞/∞), apply L'Hôpital's Rule or algebraic manipulation
- Factor, rationalize, or use special limits as needed`,

    'differential-equations': `
This is a Differential Equations problem. Show steps for:
- Identify the type (separable, linear, exact, homogeneous)
- Apply appropriate solution method
- Find general solution
- Apply initial conditions if given for particular solution`,

    'quadratic': `
This is a Quadratic equation. Show steps for:
- Rearrange to standard form ax² + bx + c = 0
- Apply quadratic formula or factor
- Simplify roots`,

    'system-of-equations': `
This is a System of Equations. Show steps for:
- Use substitution, elimination, or matrix methods
- Show each step clearly
- Verify solution in original equations`,
  };

  const basePrompt = `You are a mathematics tutor. Solve this problem with detailed step-by-step explanations.

PROBLEM: ${problem}

${typeInstructions[problemType] || ''}

FORMAT YOUR RESPONSE AS JSON:
{
  "problemType": "${problemType}",
  "steps": [
    {
      "step": 1,
      "description": "Brief title of this step",
      "expression": "Mathematical expression or equation",
      "explanation": "Detailed explanation of what we're doing and why"
    }
  ],
  "finalAnswer": "The final answer clearly stated"
}

Important:
- Be thorough and explain each step
- Use proper mathematical notation
- For complex expressions, use LaTeX-style notation (e.g., x^2 for x², sqrt() for square root)
- Make explanations clear for a student learning the material`;

  return basePrompt;
}

// Call AI API (OpenAI compatible)
async function callAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiBase = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('AI API key not configured');
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a mathematics expert. Always respond with valid JSON only, no markdown code blocks.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Fallback solver for basic problems when AI is not available
function fallbackSolver(problem: string, problemType: string): MathSolution {
  return {
    problem,
    problemType,
    steps: [
      {
        step: 1,
        description: 'AI Required',
        expression: problem,
        explanation: `This ${problemType} problem requires AI assistance for accurate step-by-step solving. Please configure an OpenAI API key in your environment variables (OPENAI_API_KEY) to enable advanced math solving.`
      }
    ],
    finalAnswer: 'AI API required for complex math problems. Add OPENAI_API_KEY to .env.local'
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id && !isGuestModeEnabled()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { problem } = await request.json();

    if (!problem || typeof problem !== 'string') {
      return NextResponse.json({ error: 'Problem is required' }, { status: 400 });
    }

    const scopeDecision = evaluateAiScope({ mode: 'math', text: problem, source: 'tools' });
    if (!scopeDecision.allowed) {
      return NextResponse.json(
        {
          error: scopeDecision.reason,
          errorCode: scopeDecision.errorCode,
          reason: scopeDecision.reason,
          suggestionModes: scopeDecision.suggestionModes,
        },
        { status: 422 }
      );
    }

    const problemType = detectProblemType(problem);

    // Try AI solver first
    try {
      const prompt = buildMathPrompt(problem, problemType);
      const aiResponse = await callAI(prompt);

      // Parse AI response
      let parsed;
      try {
        // Remove markdown code blocks if present
        const cleaned = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // If parsing fails, create a basic response
        parsed = {
          problemType,
          steps: [{
            step: 1,
            description: 'Solution',
            expression: '',
            explanation: aiResponse
          }],
          finalAnswer: 'See explanation above'
        };
      }

      const solution: MathSolution = {
        problem,
        problemType: parsed.problemType || problemType,
        steps: parsed.steps || [],
        finalAnswer: parsed.finalAnswer || 'Unable to determine',
      };

      return NextResponse.json(solution);

    } catch (aiError) {
      console.log('AI not available, using fallback:', aiError);
      const fallback = fallbackSolver(problem, problemType);
      return NextResponse.json(fallback);
    }

  } catch (error) {
    console.error('Math solve error:', error);
    return NextResponse.json(
      { error: 'Failed to solve problem' },
      { status: 500 }
    );
  }
}
