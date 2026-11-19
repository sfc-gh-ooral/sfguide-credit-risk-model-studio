import { NextResponse } from 'next/server';
import { monitorCheck } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json(await monitorCheck()); } catch (e) { return liveError(e); }
}
