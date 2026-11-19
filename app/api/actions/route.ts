import { NextResponse } from 'next/server';
import { addAction, getActions } from '@/lib/live-queries';
import { isSnowflakeConfigured, liveError, notConfigured } from '@/lib/snowflake';
import type { ActionRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';
const ACTIONS = ['OUTREACH', 'WATCHLIST', 'DISMISS'];

export async function GET() {
  if (!isSnowflakeConfigured()) return notConfigured();
  try { return NextResponse.json({ actions: await getActions() }); } catch (e) { return liveError(e); }
}

// Records an early-warning decision in APP.EW_ACTIONS (values are bound, never inlined).
export async function POST(req: Request) {
  if (!isSnowflakeConfigured()) return notConfigured();
  const b = (await req.json().catch(() => ({}))) as Partial<ActionRecord>;
  if (!b.accountId || !/^LN-\d{6}$/.test(b.accountId) || !ACTIONS.includes(String(b.action))) return liveError('Invalid account or action.', 400);
  if (b.action === 'DISMISS' && !b.note?.trim()) return liveError('Dismissing needs a note.', 400);
  try {
    await addAction({ accountId: b.accountId, action: b.action!, note: String(b.note ?? '').slice(0, 500), persona: String(b.persona ?? '').slice(0, 60), actedAt: '' });
    return NextResponse.json({ ok: true });
  } catch (e) { return liveError(e); }
}
