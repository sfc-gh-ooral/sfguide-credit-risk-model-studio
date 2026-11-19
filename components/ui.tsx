'use client';

import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { AlertTriangle, FlaskConical, Layers, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { PersonaLens, type LensPage } from './PersonaLens';

export function PageHeader({ eyebrow, title, children, right, lens }: { eyebrow: string; title: string; children?: React.ReactNode; right?: React.ReactNode; lens?: LensPage }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-7">
      <div className="max-w-3xl">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="font-display text-3xl md:text-[40px] leading-tight text-ink [overflow-wrap:anywhere]">{title}</h1>
        {children && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{children}</p>}
        {lens && <PersonaLens page={lens} />}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </motion.div>
  );
}

export function Card({ title, eyebrow, right, children, className = '', delay = 0 }: {
  title?: React.ReactNode; eyebrow?: string; right?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }}
      className={`card p-5 min-w-0 ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="font-display text-lg text-ink">{title}</h2>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </motion.section>
  );
}

// Number that counts up on first render.
export function CountUp({ value, format }: { value: number; format: (x: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => { const c = animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] }); return () => c.stop(); }, [mv, value]);
  return <motion.span className="num">{text}</motion.span>;
}

export function Kpi({ label, value, format, sub, tone = 'ink', icon, delay = 0 }: {
  label: string; value: number; format: (x: number) => string; sub?: React.ReactNode; tone?: 'ink' | 'emerald' | 'amber' | 'coral' | 'indigo';
  icon?: React.ReactNode; delay?: number;
}) {
  const color = { ink: 'var(--ink)', emerald: 'var(--emerald)', amber: 'var(--amber)', coral: 'var(--coral)', indigo: 'var(--indigo)' }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay }} className="card card-lift p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        {icon && <span className="opacity-70" style={{ color }}>{icon}</span>}
      </div>
      <div className="font-display text-[30px] mt-2 leading-none" style={{ color }}><CountUp value={value} format={format} /></div>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </motion.div>
  );
}

// "Powered by" badge: names the Snowflake capability behind a component.
export function PoweredBy({ children, preview }: { children: React.ReactNode; preview?: boolean }) {
  return (
    <span className="chip" title="Snowflake capability behind this component">
      <Layers className="w-3 h-3" style={{ color: 'var(--emerald)' }} aria-hidden />Powered by {children}
      {preview && <span className="chip-amber rounded-full px-1.5 py-px text-[10px] font-bold">Preview</span>}
    </span>
  );
}

export function AiSourceBadge({ live, feature, ms }: { live: boolean; feature: string; ms?: number }) {
  return live ? (
    <span className="chip chip-emerald"><Sparkles className="w-3 h-3" aria-hidden />{feature} · live{ms != null ? ` · ${(ms / 1000).toFixed(1)} s` : ''}</span>
  ) : (
    <span className="chip chip-amber"><FlaskConical className="w-3 h-3" aria-hidden />Sample AI response</span>
  );
}

export function SourceChip({ live, ms, what = 'data' }: { live: boolean; ms?: number; what?: string }) {
  return live
    ? <span className="chip chip-emerald">Live {what} · CREDIT_RISK_STUDIO{ms != null ? ` · ${(ms / 1000).toFixed(1)} s` : ''}</span>
    : <span className="chip chip-amber">Sample {what} (synthetic, bundled)</span>;
}

export function LiveError({ message }: { message: string }) {
  return (
    <div role="alert" className="card p-4 mb-6 flex items-start gap-3 text-sm" style={{ borderColor: 'var(--coral)' }}>
      <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--coral)' }} aria-hidden />
      <div className="text-ink-2"><strong style={{ color: 'var(--coral)' }}>Live query failed.</strong> {message} No sample data was
        substituted. Check <code>.env.local</code> and that <code>sql/setup.sql</code> finished, or switch to Sample.</div>
    </div>
  );
}

export function Skeleton({ h = 120, className = '' }: { h?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h }} aria-hidden />;
}

export function Loading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={112} />)}</div>
      <Skeleton h={320} />
    </div>
  );
}
