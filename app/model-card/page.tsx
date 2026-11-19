'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, BadgeCheck, Crown, Database, FileText, GitBranch, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AiSourceBadge, Card, LiveError, Loading, PageHeader, PoweredBy, SourceChip } from '@/components/ui';
import { Reasoning, STEPS } from '@/components/Reasoning';
import { StoryBeats } from '@/components/StoryBeats';
import { useStudio } from '@/components/Studio';
import { draftModelCard, promoteChallenger, useData, usePromotion } from '@/lib/credit-data';
import { useMode } from '@/lib/mode';
import { MODEL_CARD_SECTIONS } from '@/lib/sample-ai';
import { FILE_TYPE_LABELS, fmtInt, fmtPct, fmtPts } from '@/lib/format';
import { PERSONAS } from '@/lib/types';

const LINEAGE = [
  { icon: Database, title: 'RAW', items: ['BORROWERS', 'LOANS', 'BUREAU_SNAPSHOTS_MONTHLY', 'PAYMENTS_MONTHLY', 'DEFAULTS'], note: 'Synthetic source tables' },
  { icon: Workflow, title: 'Feature Store', items: ['LOAN_ATTRIBUTES v1', 'LOAN_BEHAVIOR v1'], note: 'Feature views on Dynamic Tables' },
  { icon: GitBranch, title: 'Training set', items: ['ML.TRAINING_SPINE', 'Point-in-time join at month 3'], note: 'generate_training_set' },
  { icon: Crown, title: 'Model Registry', items: ['CREDIT_DEFAULT_MODEL', 'V1 · V2 with aliases'], note: 'Versions, metrics, explain' },
  { icon: ShieldCheck, title: 'Scoring + monitor', items: ['SCORE_PORTFOLIO_TASK', 'CREDIT_DEFAULT_V1_MONITOR'], note: 'model.run · ML Observability' },
];

function Lineage() {
  return (
    <div className="grid gap-3 md:grid-cols-5 relative">
      {LINEAGE.map((n, i) => (
        <motion.div key={n.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }} className="relative">
          <div className="rounded-2xl p-3.5 h-full border" style={{ background: 'var(--card-2)', borderColor: 'var(--line)' }}>
            <div className="flex items-center gap-2 mb-2"><n.icon className="w-4 h-4" style={{ color: i === 3 ? 'var(--indigo)' : 'var(--emerald)' }} aria-hidden /><span className="font-semibold text-sm text-ink">{n.title}</span></div>
            <ul className="space-y-0.5 text-[11.5px] font-mono text-ink-2">{n.items.map((it) => <li key={it}>{it}</li>)}</ul>
            <div className="text-[11px] text-muted mt-2">{n.note}</div>
          </div>
          {i < LINEAGE.length - 1 && (
            <svg className="hidden md:block absolute top-1/2 -right-3 w-3 h-4 -translate-y-1/2 z-10" viewBox="0 0 12 16" aria-hidden>
              <path d="M0 8 H10 M6 3 L11 8 L6 13" stroke="var(--emerald)" strokeWidth="1.6" fill="none" strokeDasharray="3 2"><animate attributeName="stroke-dashoffset" from="10" to="0" dur="1s" repeatCount="indefinite" /></path>
            </svg>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function Draft({ text }: { text: string }) {
  return (
    <div className="prose-ai text-sm text-ink-2">
      {text.split('\n\n').map((para, i) => (
        <p key={i}>{para.split(/(\*\*[^*]+\*\*)/).map((t, j) => (t.startsWith('**') ? <strong key={j}>{t.slice(2, -2)}</strong> : t))}</p>
      ))}
    </div>
  );
}

function ModelCard() {
  const params = useSearchParams();
  const { mode } = useMode();
  const m = useData('models');
  const [refresh, setRefresh] = useState(0);
  const promotion = usePromotion(refresh);
  const { persona, setPersona } = useStudio();
  const [version, setVersion] = useState<'V1' | 'V2'>((params.get('version') as 'V1' | 'V2') ?? 'V2');
  const [section, setSection] = useState<string>('changes');
  const [draft, setDraft] = useState<{ text: string; ms: number; live: boolean } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [note, setNote] = useState('Approved: V2 outperforms V1 out of time and reflects post-2025 utilization. Condition: monthly new-to-credit calibration review.');
  const [err, setErr] = useState('');
  const [expected] = useState(() => 5000 + Math.round(Math.random() * 2500));

  if (m.error) return <LiveError message={m.error} />;
  if (!m.data || !promotion) return <Loading />;
  const v = m.data.versions.find((x) => x.version === version)!;
  const alias = promotion.promoted ? (version === 'V2' ? 'CHAMPION' : 'PREVIOUS_CHAMPION') : v.alias;
  const fair = v.oot.fairness.map((f) => ({ ...f, label: FILE_TYPE_LABELS[f.segment] }));
  const ntc = v.oot.fairness.find((f) => f.segment === 'NEW_TO_CREDIT')!;

  const runDraft = async () => {
    if (!mode) return;
    setDrafting(true); setDraft(null); setErr('');
    try { const r = await draftModelCard(mode, section, version); setDraft({ text: r.text, ms: r.ms, live: mode === 'live' }); }
    catch (e) { setErr((e as Error).message); }
    finally { setDrafting(false); }
  };
  const promote = async () => {
    if (!mode) return;
    setPromoting(true); setErr('');
    try { await promoteChallenger(mode, note.trim(), PERSONAS.validator.label); setRefresh((x) => x + 1); }
    catch (e) { setErr((e as Error).message); }
    finally { setPromoting(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Model card · model validator" title={`${m.data.modelName} · ${version}`}
        right={<>
          <div className="seg" role="group" aria-label="Version">{(['V1', 'V2'] as const).map((x) => <button key={x} aria-pressed={version === x} onClick={() => { setVersion(x); setDraft(null); }}>{x}</button>)}</div>
          <span className={`chip ${alias === 'CHAMPION' ? 'chip-emerald' : 'chip-indigo'}`}>{alias}</span>
          <SourceChip live={m.live} what="model metadata" />
        </>}>
        One place for the evidence model risk management (MRM) asks for under SR 11-7-style expectations: what data trained the model, how
        it performs out of time and by segment, how it drifts, and who approved it.
      </PageHeader>

      <StoryBeats refreshKey={refresh} />

      <Card eyebrow="Lineage" title="From source tables to scores, all inside one account" className="mb-4" right={<PoweredBy>Feature Store · Model Registry</PoweredBy>}>
        <Lineage />
        <p className="text-xs text-muted mt-3">Objects created by <code>sql/setup.sql</code>. Training reads features through the Feature Store, so no extract or local copy of borrower data is needed.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5 mb-4">
        <Card className="lg:col-span-3" eyebrow="Fairness by segment (illustrative)" title="Predicted vs. observed default rate, out of time">
          <div className="h-[240px]">
            <ResponsiveContainer>
              <BarChart data={fair} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(x) => fmtPct(x, 0)} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(x) => fmtPct(Number(x), 1)} />
                <Legend />
                <Bar dataKey="predicted" name={`Predicted (${version})`} fill={version === 'V1' ? 'var(--emerald)' : 'var(--indigo)'} radius={[6, 6, 0, 0]} />
                <Bar dataKey="observed" name="Observed" fill="var(--coral)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl p-3 mt-2 text-sm flex gap-2" style={{ background: 'var(--amber-bg)' }}>
            <span className="font-semibold" style={{ color: 'var(--amber)' }}>Finding:</span>
            <span className="text-ink-2">New-to-credit borrowers are underpredicted by {fmtPts(ntc.observed - ntc.predicted)} ({fmtPct(ntc.predicted)} predicted vs. {fmtPct(ntc.observed)} observed, n = {fmtInt(ntc.n)}) on this synthetic data set.</span>
          </div>
        </Card>
        <Card className="lg:col-span-2" eyebrow="Version history" title="Registry versions and approvals" right={<PoweredBy>Model Registry aliases</PoweredBy>}>
          <ul className="space-y-3">
            {m.data.versions.map((x) => {
              const a = promotion.promoted ? (x.version === 'V2' ? 'CHAMPION' : 'PREVIOUS_CHAMPION') : x.alias;
              return (
                <li key={x.version} className="rounded-xl p-3 border" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex items-center justify-between"><strong className="text-ink">{x.version}</strong><span className={`chip ${a === 'CHAMPION' ? 'chip-emerald' : 'chip-indigo'}`}>{a}</span></div>
                  <div className="text-xs text-muted mt-1">{x.algorithm} · {x.trainingWindow}</div>
                  <div className="text-xs text-ink-2 mt-1 num">OOT AUC {x.oot.auc.toFixed(3)} · KS {x.oot.ks.toFixed(3)}</div>
                </li>
              );
            })}
            <li className="rounded-xl p-3 text-xs" style={{ background: promotion.promoted ? 'var(--emerald-bg)' : 'var(--bg-2)' }}>
              {promotion.promoted
                ? <><BadgeCheck className="inline w-3.5 h-3.5 mr-1 -mt-0.5" style={{ color: 'var(--emerald)' }} aria-hidden /><strong className="text-ink">V2 approved</strong> by {promotion.approver}{promotion.at ? ` on ${new Date(promotion.at).toLocaleDateString()}` : ''}{promotion.note ? `: “${promotion.note}”` : ''}</>
                : <span className="text-ink-2">V2 is awaiting validator approval.</span>}
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" eyebrow="Documentation" title="AI-drafted model card section" right={<PoweredBy>AI_COMPLETE</PoweredBy>}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="seg" role="group" aria-label="Section">
              {MODEL_CARD_SECTIONS.map((s) => <button key={s.id} aria-pressed={section === s.id} onClick={() => { setSection(s.id); setDraft(null); }}>{s.label}</button>)}
            </div>
            <button className="btn btn-ai" onClick={runDraft} disabled={drafting}><Sparkles className="w-4 h-4" aria-hidden />{drafting ? 'Drafting…' : 'Draft with AI'}</button>
          </div>
          {drafting && <Reasoning steps={STEPS.modelCard} expectedMs={mode === 'sample' ? 6000 : 9000} title="Drafting documentation" />}
          {!drafting && draft && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 border" style={{ borderColor: 'var(--line)', background: 'var(--card-2)' }}>
              <div className="flex flex-wrap items-center gap-2 mb-3"><FileText className="w-4 h-4 text-muted" aria-hidden /><span className="text-sm font-semibold text-ink">{MODEL_CARD_SECTIONS.find((s) => s.id === section)!.label} · {version}</span>
                <AiSourceBadge live={draft.live} feature="AI_COMPLETE" ms={draft.ms} /><span className="chip">Draft · needs validator review</span></div>
              <Draft text={draft.text} />
            </motion.div>
          )}
          {!drafting && !draft && (
            <div className="rounded-2xl p-6 text-center text-sm text-muted border border-dashed" style={{ borderColor: 'var(--line)' }}>
              Pick a section and draft it from this version&apos;s registry metrics, fairness results, and drift findings. The validator edits and owns the final text.
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" eyebrow="Decision" title={promotion.promoted ? 'V2 is the champion' : 'Promote the challenger'}>
          {promoting ? (
            <Reasoning steps={STEPS.promote} expectedMs={mode === 'sample' ? expected + 2500 : 60000} title="Promoting V2" />
          ) : promotion.promoted ? (
            <div>
              <p className="text-sm text-ink-2 mb-4">The <code>CHAMPION</code> alias now points to V2, and the scoring task re-scored the performing book with it. The early-warning queue shows V2&apos;s scores and reason codes.</p>
              <Link href="/queue/" className="btn btn-primary w-full">See the refreshed queue<ArrowRight className="w-4 h-4" aria-hidden /></Link>
            </div>
          ) : (
            <div>
              <p className="text-sm text-ink-2 mb-3">Approving records your decision, moves the <code>CHAMPION</code> alias to V2 (V1 becomes <code>PREVIOUS_CHAMPION</code>), and re-runs batch scoring.</p>
              <label htmlFor="appr" className="block text-xs font-semibold text-ink-2 mb-1.5">Approval note</label>
              <textarea id="appr" rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={persona !== 'validator'}
                className="w-full rounded-xl border p-3 text-sm mb-3" style={{ background: 'var(--card-2)', borderColor: 'var(--line)', color: 'var(--ink)' }} />
              <button className="btn btn-primary w-full" onClick={promote} disabled={persona !== 'validator' || !note.trim() || version !== 'V2'}>
                <BadgeCheck className="w-4 h-4" aria-hidden />Approve and promote V2</button>
              {persona !== 'validator' && <p className="text-xs text-muted mt-2">Only a model validator can approve.{' '}<button className="underline font-semibold text-ink-2" onClick={() => setPersona('validator')}>View as model validator</button></p>}
              {version !== 'V2' && persona === 'validator' && <p className="text-xs text-muted mt-2">Switch to V2 to approve the challenger.</p>}
            </div>
          )}
          {err && <p role="alert" className="text-xs mt-3" style={{ color: 'var(--coral)' }}>Live call failed: {err}</p>}
        </Card>
      </div>
    </>
  );
}

export default function ModelCardPage() {
  return <Suspense fallback={<Loading />}><ModelCard /></Suspense>;
}
