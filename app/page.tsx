'use client';

import Link from 'next/link';
import { ArrowRight, Banknote, Gauge, Layers3, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Kpi, LiveError, Loading, PageHeader, PoweredBy, SourceChip } from '@/components/ui';
import { StoryBeats } from '@/components/StoryBeats';
import { useStudio } from '@/components/Studio';
import { useData } from '@/lib/credit-data';
import { fmtInt, fmtPct, fmtUsdShort } from '@/lib/format';

const VINTAGE_COLORS = ['#9aa7a1', '#7f9a90', '#5f8e80', '#3f8371', '#1f7a63', 'var(--indigo)', 'var(--coral)'];
const DPD_COLORS: Record<string, string> = { Current: 'var(--emerald)', '1-29': 'var(--indigo)', '30-59': 'var(--amber)', '60-89': '#d9822b', '90+': 'var(--coral)' };

export default function Overview() {
  const p = useData('portfolio');
  const m = useData('monitoring');
  const { persona } = useStudio();
  if (p.error) return <LiveError message={p.error} />;
  if (!p.data || !m.data) return <Loading />;
  const d = p.data;
  const latest = m.data.psi.at(-1)!;
  const utilPsi = Number(latest.UTILIZATION);
  const crossed = m.data.psi.find((r) => Number(r.UTILIZATION) > m.data!.threshold);

  // Every fourth quarter plus the two most recent full-history vintages keeps the chart readable.
  const shown = d.vintages.filter((v, i) => (i % 2 === 0 && v.curve.length >= 6) || v.vintage === '2025-Q1' || v.vintage === '2025-Q2').slice(-7);
  const vintageRows = Array.from({ length: 22 }, (_, k) => {
    const mob = k + 3;
    const row: Record<string, number | null> = { mob };
    for (const v of shown) row[v.vintage] = v.curve.find((c) => c.mob === mob)?.cumDefaultRate ?? null;
    return row;
  });

  return (
    <>
      <PageHeader eyebrow={`Portfolio overview · as of ${d.asOf}`} title="Your consumer loan book, scored and monitored in place"
        right={<><SourceChip live={p.live} ms={p.ms} /><PoweredBy>Snowflake SQL + Model Registry</PoweredBy></>}>
        Personal and auto installment loans with monthly bureau and payment history. Every number on this page is computed from tables
        in Snowflake{p.live ? '' : ' (here, from the bundled synthetic copy)'}; nothing is extracted to a laptop.
      </PageHeader>

      <StoryBeats />

      {crossed && (
        <Link href="/monitoring/" className="card card-lift mb-6 p-4 flex items-center gap-4" style={{ borderColor: 'color-mix(in srgb, var(--coral) 45%, var(--line))', background: 'linear-gradient(90deg, var(--coral-bg), var(--card) 60%)' }}>
          <span className="alert-dot" aria-hidden />
          <TriangleAlert className="w-5 h-5 shrink-0" style={{ color: 'var(--coral)' }} aria-hidden />
          <div className="flex-1 text-sm">
            <strong className="text-ink">Drift alert: revolving utilization PSI is {utilPsi.toFixed(2)}</strong>
            <span className="text-ink-2"> (threshold {m.data.threshold}). It crossed the threshold in {crossed.month}. The champion model was trained before 2025 vintages arrived.</span>
          </div>
          <span className="hidden md:inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--coral)' }}>
            {persona === 'validator' ? 'Review drift' : 'See monitoring'}<ArrowRight className="w-4 h-4" aria-hidden /></span>
        </Link>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 mb-4">
        <Kpi label="Active loans" value={d.kpis.activeLoans} format={(x) => fmtInt(Math.round(x))} icon={<Layers3 className="w-4 h-4" />} sub="Open at month end" />
        <Kpi label="Outstanding balance" value={d.kpis.balance} format={fmtUsdShort} icon={<Banknote className="w-4 h-4" />} sub="Exposure at default (EAD) proxy" delay={0.05} />
        <Kpi label="30+ DPD rate" value={d.kpis.dpd30Rate} format={(x) => fmtPct(x, 2)} tone="amber" icon={<Gauge className="w-4 h-4" />} sub="Share of balance 30+ days past due" delay={0.1} />
        <Kpi label="Expected loss (12 mo)" value={d.kpis.expectedLoss} format={fmtUsdShort} tone="coral" icon={<TriangleAlert className="w-4 h-4" />}
          sub={<>{fmtPct(d.kpis.elRate, 2)} of balance · PD × LGD × EAD, illustrative</>} delay={0.15} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <Card className="lg:col-span-2" eyebrow="Vintage curves" title="Cumulative 90+ DPD rate by months on book" delay={0.1}
          right={<span className="chip">Quarterly origination cohorts</span>}>
          <div className="h-[300px]">
            <ResponsiveContainer>
              <LineChart data={vintageRows} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="mob" tickLine={false} axisLine={false} label={{ value: 'Months on book', position: 'insideBottom', offset: -2, fill: 'var(--muted)', fontSize: 11 }} height={34} />
                <YAxis tickFormatter={(v) => fmtPct(v, 0)} ticks={[0, 0.02, 0.04, 0.06, 0.08, 0.1]} domain={[0, 0.1]} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => fmtPct(Number(v), 2)} labelFormatter={(l) => `Month ${l} on book`} />
                <Legend iconType="plainline" />
                {shown.map((v, i) => (
                  <Line key={v.vintage} dataKey={v.vintage} type="monotone" dot={false} connectNulls={false}
                    stroke={VINTAGE_COLORS[i + (VINTAGE_COLORS.length - shown.length)]} strokeWidth={v.vintage >= '2025' ? 2.6 : 1.8} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted mt-2">2025 vintages (indigo and coral) run slightly ahead of earlier cohorts at the same age, consistent with the utilization shift the monitor flags.</p>
        </Card>

        <Card eyebrow="Delinquency" title="Balance by DPD bucket" delay={0.15}>
          <div className="h-[230px]">
            <ResponsiveContainer>
              <BarChart data={d.dpdBuckets.filter((b) => b.bucket !== 'Current')} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtUsdShort} tickLine={false} axisLine={false} width={66} />
                <Tooltip formatter={(v) => fmtUsdShort(Number(v))} />
                <Bar dataKey="balance" radius={[8, 8, 0, 0]}>
                  {d.dpdBuckets.filter((b) => b.bucket !== 'Current').map((b) => <Cell key={b.bucket} fill={DPD_COLORS[b.bucket]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-between text-xs mt-2 text-ink-2">
            <span>Current: <strong className="num text-ink">{fmtUsdShort(d.dpdBuckets.find((b) => b.bucket === 'Current')!.balance)}</strong></span>
            <span className="text-muted">Delinquent buckets shown</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" eyebrow="Segment trend" title="Average revolving utilization on the performing book" delay={0.2}
          right={<span className="chip chip-coral">Drift driver</span>}>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <AreaChart data={d.trend} margin={{ top: 6, right: 12, left: -8, bottom: 0 }}>
                <defs><linearGradient id="ut" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--coral)" stopOpacity={0.35} /><stop offset="1" stopColor="var(--coral)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis domain={['dataMin - 0.01', 'dataMax + 0.01']} tickFormatter={(v) => fmtPct(v, 0)} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => fmtPct(Number(v), 1)} />
                <Area dataKey="avgUtilization" name="Average utilization" stroke="var(--coral)" strokeWidth={2.4} fill="url(#ut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card eyebrow="Mix" title="Balance by product" delay={0.25}>
          <div className="h-[220px] relative">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={d.byProduct} dataKey="balance" nameKey="product" innerRadius={62} outerRadius={92} paddingAngle={3} stroke="none">
                  {d.byProduct.map((b) => <Cell key={b.product} fill={b.product === 'AUTO' ? 'var(--indigo)' : 'var(--emerald)'} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtUsdShort(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
              <div><div className="font-display text-xl text-ink num">{fmtUsdShort(d.kpis.balance)}</div><div className="text-[11px] text-muted">total</div></div>
            </div>
          </div>
          <div className="flex justify-center gap-4 text-xs text-ink-2">
            {d.byProduct.map((b) => (
              <span key={b.product} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.product === 'AUTO' ? 'var(--indigo)' : 'var(--emerald)' }} />
                {b.product === 'AUTO' ? 'Auto' : 'Personal'} · {fmtInt(b.loans)}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
