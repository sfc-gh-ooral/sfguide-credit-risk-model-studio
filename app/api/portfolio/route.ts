import { NextResponse } from 'next/server';
import { getPortfolio } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json(await getPortfolio()); } catch (e) { return liveError(e); }
}
