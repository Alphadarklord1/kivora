import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      // Create default settings
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId,
          theme: 'light',
          fontSize: '1',
          lineHeight: '1.5',
          density: 'normal',
        })
        .returning();

      return NextResponse.json(newSettings);
    }

    return NextResponse.json(settings[0]);
  } catch (error) {
    console.error('Get settings error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { theme, fontSize, lineHeight, density } = body;

    const validThemes = ['light', 'dark', 'system'];
    const validDensities = ['compact', 'normal', 'comfortable'];

    if (theme && !validThemes.includes(theme)) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 });
    }
    if (density && !validDensities.includes(density)) {
      return NextResponse.json({ error: 'Invalid density' }, { status: 400 });
    }

    // Check if settings exist
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (existing.length === 0) {
      // Create new settings
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId,
          theme: theme || 'light',
          fontSize: fontSize || '1',
          lineHeight: lineHeight || '1.5',
          density: density || 'normal',
        })
        .returning();

      return NextResponse.json(newSettings);
    }

    // Update existing settings
    const [updated] = await db
      .update(userSettings)
      .set({
        ...(theme !== undefined && { theme }),
        ...(fontSize !== undefined && { fontSize }),
        ...(lineHeight !== undefined && { lineHeight }),
        ...(density !== undefined && { density }),
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update settings error:', error);
    return NextResponse.json({ error: 'Failed to update settings', details: String(error) }, { status: 500 });
  }
}
