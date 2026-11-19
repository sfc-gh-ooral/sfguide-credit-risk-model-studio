'use client';

// The walkthrough: drift alert → validator reviews PSI → challenger wins → promoted (human approval)
// → early-warning queue refreshes with the new champion's reason codes.
import Link from 'next/link';
import { Check, RotateCcw } from 'lucide-react';
import { Fragment } from 'react';
import { useStudio } from './Studio';
import { usePromotion } from '@/lib/credit-data';
import { resetSample } from '@/lib/mock-source';
import { useMode } from '@/lib/mode';

export function StoryBeats({ refreshKey = 0 }: { refreshKey?: number }) {
  const { beats, resetBeats } = useStudio();
  const promotion = usePromotion(refreshKey);
  const { mode } = useMode();
  const done = [true, beats.psi, beats.workbench, !!promotion?.promoted, !!promotion?.promoted && beats['queue-after']];
  const now = done.findIndex((d) => !d);
  const items = [
    { label: 'Drift alert', href: '/monitoring/' },
    { label: 'Validator reviews PSI', href: '/monitoring/' },
    { label: 'Challenger wins', href: '/workbench/' },
    { label: 'Promoted with approval', href: '/model-card/' },
    { label: 'Queue refreshes', href: '/queue/' },
  ];
  return (
    <div className="card px-4 py-3 mb-6 flex items-center gap-3 overflow-x-auto" aria-label="Walkthrough progress">
      <span className="eyebrow shrink-0 mr-1">Story</span>
      {items.map((it, i) => (
        <Fragment key={it.label}>
          {i > 0 && <span className={`beat-line ${done[i - 1] && done[i] ? 'done' : ''}`} aria-hidden />}
          <Link href={it.href} className={`beat ${done[i] ? 'done' : i === now ? 'now' : ''}`}>
            <span className="dot">{done[i] ? <Check className="w-3 h-3" aria-hidden /> : i + 1}</span>{it.label}
          </Link>
        </Fragment>
      ))}
      {mode === 'sample' && now === -1 && (
        <button className="btn !py-1 !px-2.5 !text-[11px] shrink-0 ml-2" onClick={() => { resetSample(); resetBeats(); window.location.assign(window.location.pathname); }}>
          <RotateCcw className="w-3 h-3" aria-hidden />Replay
        </button>
      )}
    </div>
  );
}
