'use client';

// One client-side interface for every screen. Sample mode reads the bundled synthetic data and
// waits a few seconds on AI/compute actions (with staged steps); Live mode calls the API routes,
// which query Snowflake, and never falls back to sample data.
import { useEffect, useState } from 'react';
import { liveJson, useMode, type Mode } from './mode';
import { sample, sampleActions, saveSampleAction, samplePromotion, saveSamplePromotion } from './mock-source';
import { sampleDelayMs, wait } from './sample-timing';
import { sampleModelCardDraft } from './sample-ai';
import type { ActionRecord, EwAction, Models, Monitoring, Portfolio, Queue } from './types';

export interface Promotion { promoted: boolean; note?: string; approver?: string; at?: string }

type Loader<T> = { sample: () => T; live: string };
const LOADERS = {
  portfolio: { sample: () => sample.portfolio, live: '/api/portfolio' } as Loader<Portfolio>,
  queue: { sample: () => sample.queue, live: '/api/queue' } as Loader<Queue>,
  models: { sample: () => sample.models, live: '/api/models' } as Loader<Models>,
  monitoring: { sample: () => sample.monitoring, live: '/api/monitoring' } as Loader<Monitoring>,
};

export function useData<K extends keyof typeof LOADERS>(key: K, refreshKey = 0) {
  type T = ReturnType<(typeof LOADERS)[K]['sample']>;
  const { mode } = useMode();
  const [state, setState] = useState<{ data?: T; error?: string; mode?: Mode; ms?: number }>({});
  useEffect(() => {
    if (!mode) return;
    let alive = true;
    const loader = LOADERS[key] as Loader<T>;
    if (mode === 'sample') { setState({ data: loader.sample(), mode }); return; }
    const t0 = performance.now();
    liveJson<T>(loader.live)
      .then((data) => alive && setState({ data, mode, ms: performance.now() - t0 }))
      .catch((e: Error) => alive && setState({ error: e.message, mode }));
    return () => { alive = false; };
  }, [key, mode, refreshKey]);
  return { ...state, live: state.mode === 'live', loading: !state.data && !state.error };
}

// ---------------------------------------------------------------- promotion (champion vs challenger)
export async function getPromotion(mode: Mode): Promise<Promotion> {
  if (mode === 'sample') { const p = samplePromotion(); return p ? { promoted: true, ...p } : { promoted: false }; }
  return liveJson<Promotion>('/api/promote');
}
export function usePromotion(refreshKey = 0) {
  const { mode } = useMode();
  const [p, setP] = useState<Promotion | undefined>();
  useEffect(() => { if (mode) getPromotion(mode).then(setP).catch(() => setP({ promoted: false })); }, [mode, refreshKey]);
  return p;
}
export async function promoteChallenger(mode: Mode, note: string, approver: string): Promise<{ ms: number }> {
  const t0 = performance.now();
  if (mode === 'sample') {
    await wait(sampleDelayMs() + 2500);
    saveSamplePromotion({ note, approver, at: new Date().toISOString() });
  } else {
    await liveJson('/api/promote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ note, approver }) });
  }
  return { ms: performance.now() - t0 };
}
export function resetPromotionSample() { saveSamplePromotion(null); }

// ---------------------------------------------------------------- early-warning actions
export async function getActions(mode: Mode): Promise<ActionRecord[]> {
  if (mode === 'sample') return sampleActions();
  return (await liveJson<{ actions: ActionRecord[] }>('/api/actions')).actions;
}
export async function recordAction(mode: Mode, accountId: string, action: EwAction, note: string, persona: string) {
  const rec: ActionRecord = { accountId, action, note, persona, actedAt: new Date().toISOString() };
  if (mode === 'sample') { await wait(700); saveSampleAction(rec); return rec; }
  await liveJson('/api/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(rec) });
  return rec;
}

// ---------------------------------------------------------------- AI_COMPLETE model documentation draft
export async function draftModelCard(mode: Mode, section: string, version: string): Promise<{ text: string; ms: number; model?: string }> {
  const t0 = performance.now();
  if (mode === 'sample') {
    await wait(sampleDelayMs());
    return { text: sampleModelCardDraft(section, version), ms: performance.now() - t0 };
  }
  const r = await liveJson<{ text: string; model: string }>('/api/model-card', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section, version }),
  });
  return { ...r, ms: performance.now() - t0 };
}

// The scoring version behind the CHAMPION alias: V1 until a validator promotes V2.
export const activeVersion = (promoted: boolean | undefined): 'v1' | 'v2' => (promoted ? 'v2' : 'v1');
