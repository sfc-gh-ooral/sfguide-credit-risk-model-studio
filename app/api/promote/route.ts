import { NextResponse } from 'next/server';
import { getPromotion, promote, revertPromotion } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';
export const maxDuration = 420;

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json(await getPromotion()); } catch (e) { return liveError(e); }
}

// Validator approval: records it, moves the CHAMPION alias to V2, and re-runs batch scoring.
export async function POST(req: Request) {
  if (!isSnowflakeConfigured()) return notConfigured();
  const b = (await req.json().catch(() => ({}))) as { note?: string; approver?: string };
  if (!b.note?.trim()) return liveError('An approval note is required.', 400);
  try { await promote(b.note.slice(0, 500), String(b.approver ?? 'Model validator').slice(0, 60)); return NextResponse.json({ ok: true }); }
  catch (e) { return liveError(e); }
}

// Replay: puts V1 back as champion and re-scores.
export async function DELETE() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { await revertPromotion(); return NextResponse.json({ ok: true }); } catch (e) { return liveError(e); }
}
