import { NextResponse } from 'next/server';
import { getMonitoring } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json(await getMonitoring()); } catch (e) { return liveError(e); }
}
