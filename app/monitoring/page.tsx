'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Radar, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiSourceBadge, Card, LiveError, Loading, PageHeader, PoweredBy, SourceChip } from '@/components/ui';
import { Reasoning, STEPS } from '@/components/Reasoning';
import { StoryBeats } from '@/components/StoryBeats';
import { useStudio } from '@/components/Studio';
import { useData } from '@/lib/credit-data';
import { liveJson, useMode } from '@/lib/mode';
import { sampleDelayMs, wait } from '@/lib/sample-timing';
import { featureLabel, fmtPct } from '@/lib/format';

const FEATS = ['UTILIZATION', 'FICO', 'APR', 'INQUIRIES_6M', 'DTI', 'PAY_RATIO_3M'];
const LINE: Record<string, string> = { UTILIZATION: 'var(--coral)', FICO: 'var(--emerald)', APR: 'var(--indigo)', INQUIRIES_6M: '#8a7cc4', DTI: '#9aa7a1', PAY_RATIO_3M: 'var(--amber)' };

function heat(v: number, t: number) {
  if (v >= t) return { background: 'var(--coral)', color: '#fff' };
  if (v >= 0.1) return { background: 'var(--amber-bg)', color: 'var(--amber)' };
  return { background: 'var(--emerald-bg)', color: 'var(--emerald)' };
}

export default function Monitoring() {
  const d = useData('monitoring');
  const { mode } = useMode();
  const { markBeat, persona } = useStudio();
  const [feat, setFeat] = useState('UTILIZATION');
  const [check, setCheck] = useState<{ running: boolean; result?: { psi: number; month: string; ms: number; live: boolean } ; err?: string }>({ running: false });
  const [expected, setExpected] = useState(6000);
  useEffect(() => { if (d.data) markBeat('psi'); }, [d.data, markBeat]);
  if (d.error) return <LiveError message={d.error} />;
  if (!d.data) return <Loading />;
  const t = d.data.threshold;
  const latest = d.data.psi.at(-1)!;
  const util = Number(latest.UTILIZATION);
  const crossed = d.data.psi.find((r) => Number(r.UTILIZATION) > t);
  const dist = d.data.distributions[feat] ?? [];

  const runCheck = async () => {
    if (!mode) return;
    const ms = mode === 'sample' ? sampleDelayMs() : 12000;
    setExpected(ms);
    setCheck({ running: true });
    const t0 = performance.now();
    try {
      if (mode === 'sample') {
        await wait(ms);
        setCheck({ running: false, result: { psi: util, month: String(latest.month), ms: performance.now() - t0, live: false } });
      } else {
        const r = await liveJson<{ psi: number; month: string }>('/api/monitor-check');
        setCheck({ running: false, result: { ...r, ms: performance.now() - t0, live: true } });
      }
    } catch (e) { setCheck({ running: false, err: (e as Error).message }); }
  };

  return (
    <>
      <PageHeader eyebrow="Monitoring · drift and stability" title="Is the book still the one the model learned?"
        right={<><SourceChip live={d.live} ms={d.ms} /><PoweredBy>ML Observability (model monitor)</PoweredBy></>}>
        Population stability index (PSI) compares each month&apos;s performing book with the champion&apos;s training sample (2023-01 to 2024-09 vintages). Above {t} is the
        conventional alert level for a material shift.
      </PageHeader>

      <StoryBeats />

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card p-6 relative overflow-hidden"
          style={{ borderColor: 'color-mix(in srgb, var(--coral) 50%, var(--line))', background: 'linear-gradient(160deg, var(--coral-bg), var(--card) 55%)' }}>
          <div className="flex items-center gap-2 mb-3"><span className="alert-dot" aria-hidden /><span className="eyebrow" style={{ color: 'var(--coral)' }}>Drift alert · open</span></div>
          <div className="font-display text-5xl text-ink num">{util.toFixed(2)}</div>
          <div className="text-sm text-ink-2 mt-1">PSI for revolving utilization, {latest.month}</div>
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
            <motion.div className="h-full" style={{ background: 'linear-gradient(90deg, var(--amber), var(--coral))' }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (util / 0.5) * 100)}%` }} transition={{ duration: 1.1 }} />
          </div>
          <div className="flex justify-between text-[11px] text-muted mt-1"><span>0</span><span>Threshold {t}</span><span>0.5</span></div>
          <p className="text-sm text-ink-2 mt-4">Above threshold since <strong className="text-ink">{crossed?.month}</strong>. Every other monitored feature is below 0.01. Vintages from 2025 on carry higher utilization, and it predicts default more strongly than in the training data.</p>
          <Link href="/workbench/" className="btn btn-primary w-full mt-4">{persona === 'scientist' ? 'Compare the challenger' : 'See the retrained challenger'}<ArrowRight className="w-4 h-4" aria-hidden /></Link>
        </motion.div>

        <Card className="lg:col-span-2" eyebrow="PSI over time" title="Feature stability, month by month" right={<PoweredBy>Snowflake SQL (fixed bins)</PoweredBy>}>
          <div className="h-[290px]">
            <ResponsiveContainer>
              <LineChart data={d.data.psi} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis domain={[0, (max: number) => Math.max(0.4, Math.ceil(max * 10) / 10)]} ticks={[0, 0.1, 0.2, 0.25, 0.3, 0.4]} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v, n) => [Number(v).toFixed(3), featureLabel(String(n))]} />
                <Legend formatter={(v) => featureLabel(String(v))} />
                <ReferenceLine y={t} stroke="var(--coral)" strokeDasharray="5 4" label={{ value: `Alert ${t}`, fill: 'var(--coral)', fontSize: 11, position: 'insideTopLeft' }} />
                {FEATS.map((f) => <Line key={f} dataKey={f} stroke={LINE[f]} strokeWidth={f === 'UTILIZATION' ? 3 : 1.6} dot={f === 'UTILIZATION' ? { r: 3 } : false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" eyebrow="Characteristic stability" title="PSI heatmap by feature">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate" style={{ borderSpacing: 3 }}>
              <thead><tr><th className="text-left text-muted font-semibold pr-2">Feature</th>{d.data.psi.map((r) => <th key={String(r.month)} className="text-muted font-semibold">{String(r.month).slice(2)}</th>)}</tr></thead>
              <tbody>
                {FEATS.map((f) => (
                  <tr key={f}>
                    <td className="pr-2 whitespace-nowrap"><button className={`text-left font-semibold ${feat === f ? 'text-ink underline' : 'text-ink-2'}`} onClick={() => setFeat(f)}>{featureLabel(f)}</button></td>
                    {d.data!.psi.map((r) => <td key={String(r.month)} className="text-center rounded-md py-1.5 num font-semibold" style={heat(Number(r[f]), t)}>{Number(r[f]).toFixed(2)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted mt-3">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: 'var(--emerald-bg)' }} />Stable (&lt; 0.10)</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: 'var(--amber-bg)' }} />Watch (0.10–{t})</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle" style={{ background: 'var(--coral)' }} />Alert (&gt; {t})</span>
          </div>
        </Card>

        <Card className="lg:col-span-2" eyebrow="Distribution shift" title={`${featureLabel(feat)}: training vs. ${latest.month}`}>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={dist} margin={{ top: 4, right: 4, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="bin" tickLine={false} axisLine={false} interval={0} angle={-30} textAnchor="end" height={46} />
                <YAxis tickFormatter={(x) => fmtPct(x, 0)} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(x) => fmtPct(Number(x), 1)} />
                <Legend />
                <Bar dataKey="baseline" name="Training sample" fill="var(--muted)" radius={[5, 5, 0, 0]} />
                <Bar dataKey="current" name={String(latest.month)} fill={LINE[feat]} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3">
            {!check.running && !check.result && (
              <button className="btn btn-ai w-full" onClick={runCheck}><Radar className="w-4 h-4" aria-hidden />Run drift check on the model monitor</button>
            )}
            {check.running && <Reasoning steps={STEPS.drift} expectedMs={expected} title="Checking drift" />}
            {check.result && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 border" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
                <div className="flex flex-wrap items-center gap-2 mb-2"><TriangleAlert className="w-4 h-4" style={{ color: 'var(--coral)' }} aria-hidden />
                  <strong className="text-sm text-ink">Utilization PSI {check.result.psi.toFixed(3)} for {check.result.month}</strong>
                  {check.result.live ? <AiSourceBadge live feature="MODEL_MONITOR_DRIFT_METRIC" ms={check.result.ms} /> : <span className="chip chip-amber">Sample result</span>}
                </div>
                <p className="text-xs text-ink-2">Above the {t} threshold: open a retraining review. {check.result.live ? 'Computed by CREDIT_DEFAULT_V1_MONITOR against its baseline.' : 'In Live mode this value comes from CREDIT_DEFAULT_V1_MONITOR.'}</p>
              </motion.div>
            )}
            {check.err && <p role="alert" className="text-xs mt-2" style={{ color: 'var(--coral)' }}>Live call failed: {check.err}</p>}
          </div>
        </Card>
      </div>
    </>
  );
}
