import { NextRequest, NextResponse } from 'next/server';
import { getUserId } from '@/lib/auth/get-user-id';
import { callAi } from '@/lib/ai/call';

export interface ParsedCourse {
  name: string;
  instructor: string;
  days: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
  startTime: string; // HH:MM 24h
  endTime: string;   // HH:MM 24h
  location?: string;
  courseCode?: string;
}

// POST /api/planner/import-schedule
// Body: { text: string }
// Returns: { courses: ParsedCourse[] }
export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.text || typeof body.text !== 'string' || body.text.trim().length < 10) {
    return NextResponse.json({ error: 'Paste your course schedule text.' }, { status: 400 });
  }

  const text = body.text.slice(0, 6000); // cap input

  const systemPrompt = `You are a course schedule parser. Extract all courses from the pasted text.
Return ONLY a valid JSON array — no markdown, no explanation.

Each course object must have:
- "name": full course name (string)
- "courseCode": course code if present, e.g. "CS 101" (string or null)
- "instructor": instructor/professor name (string, "Unknown" if not found)
- "days": array of full day names from: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
  Common abbreviations: M=Monday, T=Tuesday, W=Wednesday, Th/R=Thursday, F=Friday, S=Saturday, Su=Sunday
  MWF means [Monday, Wednesday, Friday]; TR means [Tuesday, Thursday]
- "startTime": start time in 24-hour HH:MM format (string)
- "endTime": end time in 24-hour HH:MM format (string)
- "location": room/building if mentioned (string or null)

If a field is missing from the text, use a reasonable default or null.
Return only the JSON array, nothing else.`;

  const { result } = await callAi({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Parse this course schedule:\n\n${text}` },
    ],
    maxTokens: 2000,
    temperature: 0.1,
    offlineFallback: () => '[]',
  });

  let courses: ParsedCourse[] = [];
  try {
    const cleaned = result.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      courses = parsed.filter(
        (c) =>
          c &&
          typeof c.name === 'string' &&
          Array.isArray(c.days) &&
          c.days.length > 0 &&
          typeof c.startTime === 'string' &&
          typeof c.endTime === 'string'
      );
    }
  } catch {
    return NextResponse.json({ error: 'Could not parse the schedule. Try rephrasing or adding more detail.' }, { status: 422 });
  }

  if (courses.length === 0) {
    return NextResponse.json({ error: 'No courses found in the pasted text. Make sure it includes course names and meeting times.' }, { status: 422 });
  }

  return NextResponse.json({ courses });
}
