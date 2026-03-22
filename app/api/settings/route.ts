import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { normalizeTheme } from '@/lib/settings/theme';
import { users } from '@/lib/db/schema';

function buildDefaultSettings(userId: string) {
  return {
    id: null,
    userId,
    theme: 'light',
    fontSize: '1',
    lineHeight: '1.5',
    density: 'normal',
    createdAt: null,
    updatedAt: null,
  };
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (settings.length === 0) {
      const existingUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (existingUser.length === 0) {
        return NextResponse.json(buildDefaultSettings(userId));
      }

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

      return NextResponse.json({
        ...settings[0],
        theme: normalizeTheme(settings[0].theme),
      });
  } catch (error) {
    console.error(`[Settings][${requestId}] GET failed`, error);
    return apiError(500, {
      errorCode: 'SETTINGS_FETCH_FAILED',
      reason: 'Failed to get settings',
      details: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
}

export async function PUT(request: NextRequest) {
  const requestId = createRequestId(request);
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    const body = await request.json();
    const { theme, fontSize, lineHeight, density } = body;
    const normalizedTheme = theme === undefined ? undefined : normalizeTheme(theme);

    const validThemes = ['light', 'blue', 'black', 'system', 'dark'];
    const validDensities = ['compact', 'normal', 'comfortable'];

    if (theme && !validThemes.includes(theme)) {
      return apiError(400, {
        errorCode: 'INVALID_THEME',
        reason: 'Invalid theme',
        requestId,
      });
    }
    if (density && !validDensities.includes(density)) {
      return apiError(400, {
        errorCode: 'INVALID_DENSITY',
        reason: 'Invalid density',
        requestId,
      });
    }

    // Check if settings exist
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser.length === 0) {
      return NextResponse.json({
        ...buildDefaultSettings(userId),
        theme: normalizedTheme || 'light',
        fontSize: fontSize || '1',
        lineHeight: lineHeight || '1.5',
        density: density || 'normal',
      });
    }

    if (existing.length === 0) {
      // Create new settings
      const [newSettings] = await db
        .insert(userSettings)
        .values({
          userId,
          theme: normalizedTheme || 'light',
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
        ...(theme !== undefined && { theme: normalizedTheme }),
        ...(fontSize !== undefined && { fontSize }),
        ...(lineHeight !== undefined && { lineHeight }),
        ...(density !== undefined && { density }),
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId))
      .returning();

    return NextResponse.json(updated);
  } catch (error) {
    console.error(`[Settings][${requestId}] PUT failed`, error);
    return apiError(500, {
      errorCode: 'SETTINGS_UPDATE_FAILED',
      reason: 'Failed to update settings',
      details: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
}
