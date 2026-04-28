import { NextRequest, NextResponse } from 'next/server';
import { db, isDatabaseConfigured } from '@/lib/db';
import { userSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getUserId } from '@/lib/auth/get-user-id';
import { apiError, createRequestId } from '@/lib/api/error-response';
import { normalizeTheme } from '@/lib/settings/theme';
import { users } from '@/lib/db/schema';
import { isGuestModeEnabled } from '@/lib/runtime/mode';

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

function isEphemeralGuest(userId: string) {
  return userId === 'guest' || userId === 'local-demo-user' || userId.startsWith('guest:');
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

    if (isGuestModeEnabled() && isEphemeralGuest(userId)) {
      return NextResponse.json(buildDefaultSettings(userId));
    }

    // Database can be unavailable in guest / no-DB mode for a real signed-in
    // user too (DB outage, partial deploy). Serve sane defaults rather than
    // crashing the settings page on the read path.
    if (!isDatabaseConfigured) {
      return NextResponse.json(buildDefaultSettings(userId));
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
    if (isGuestModeEnabled()) {
      return NextResponse.json(buildDefaultSettings('local-demo-user'));
    }
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
  let bodyData: Record<string, unknown> = {};
  try {
    const userId = await getUserId(request);

    if (!userId) {
      return apiError(401, {
        errorCode: 'UNAUTHORIZED',
        reason: 'Authentication required',
        requestId,
      });
    }

    if (isGuestModeEnabled() && isEphemeralGuest(userId)) {
      return NextResponse.json({
        ...buildDefaultSettings(userId),
        theme: 'light',
        fontSize: '1',
        lineHeight: '1.5',
        density: 'normal',
      });
    }

    // No DB → can't persist. Echo the requested values back so the UI keeps
    // the optimistic state instead of throwing in the catch block below.
    if (!isDatabaseConfigured) {
      const body = await request.json().catch(() => ({}));
      return NextResponse.json({
        ...buildDefaultSettings(userId),
        ...(typeof body === 'object' && body ? body : {}),
      });
    }

    const body = await request.json();
    bodyData = typeof body === 'object' && body ? body as Record<string, unknown> : {};
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
    if (isGuestModeEnabled()) {
      return NextResponse.json({
        ...buildDefaultSettings('local-demo-user'),
        theme: normalizeTheme(typeof bodyData.theme === 'string' ? bodyData.theme : 'light'),
        fontSize: typeof bodyData.fontSize === 'string' ? bodyData.fontSize : '1',
        lineHeight: typeof bodyData.lineHeight === 'string' ? bodyData.lineHeight : '1.5',
        density: typeof bodyData.density === 'string' ? bodyData.density : 'normal',
      });
    }
    return apiError(500, {
      errorCode: 'SETTINGS_UPDATE_FAILED',
      reason: 'Failed to update settings',
      details: error instanceof Error ? error.message : String(error),
      requestId,
    });
  }
}
