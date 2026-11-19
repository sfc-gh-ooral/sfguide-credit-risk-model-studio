'use client';

// The "View as" lens: one line per page saying what the selected role does here.
// UI-only; it changes emphasis and which actions are enabled, not data access.
import { AnimatePresence, motion } from 'framer-motion';
import { UserRound } from 'lucide-react';
import { useStudio } from './Studio';
import { PERSONAS, type Persona } from '@/lib/types';

export type LensPage = 'portfolio' | 'queue' | 'account' | 'workbench' | 'model-card' | 'monitoring';

const OWNER: Record<LensPage, Persona> = {
  portfolio: 'manager', queue: 'manager', account: 'manager',
  workbench: 'scientist', 'model-card': 'validator', monitoring: 'validator',
};

const LENS: Record<LensPage, Record<Persona, string>> = {
  portfolio: {
    scientist: 'Read the utilization trend as the feature shift your champion was not trained on.',
    validator: 'Check that the book you approved the model for still looks like this one; drift is flagged above.',
    manager: 'Your book at a glance: balances, delinquency, and the segments that are moving.',
  },
  queue: {
    scientist: 'Sanity-check the ranking: the reason codes should match the features you built.',
    validator: 'Read only: confirm reason codes are explainable before the queue goes to collections.',
    manager: 'Work this list: open an account to assign outreach, watchlist, or dismiss.',
  },
  account: {
    scientist: 'Read only: see how SHAP reason codes surface for one borrower.',
    validator: 'Read only: confirm the explanation is consistent with the score.',
    manager: 'You can record a decision on this account below.',
  },
  workbench: {
    scientist: 'Your workspace: compare runs, read calibration, and hand the challenger to validation.',
    validator: 'Review the out-of-time evidence, then approve on the model card.',
    manager: 'Read only: this is why the queue may reorder after a promotion.',
  },
  'model-card': {
    scientist: 'Read only: review the AI-drafted documentation; approval belongs to a validator.',
    validator: 'Your decision point: review lineage and fairness, then approve the promotion.',
    manager: 'Read only: see which model version is ranking your queue and who approved it.',
  },
  monitoring: {
    scientist: 'Spot the features that drifted; that is the case for retraining.',
    validator: 'Your control: PSI above threshold is the trigger for a challenger review.',
    manager: 'Read only: drift here means scores in your queue may be understated.',
  },
};

export function PersonaLens({ page }: { page: LensPage }) {
  const { persona } = useStudio();
  const own = OWNER[page] === persona;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={persona} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2 }} role="status"
        className="mt-4 inline-flex items-start gap-2 rounded-xl border px-3 py-2 text-[13px] leading-snug"
        style={{ borderColor: own ? 'var(--emerald)' : 'var(--line)', background: 'var(--bg-2)' }}>
        <UserRound className="w-4 h-4 mt-0.5 shrink-0" style={{ color: own ? 'var(--emerald)' : 'var(--muted)' }} aria-hidden />
        <span className="text-ink-2">
          <strong className="text-ink">{PERSONAS[persona].label}{own ? ' · your page' : ''}.</strong> {LENS[page][persona]}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}
