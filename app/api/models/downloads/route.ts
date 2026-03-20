import { NextResponse } from 'next/server';
import { getReleaseDownloadData } from '@/lib/models/downloads';

export async function GET() {
  const data = await getReleaseDownloadData();
  return NextResponse.json(data);
}
