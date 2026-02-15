import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

// Verify math answers by searching the web

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

// Search DuckDuckGo for verification
async function searchWeb(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`
    );

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();
    const results: { title: string; url: string; snippet: string }[] = [];

    // Get related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.slice(0, 100),
            url: topic.FirstURL,
            snippet: topic.Text,
          });
        }
      }
    }

    // Get abstract if available
    if (data.AbstractText && data.AbstractURL) {
      results.unshift({
        title: data.Heading || 'Reference',
        url: data.AbstractURL,
        snippet: data.AbstractText,
      });
    }

    return results;
  } catch (error) {
    console.error('Web search failed:', error);
    return [];
  }
}

// Extract numbers and key values from text for comparison
function extractValues(text: string): string[] {
  const values: string[] = [];

  // Extract numbers (including decimals, fractions, negatives)
  const numbers = text.match(/-?\d+\.?\d*(?:\/\d+)?/g) || [];
  values.push(...numbers);

  // Extract common math expressions
  const expressions = text.match(/[+-]?\d*\.?\d*[xyz](?:\^\d+)?/gi) || [];
  values.push(...expressions);

  // Extract special values
  if (/infinity|∞|inf/i.test(text)) values.push('infinity');
  if (/undefined|dne|does not exist/i.test(text)) values.push('undefined');
  if (/diverge/i.test(text)) values.push('diverges');
  if (/converge/i.test(text)) values.push('converges');

  return values.map(v => v.toLowerCase().trim());
}

// Check if answer appears in search results
function checkAnswerInResults(
  answer: string,
  problem: string,
  results: { title: string; url: string; snippet: string }[]
): { agrees: boolean; snippet: string }[] {
  const answerValues = extractValues(answer);
  const checked: { agrees: boolean; snippet: string }[] = [];

  for (const result of results) {
    const snippetValues = extractValues(result.snippet);
    const snippetLower = result.snippet.toLowerCase();

    // Check if any answer values appear in snippet
    let agrees = false;

    for (const val of answerValues) {
      if (val.length > 1 && (snippetValues.includes(val) || snippetLower.includes(val))) {
        agrees = true;
        break;
      }
    }

    // Also check for exact answer text
    if (answer.length > 2 && snippetLower.includes(answer.toLowerCase())) {
      agrees = true;
    }

    checked.push({ agrees, snippet: result.snippet });
  }

  return checked;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id && !isGuestModeEnabled()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { problem, answer, problemType } = await request.json();

    if (!problem || !answer) {
      return NextResponse.json(
        { error: 'Problem and answer are required' },
        { status: 400 }
      );
    }

    // Build search queries
    const queries = [
      `${problem} solution`,
      `${problem} answer`,
      `${problemType || 'math'} ${problem.slice(0, 50)}`,
    ];

    // Search and collect results
    const allResults: { title: string; url: string; snippet: string }[] = [];
    for (const query of queries) {
      const results = await searchWeb(query);
      allResults.push(...results);
      if (allResults.length >= 5) break;
    }

    // Deduplicate by URL
    const uniqueResults = allResults.filter(
      (r, i, arr) => arr.findIndex(x => x.url === r.url) === i
    ).slice(0, 5);

    // Check answer against results
    const checked = checkAnswerInResults(answer, problem, uniqueResults);

    // Determine confidence
    const agreementCount = checked.filter(c => c.agrees).length;
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let isLikelyCorrect = false;

    if (uniqueResults.length === 0) {
      confidence = 'low';
      isLikelyCorrect = false;
    } else if (agreementCount >= 2) {
      confidence = 'high';
      isLikelyCorrect = true;
    } else if (agreementCount === 1) {
      confidence = 'medium';
      isLikelyCorrect = true;
    }

    // Build response
    const sources = uniqueResults.map((r, i) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet.slice(0, 200),
      agrees: checked[i]?.agrees || false,
    }));

    let explanation = '';
    if (uniqueResults.length === 0) {
      explanation = 'Could not find relevant sources to verify this answer. The answer may still be correct - try checking with Wolfram Alpha or a textbook.';
    } else if (isLikelyCorrect) {
      explanation = `Found ${agreementCount} source(s) that appear to support this answer.`;
    } else {
      explanation = 'Could not confirm this answer from web sources. Double-check your work or try a different approach.';
    }

    const result: VerificationResult = {
      isLikelyCorrect,
      confidence,
      sources,
      explanation,
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify answer' },
      { status: 500 }
    );
  }
}
