'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BellRing, Eye, Search, X as XIcon } from 'lucide-react';
import { Card, LiveError, Loading, PageHeader, PoweredBy, SourceChip } from '@/components/ui';
import { StoryBeats } from '@/components/StoryBeats';
import { useStudio } from '@/components/Studio';
import { activeVersion, getActions, useData, usePromotion } from '@/lib/credit-data';
import { useMode } from '@/lib/mode';
import { FILE_TYPE_LABELS, featureLabel, fmtPct, fmtUsd } from '@/lib/format';
import type { ActionRecord, QueueAccount } from '@/lib/types';

const ACTION_CHIP: Record<string, string> = { OUTREACH: 'chip-emerald', WATCHLIST: 'chip-indigo', DISMISS: '' };


function Spark({ prev, now }: { prev: number; now: number }) {
  const max = Math.max(prev, now, 0.05);
  const y = (v: number) => 22 - (v / max) * 18;
  return (
    <svg width="54" height="24" viewBox="0 0 54 24" aria-hidden>
      <line x1="4" y1={y(prev)} x2="50" y2={y(now)} stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy={y(prev)} r="2.5" fill="var(--muted)" /><circle cx="50" cy={y(now)} r="3" fill="var(--coral)" />
    </svg>
  );
}

export default function QueuePage() {
  const { mode } = useMode();
  const promotion = usePromotion();
  const q = useData('queue');
  const { persona, markBeat } = useStudio();
  const router = useRouter();
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [filter, setFilter] = useState<'open' | 'all' | 'actioned'>('open');
  const [file, setFile] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE = 15;

  useEffect(() => { if (mode) getActions(mode).then(setActions).catch(() => setActions([])); }, [mode]);
  useEffect(() => { if (promotion?.promoted) markBeat('queue-after'); }, [promotion?.promoted, markBeat]);

  const v = activeVersion(promotion?.promoted);
  const rows = useMemo(() => {
    if (!q.data) return [];
    const byId = new Map(actions.map((a) => [a.accountId, a]));
    return q.data.accounts
      .filter((a) => a[v].reasons.length > 0)
      .map((a) => ({ a, s: a[v], act: byId.get(a.accountId) }))
      .sort((x, y) => (y.s.pd - y.s.pdPrev) - (x.s.pd - x.s.pdPrev))
      .slice(0, 150)
      .filter(({ a, act }) => (filter === 'all' || (filter === 'open' ? !act : !!act))
        && (file === 'ALL' || a.fileType === file)
        && (!search || a.accountId.toLowerCase().includes(search.toLowerCase()) || a.borrowerName.toLowerCase().includes(search.toLowerCase())));
  }, [q.data, actions, v, filter, file, search]);
  useEffect(() => setPage(0), [filter, file, search, v]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  if (q.error) return <LiveError message={q.error} />;
  if (!q.data || !promotion) return <Loading />;
  const actioned = actions.length;
  const model = promotion.promoted ? 'V2 (champion, promoted)' : 'V1 (champion)';

  return (
    <>
      <PageHeader lens="queue" eyebrow="Early-warning queue" title="Performing accounts whose risk is rising fastest"
        right={<><SourceChip live={q.live} ms={q.ms} /><PoweredBy>Model Registry · model.run</PoweredBy><PoweredBy preview>explain</PoweredBy></>}>
        Ranked by the 3-month change in 12-month default probability from the current champion model, {model}. Reason codes are the
        largest positive SHAP contributions. Accounts 30+ days past due go to collections and are excluded.
      </PageHeader>

      <StoryBeats />

      {promotion.promoted && (
        <div className="card mb-5 p-4 flex flex-wrap items-center gap-3 text-sm" style={{ background: 'linear-gradient(90deg, var(--emerald-bg), var(--card) 70%)' }}>
          <BellRing className="w-4 h-4" style={{ color: 'var(--emerald)' }} aria-hidden />
          <span className="text-ink"><strong>Refreshed with the promoted champion (V2).</strong> Scores and reason codes now come from the challenger trained on recent vintages.</span>
          {promotion.approver && <span className="text-muted">Approved by {promotion.approver}{promotion.at ? ` · ${new Date(promotion.at).toLocaleString()}` : ''}</span>}
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 mb-5">
        {[
          { label: 'In queue', value: '150', sub: 'Top risers on the performing book' },
          { label: 'Open', value: String(150 - Math.min(150, actioned)), sub: 'Awaiting a decision' },
          { label: 'Actioned', value: String(actioned), sub: 'Outreach, watchlist, or dismissed' },
          { label: 'Scoring model', value: promotion.promoted ? 'V2' : 'V1', sub: promotion.promoted ? 'CHAMPION alias (promoted)' : 'CHAMPION alias' },
        ].map((k) => (
          <div key={k.label} className="card p-4"><div className="eyebrow">{k.label}</div><div className="font-display text-2xl mt-1 text-ink num">{k.value}</div><div className="text-xs text-muted mt-1">{k.sub}</div></div>
        ))}
      </div>

      <Card title="Queue" right={
        <>
          <label className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" aria-hidden />
            <span className="sr-only">Search accounts</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Account or name"
              className="pl-8 pr-3 py-1.5 rounded-full text-xs border w-44" style={{ background: 'var(--bg-2)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
          </label>
          <div className="seg" role="group" aria-label="File type">
            {['ALL', 'THICK', 'THIN', 'NEW_TO_CREDIT'].map((f) => (
              <button key={f} aria-pressed={file === f} onClick={() => setFile(f)}>{f === 'ALL' ? 'All files' : FILE_TYPE_LABELS[f]}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Status">
            {(['open', 'actioned', 'all'] as const).map((f) => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
          </div>
        </>
      }>
        <div className="overflow-x-auto -mx-5">
          <table className="tbl min-w-[960px]">
            <thead><tr>
              <th className="pl-5">Account</th><th>Segment</th><th>Balance</th><th>PD 3 mo ago → now</th><th>Change</th><th>Top reason codes</th><th className="pr-5">Status</th>
            </tr></thead>
            <tbody>
              {pageRows.map(({ a, s, act }) => (
                <tr key={a.accountId} onClick={() => router.push(`/account/?id=${a.accountId}`)}>
                  <td className="pl-5">
                    <Link href={`/account/?id=${a.accountId}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>{a.accountId}</Link>
                    <div className="text-xs text-muted">{a.borrowerName} · {a.state}</div>
                  </td>
                  <td><div className="text-ink-2">{a.product === 'AUTO' ? 'Auto' : 'Personal'}</div><div className="text-xs text-muted">{FILE_TYPE_LABELS[a.fileType]} · {a.vintage}</div></td>
                  <td className="num">{fmtUsd(a.balance)}</td>
                  <td><div className="flex items-center gap-2 num"><Spark prev={s.pdPrev} now={s.pd} /><span className="text-muted">{fmtPct(s.pdPrev)}</span>→<strong className="text-ink">{fmtPct(s.pd)}</strong></div></td>
                  <td><span className="chip chip-coral num">+{((s.pd - s.pdPrev) * 100).toFixed(1)} pts</span></td>
                  <td><div className="flex flex-wrap gap-1">{s.reasons.slice(0, 3).map((r) => <span key={r.feature} className="chip">{featureLabel(r.feature)}</span>)}</div></td>
                  <td className="pr-5">
                    {act ? <span className={`chip ${ACTION_CHIP[act.action]}`}>{act.action === 'OUTREACH' ? 'Outreach' : act.action === 'WATCHLIST' ? 'Watchlist' : 'Dismissed'}</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--emerald)' }}>Review<ArrowUpRight className="w-3.5 h-3.5" aria-hidden /></span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted">
                  No accounts match these filters. <button className="underline" onClick={() => { setFilter('all'); setFile('ALL'); setSearch(''); }}>Clear filters</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <span className="text-xs text-muted num">Showing {rows.length ? page * PAGE + 1 : 0}–{Math.min(rows.length, page * PAGE + PAGE)} of {rows.length}</span>
          <div className="flex items-center gap-1" role="navigation" aria-label="Queue pages">
            <button className="btn !py-1 !px-3 !text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            {Array.from({ length: pages }, (_, i) => i).filter((i) => Math.abs(i - page) <= 2 || i === 0 || i === pages - 1).map((i) => (
              <button key={i} className={`btn !py-1 !px-2.5 !text-xs num ${i === page ? 'btn-primary' : ''}`} aria-current={i === page ? 'page' : undefined} onClick={() => setPage(i)}>{i + 1}</button>
            ))}
            <button className="btn !py-1 !px-3 !text-xs" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted">
          <Eye className="w-3.5 h-3.5" aria-hidden />Viewing as {persona === 'manager' ? 'portfolio risk manager: open an account to assign outreach, watchlist, or dismiss' : 'a reviewer. Switch to Portfolio risk manager to take actions'}.
          {mode === 'sample' && <span className="inline-flex items-center gap-1"><XIcon className="w-3 h-3" aria-hidden />Sample-mode decisions are saved in this browser only.</span>}
        </div>
      </Card>
    </>
  );
}
