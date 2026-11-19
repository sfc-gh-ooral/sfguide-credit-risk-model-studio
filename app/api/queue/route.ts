import { NextResponse } from 'next/server';
import { getQueue } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json(await getQueue()); } catch (e) { return liveError(e); }
}
