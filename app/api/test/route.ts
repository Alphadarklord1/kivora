import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import '@/lib/db/schema';

export async function GET() {
  try {
    // Test database connection
    const allUsers = await db.query.users.findMany();
    const allFolders = await db.query.folders.findMany();

    return NextResponse.json({
      status: 'ok',
      userCount: allUsers.length,
      folderCount: allFolders.length,
      users: allUsers.map(u => ({ id: u.id, email: u.email })),
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error: String(error),
    }, { status: 500 });
  }
}
