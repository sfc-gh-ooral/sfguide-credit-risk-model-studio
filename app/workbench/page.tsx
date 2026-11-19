'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Crown, FlaskRound, Sparkles, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, LiveError, Loading, PageHeader, PoweredBy, SourceChip } from '@/components/ui';
import { StoryBeats } from '@/components/StoryBeats';
import { useStudio } from '@/components/Studio';
import { useData, usePromotion } from '@/lib/credit-data';
import { featureLabel, fmtInt, fmtPct } from '@/lib/format';
import type { ModelVersion } from '@/lib/types';

const COLOR: Record<string, string> = { V1: 'var(--emerald)', V2: 'var(--indigo)' };

function MetricDuel({ label, a, b, digits = 3 }: { label: string; a: number; b: number; digits?: number }) {
  const better = b > a ? 'V2' : 'V1';
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-2)' }}>
      <div className="eyebrow mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2">
        {[['V1', a], ['V2', b]].map(([v, x]) => (
          <div key={String(v)}>
            <div className="text-[11px] font-semibold" style={{ color: COLOR[String(v)] }}>{v}{better === v && <Trophy className="inline w-3 h-3 ml-1 -mt-0.5" aria-label="higher" />}</div>
            <div className={`font-display num ${better === v ? 'text-2xl text-ink' : 'text-xl text-muted'}`}>{Number(x).toFixed(digits)}</div>
          </div>
        ))}
      </div>
      <div className="text-xs mt-1 num" style={{ color: b >= a ? 'var(--emerald)' : 'var(--coral)' }}>{b >= a ? '+' : ''}{(b - a).toFixed(digits)} V2 vs. V1</div>
    </div>
  );
}

export default function Workbench() {
  const m = useData('models');
  const promotion = usePromotion();
  const { markBeat, persona } = useStudio();
  const [sel, setSel] = useState<'V1' | 'V2'>('V2');
  useEffect(() => { if (m.data) markBeat('workbench'); }, [m.data, markBeat]);
  if (m.error) return <LiveError message={m.error} />;
  if (!m.data || !promotion) return <Loading />;
  const [v1, v2] = m.data.versions;
  const cur: ModelVersion = sel === 'V1' ? v1 : v2;
  const alias = (v: ModelVersion) => (promotion.promoted ? (v.version === 'V2' ? 'CHAMPION' : 'PREVIOUS_CHAMPION') : v.alias);
  const calib = cur.oot.calibration;
  const imp = cur.importance.slice(0, 10).map((r) => ({ ...r, label: featureLabel(r.feature) }));
  const runs = m.data.runs ?? [];
  const provisional = m.data.source === 'provisional';
  const wins = (['auc', 'ks', 'gini'] as const).filter((k) => v2.oot[k] > v1.oot[k]).length;
  const verdict = wins === 3 ? 'V2 beats V1 on all three out-of-time metrics.' : `V2 beats V1 on ${wins} of 3 out-of-time metrics.`;

  return (
    <>
      <PageHeader eyebrow="Model workbench · data scientist" title="Champion vs. challenger, trained where the data lives"
        right={<><SourceChip live={m.live} ms={m.ms} what="results" /><PoweredBy>Snowflake ML · Feature Store · Model Registry</PoweredBy></>}>
        Both versions train in Snowflake from the same Feature Store views and are compared on one out-of-time sample: {m.data.ootWindow}.
        That window sits inside the utilization drift, which is exactly what the champion never saw.
      </PageHeader>

      <StoryBeats />

      {provisional && (
        <div className="card p-3 mb-5 text-xs text-ink-2">These results are a provisional fit from the data generator. After a live run, <code>npm run capture-live</code> replaces them with the Snowflake ML results.</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr] mb-4">
        <div className="grid gap-4">
          {[v1, v2].map((v, i) => (
            <motion.button key={v.version} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}
              onClick={() => setSel(v.version as 'V1' | 'V2')} aria-pressed={sel === v.version}
              className="card card-lift p-5 text-left" style={{ borderColor: sel === v.version ? COLOR[v.version] : undefined, borderWidth: sel === v.version ? 2 : 1 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-display text-xl text-ink">{v.version}</span>
                <span className={`chip ${alias(v) === 'CHAMPION' ? 'chip-emerald' : 'chip-indigo'}`}>
                  {alias(v) === 'CHAMPION' ? <Crown className="w-3 h-3" aria-hidden /> : <FlaskRound className="w-3 h-3" aria-hidden />}{alias(v)}
                </span>
              </div>
              <div className="text-sm text-ink-2">{v.algorithm} · {v.features.length} features</div>
              <div className="text-xs text-muted mt-1">{v.trainingWindow} · {fmtInt(v.trainRows)} training rows</div>
              <div className="flex gap-4 mt-3 text-sm num"><span>AUC <strong className="text-ink">{v.oot.auc.toFixed(3)}</strong></span><span>KS <strong className="text-ink">{v.oot.ks.toFixed(3)}</strong></span><span>Gini <strong className="text-ink">{v.oot.gini.toFixed(3)}</strong></span></div>
            </motion.button>
          ))}
        </div>
        <Card eyebrow="Out-of-time comparison" title={wins >= 2 ? 'The challenger trained on recent vintages wins' : 'Champion and challenger, side by side'} right={<div className="seg" role="group" aria-label="Show version">
          {(['V1', 'V2'] as const).map((v) => <button key={v} aria-pressed={sel === v} onClick={() => setSel(v)}>{v === 'V1' ? 'Champion V1' : 'Challenger V2'}</button>)}</div>}>
          <div className="grid gap-3 sm:grid-cols-3 mb-4">
            <MetricDuel label="AUC" a={v1.oot.auc} b={v2.oot.auc} />
            <MetricDuel label="KS" a={v1.oot.ks} b={v2.oot.ks} />
            <MetricDuel label="Gini" a={v1.oot.gini} b={v2.oot.gini} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm font-semibold text-ink mb-1">Calibration ({sel}): predicted vs. observed by decile</div>
              <div className="h-[220px]">
                <ResponsiveContainer>
                  <LineChart data={calib} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="decile" tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => fmtPct(v, 0)} tickLine={false} axisLine={false} width={42} />
                    <Tooltip formatter={(v) => fmtPct(Number(v), 1)} labelFormatter={(l) => `Score decile ${l}`} />
                    <Legend />
                    <Line dataKey="predicted" name="Predicted" stroke={COLOR[sel]} strokeWidth={2.4} dot={{ r: 3 }} />
                    <Line dataKey="observed" name="Observed" stroke="var(--coral)" strokeWidth={2.4} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-ink mb-1">Feature importance ({sel}, share of gain)</div>
              <div className="h-[220px]">
                <ResponsiveContainer>
                  <BarChart data={imp} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} interval={0} />
                    <Tooltip formatter={(v) => fmtPct(Number(v), 1)} />
                    <Bar dataKey="importance" fill={COLOR[sel]} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" eyebrow="Experiments" title="Training runs" right={<PoweredBy>Snowflake ML (XGBoost in a warehouse)</PoweredBy>}>
          <div className="overflow-x-auto -mx-5">
            <table className="tbl min-w-[560px]">
              <thead><tr><th className="pl-5">Run</th><th>Parameters</th><th>OOT AUC</th><th>KS</th><th>Gini</th><th className="pr-5">Registry</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.runId} style={{ cursor: 'default' }}>
                    <td className="pl-5 font-semibold" style={{ color: COLOR[r.version] }}>{r.runId}</td>
                    <td className="text-xs text-ink-2 font-mono">{Object.entries(r.params).map(([k, v]) => `${k}=${v}`).join(' ')}</td>
                    <td className="num">{r.auc.toFixed(4)}</td><td className="num">{r.ks.toFixed(4)}</td><td className="num">{r.gini.toFixed(4)}</td>
                    <td className="pr-5">{r.logged ? <span className="chip chip-emerald">Logged as {r.version}</span> : <span className="text-xs text-muted">Not logged</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card eyebrow="Next step" title={persona === 'validator' ? 'Review and approve' : 'Hand off to validation'}>
          <p className="text-sm text-ink-2 leading-relaxed mb-4">
            {verdict} Promotion moves the <code>CHAMPION</code> alias in the Model Registry, so the scoring task picks it up
            with no code change. It needs a model validator&apos;s sign-off on the model card.
          </p>
          <Link href="/model-card/?version=V2" className="btn btn-ai w-full"><Sparkles className="w-4 h-4" aria-hidden />Open V2 model card<ArrowRight className="w-4 h-4" aria-hidden /></Link>
        </Card>
      </div>
    </>
  );
}
