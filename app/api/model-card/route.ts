import { NextResponse } from 'next/server';
import { draftSection } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

// Drafts one model card section with AI_COMPLETE from the registry metrics and drift results.
export async function POST(req: Request) {
  if (!isSnowflakeConfigured()) return notConfigured();
  const b = (await req.json().catch(() => ({}))) as { section?: string; version?: string };
  try { return NextResponse.json(await draftSection(String(b.section), String(b.version))); } catch (e) { return liveError(e); }
}
