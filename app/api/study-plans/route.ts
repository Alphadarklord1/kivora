import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { studyPlans } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
    });
    return (token?.id as string) || (token?.sub as string) || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');

  let plans = await db.query.studyPlans.findMany({
    where: eq(studyPlans.userId, userId),
    orderBy: [desc(studyPlans.createdAt)],
  });

  if (status) {
    plans = plans.filter(plan => plan.status === status);
  }

  return NextResponse.json(plans);
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { title, examDate, dailyMinutes, topics, schedule } = body;

  if (!title || !examDate || !topics || !schedule) {
    return NextResponse.json(
      { error: 'Title, exam date, topics, and schedule are required' },
      { status: 400 }
    );
  }

  const [newPlan] = await db.insert(studyPlans).values({
    userId,
    title,
    examDate: new Date(examDate),
    dailyMinutes: dailyMinutes || 60,
    topics,
    schedule,
    status: 'active',
    progress: 0,
  }).returning();

  return NextResponse.json(newPlan, { status: 201 });
}
