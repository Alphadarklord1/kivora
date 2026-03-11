import { NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { quizAttempts, files, libraryItems } from '@/lib/db/schema';
import { eq, count, avg } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/session';

export async function GET() {
  // Always return a valid response — degrade gracefully
  if (!isDatabaseConfigured) {
    return NextResponse.json({
      totalFiles: 0, totalLibraryItems: 0, quizAttempts: 0, avgScore: 0,
    });
  }

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const [fileCount]    = await db.select({ value: count() }).from(files).where(eq(files.userId, userId));
  const [libCount]     = await db.select({ value: count() }).from(libraryItems).where(eq(libraryItems.userId, userId));
  const [quizCount]    = await db.select({ value: count() }).from(quizAttempts).where(eq(quizAttempts.userId, userId));
  const [scoreAvg]     = await db.select({ value: avg(quizAttempts.score) }).from(quizAttempts).where(eq(quizAttempts.userId, userId));

  return NextResponse.json({
    totalFiles:        fileCount?.value   ?? 0,
    totalLibraryItems: libCount?.value    ?? 0,
    quizAttempts:      quizCount?.value   ?? 0,
    avgScore:          scoreAvg?.value ? Math.round(Number(scoreAvg.value)) : 0,
  });
}
