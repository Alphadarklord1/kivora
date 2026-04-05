import { NextRequest, NextResponse } from 'next/server';
import { requireAppAccess } from '@/lib/api/guard';
import { resolveIdentifier } from '@/lib/coach/doi';

/** POST /api/sources/resolve — resolve a DOI or arXiv ID to paper metadata */
export async function POST(request: NextRequest) {
  const guardResult = await requireAppAccess(request);
  if (guardResult) return guardResult;

  const body = await request.json().catch(() => null) as { identifier?: string } | null;
  const identifier = body?.identifier?.trim() ?? '';
  if (!identifier) return NextResponse.json({ error: 'identifier is required.' }, { status: 400 });

  try {
    const paper = await resolveIdentifier(identifier);
    return NextResponse.json(paper);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not resolve identifier.' },
      { status: 400 },
    );
  }
}
