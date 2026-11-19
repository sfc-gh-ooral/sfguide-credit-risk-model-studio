'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BellRing, CheckCircle2, EyeOff, PhoneCall } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, LiveError, Loading, PoweredBy } from '@/components/ui';
import { useStudio } from '@/components/Studio';
import { activeVersion, getActions, recordAction, useData, usePromotion } from '@/lib/credit-data';
import { useMode } from '@/lib/mode';
import { FILE_TYPE_LABELS, featureLabel, featureValue, fmtPct, fmtUsd } from '@/lib/format';
import { PersonaLens } from '@/components/PersonaLens';
import { PERSONAS, type ActionRecord, type EwAction, type QueueAccount } from '@/lib/types';

// Semicircle gauge for 12-month default probability.
function Gauge({ value, prev }: { value: number; prev: number }) {
  const max = 0.6, r = 70, c = Math.PI * r;
  const f = (v: number) => Math.min(1, v / max);
  return (
    <svg viewBox="0 0 180 104" className="w-full max-w-[240px]" role="img" aria-label={`Default probability ${fmtPct(value)}`}>
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stopColor="var(--emerald)" /><stop offset=".5" stopColor="var(--amber)" /><stop offset="1" stopColor="var(--coral)" /></linearGradient></defs>
      <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="var(--line)" strokeWidth="14" strokeLinecap="round" />
      <motion.path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="url(#g)" strokeWidth="14" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - f(value)) }} transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />
      <circle cx={90 - r * Math.cos(Math.PI * f(prev))} cy={94 - r * Math.sin(Math.PI * f(prev))} r="5" fill="var(--card)" stroke="var(--muted)" strokeWidth="2" />
      <text x="90" y="80" textAnchor="middle" className="font-display" fontSize="28" fill="var(--ink)">{fmtPct(value)}</text>
      <text x="90" y="98" textAnchor="middle" fontSize="10" fill="var(--muted)">was {fmtPct(prev)} · 12-month PD</text>
    </svg>
  );
}

function Detail() {
  const id = useSearchParams().get('id') ?? '';
  const { mode } = useMode();
  const q = useData('queue');
  const promotion = usePromotion();
  const { persona, setPersona } = useStudio();
  const [existing, setExisting] = useState<ActionRecord | undefined>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<EwAction | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { if (mode) getActions(mode).then((a) => setExisting(a.find((x) => x.accountId === id))).catch(() => undefined); }, [mode, id]);

  if (q.error) return <LiveError message={q.error} />;
  if (!q.data || !promotion) return <Loading />;
  const a = q.data.accounts.find((x) => x.accountId === id) as QueueAccount | undefined;
  if (!a) return <div className="card p-8 text-center text-ink-2">Account {id || '(none)'} isn&apos;t in the early-warning queue. <Link className="underline" href="/queue/">Back to the queue</Link></div>;

  const v = activeVersion(promotion.promoted);
  const s = a[v];
  const other = a[v === 'v1' ? 'v2' : 'v1'];
  const maxC = Math.max(...s.reasons.map((r) => r.contribution), 0.01);
  const canAct = persona === 'manager';

  const act = async (action: EwAction) => {
    if (!mode) return;
    setBusy(action); setErr('');
    try { setExisting(await recordAction(mode, a.accountId, action, note.trim(), PERSONAS[persona].label)); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <>
      <Link href="/queue/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 mb-5 hover:text-ink"><ArrowLeft className="w-4 h-4" aria-hidden />Early-warning queue</Link>
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between mb-6">
        <div>
          <div className="eyebrow mb-1">{a.product === 'AUTO' ? 'Auto loan' : 'Personal loan'} · {FILE_TYPE_LABELS[a.fileType]} · originated {a.vintage}</div>
          <h1 className="font-display text-3xl md:text-4xl text-ink">{a.borrowerName} <span className="text-muted text-2xl">{a.accountId}</span></h1>
          <PersonaLens page="account" />
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="chip">{a.state}</span><span className="chip num">Balance {fmtUsd(a.balance)}</span><span className="chip num">APR {fmtPct(a.apr, 2)}</span>
          <span className="chip chip-indigo">Scored by {v.toUpperCase()} {promotion.promoted ? '(promoted champion)' : '(champion)'}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Card eyebrow="Risk score" title="12-month probability of default" right={<PoweredBy>model.run</PoweredBy>}>
          <div className="flex justify-center"><Gauge value={s.pd} prev={s.pdPrev} /></div>
          <div className="mt-3 flex justify-between text-xs text-ink-2 border-t pt-3" style={{ borderColor: 'var(--line)' }}>
            <span>Change (3 mo): <strong className="num" style={{ color: 'var(--coral)' }}>+{((s.pd - s.pdPrev) * 100).toFixed(1)} pts</strong></span>
            <span>{v === 'v1' ? 'V2' : 'V1'} says {fmtPct(other.pd)}</span>
          </div>
        </Card>

        <Card className="lg:col-span-2" eyebrow="Reason codes" title="Why the score moved" right={<PoweredBy preview>explain (SHAP)</PoweredBy>}>
          <ul className="space-y-3">
            {s.reasons.map((r, i) => (
              <li key={r.feature}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-ink font-semibold">{i + 1}. {featureLabel(r.feature)} <span className="text-muted font-normal">= {featureValue(r.feature, r.value)}</span></span>
                  <span className="num text-xs text-ink-2">+{r.contribution.toFixed(2)} log-odds</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-2)' }}>
                  <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, var(--amber), var(--coral))' }}
                    initial={{ width: 0 }} animate={{ width: `${(r.contribution / maxC) * 100}%` }} transition={{ duration: 0.8, delay: 0.1 * i }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-4">Largest positive Shapley contributions to this account&apos;s current score, relative to the model&apos;s background sample. Use them to explain the alert, not as adverse-action reasons.</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" eyebrow="Last 12 months" title="Bureau and payment history">
          <div className="h-[280px]">
            <ResponsiveContainer>
              <ComposedChart data={a.timeline} margin={{ top: 6, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis yAxisId="usd" tickFormatter={(x) => `$${Math.round(x)}`} tickLine={false} axisLine={false} width={50} />
                <YAxis yAxisId="u" orientation="right" domain={[0, 1.2]} tickFormatter={(x) => fmtPct(x, 0)} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(val, name) => (String(name).includes('tilization') ? fmtPct(Number(val), 0) : fmtUsd(Number(val), 2))} />
                <Legend />
                <Bar yAxisId="usd" dataKey="scheduled" name="Scheduled" fill="var(--line)" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="usd" dataKey="paid" name="Paid" fill="var(--emerald)" radius={[6, 6, 0, 0]} />
                <Line yAxisId="u" dataKey="utilization" name="Revolving utilization" stroke="var(--coral)" strokeWidth={2.4} dot={{ r: 2.5 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3 text-center text-xs">
            {[['FICO', a.timeline[0].fico, a.timeline.at(-1)!.fico], ['Inquiries (6 mo)', a.timeline[0].inquiries, a.timeline.at(-1)!.inquiries], ['Days past due', a.timeline[0].dpd, a.timeline.at(-1)!.dpd]].map(([l, x, y]) => (
              <div key={String(l)} className="rounded-xl p-2.5" style={{ background: 'var(--bg-2)' }}>
                <div className="text-muted">{l}</div><div className="num text-ink font-semibold mt-0.5">{x} → {y}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card eyebrow="Decision" title="Assign next step">
          {existing ? (
            <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--emerald-bg)' }}>
              <div className="flex items-center gap-2 font-semibold text-ink"><CheckCircle2 className="w-4 h-4" style={{ color: 'var(--emerald)' }} aria-hidden />
                {existing.action === 'OUTREACH' ? 'Assigned to outreach' : existing.action === 'WATCHLIST' ? 'Added to watchlist' : 'Dismissed'}</div>
              {existing.note && <p className="text-sm text-ink-2 mt-1.5">&ldquo;{existing.note}&rdquo;</p>}
              <p className="text-xs text-muted mt-2">{existing.persona} · {new Date(existing.actedAt).toLocaleString()}{mode === 'live' ? ' · saved to APP.EW_ACTIONS' : ' · saved in this browser'}</p>
            </div>
          ) : null}
          <label className="block text-xs font-semibold text-ink-2 mb-1.5" htmlFor="note">Note (recorded with the decision)</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} disabled={!canAct}
            placeholder={canAct ? 'e.g., Payment fell to a third of scheduled; call before the next due date.' : 'Switch to Portfolio risk manager to record a decision.'}
            className="w-full rounded-xl border p-3 text-sm mb-3" style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
          <div className="grid gap-2">
            <button className="btn btn-primary" disabled={!canAct || !!busy} onClick={() => act('OUTREACH')}><PhoneCall className="w-4 h-4" aria-hidden />{busy === 'OUTREACH' ? 'Saving…' : 'Assign to outreach'}</button>
            <button className="btn" disabled={!canAct || !!busy} onClick={() => act('WATCHLIST')}><BellRing className="w-4 h-4" aria-hidden />{busy === 'WATCHLIST' ? 'Saving…' : 'Add to watchlist'}</button>
            <button className="btn" disabled={!canAct || !!busy || !note.trim()} onClick={() => act('DISMISS')} title="Dismissing needs a note"><EyeOff className="w-4 h-4" aria-hidden />{busy === 'DISMISS' ? 'Saving…' : 'Dismiss with note'}</button>
          </div>
          {err && <p role="alert" className="text-xs mt-3" style={{ color: 'var(--coral)' }}>Live write failed: {err}</p>}
          {!canAct && (
            <p className="text-xs text-muted mt-3">Decisions belong to the portfolio risk manager.{' '}
              <button className="underline font-semibold text-ink-2" onClick={() => setPersona('manager')}>View as portfolio risk manager</button></p>
          )}
        </Card>
      </div>
    </>
  );
}

export default function AccountPage() {
  return <Suspense fallback={<Loading />}><Detail /></Suspense>;
}
