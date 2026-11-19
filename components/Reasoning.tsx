'use client';

// Staged progress for AI and compute actions. Each step names work the live path really does. In
// Sample mode the steps advance over the simulated delay; in Live mode they advance on a timer while
// the real call runs and the last step holds until it returns.
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export const STEPS = {
  modelCard: [
    'Reading MODEL_EVAL metrics and lineage for the selected version',
    'Collecting fairness by segment and drift results',
    'Drafting the section with AI_COMPLETE',
    'Formatting for the model card',
  ],
  promote: [
    'Recording the approval in APP.MODEL_APPROVALS',
    'Moving the CHAMPION alias to V2 in the Model Registry',
    'Running SCORE_PORTFOLIO_TASK (model.run on the performing book)',
    'Computing SHAP reason codes with explain',
    'Refreshing the early-warning queue',
  ],
  drift: [
    'Querying MODEL_MONITOR_DRIFT_METRIC on CREDIT_DEFAULT_V1_MONITOR',
    'Comparing the current book with the training baseline',
    'Checking PSI against the 0.25 alert threshold',
  ],
};

export function Reasoning({ steps, expectedMs, title = 'Working' }: { steps: string[]; expectedMs: number; title?: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => window.clearInterval(id);
  }, []);
  const per = expectedMs / steps.length;
  const step = Math.min(steps.length - 1, Math.floor(elapsed / per));
  return (
    <div className="reasoning" role="status" aria-live="polite">
      <div className="relative flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: 'var(--indigo)' }}>
          <span className="reasoning-orb" aria-hidden />{title}
        </div>
        <span className="text-[11px] num text-muted">{(elapsed / 1000).toFixed(1)} s</span>
      </div>
      <ol className="relative space-y-2">
        {steps.map((s, i) => {
          const state = i < step ? 'done' : i === step ? 'active' : 'todo';
          return (
            <li key={s} className={`reasoning-step ${state} flex items-center gap-2.5 text-[13px]`}>
              {state === 'done' ? <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--emerald)' }} aria-hidden />
                : state === 'active' ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: 'var(--indigo)' }} aria-hidden />
                : <span className="w-4 h-4 shrink-0 rounded-full border" style={{ borderColor: 'var(--line)' }} aria-hidden />}
              <span>{s}</span>
            </li>
          );
        })}
      </ol>
      <div className="reasoning-bar mt-4" aria-hidden><span style={{ width: `${Math.min(96, (elapsed / expectedMs) * 100)}%` }} /></div>
    </div>
  );
}
