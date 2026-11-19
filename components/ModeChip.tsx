'use client';

// Header Sample/Live switch. Live needs a Snowflake connection configured on the server; without one,
// choosing Live opens the setup steps (the app never asks for credentials in the browser).
import { Database, FlaskConical, X } from 'lucide-react';
import { useState } from 'react';
import { HOSTED_EXAMPLE } from '@/lib/hosted';
import { type Mode, setPreferredMode, useMode } from '@/lib/mode';

export const REPO = 'https://github.com/sfc-gh-ooral/sfguide-credit-risk-model-studio';
const LIVE_GUIDE = `${REPO}#live-mode-deploy-to-your-account`;

export function ModeChip() {
  const { mode, configured } = useMode();
  const [help, setHelp] = useState(false);
  if (!mode) return <div className="mode-switch" style={{ width: 132, height: 32 }} aria-hidden />;

  const choose = (next: Mode) => {
    if (next === mode) return;
    if (next === 'live' && !configured) { setHelp(true); return; }
    setPreferredMode(next);
    window.location.reload();
  };
  const live = mode === 'live';

  return (
    <>
      <div className={`mode-switch ${live ? 'is-live' : 'is-sample'}`} role="radiogroup" aria-label="Data source">
        <button role="radio" aria-checked={!live} onClick={() => choose('sample')} title="Bundled synthetic data; AI answers are scripted samples">
          <FlaskConical className="w-3.5 h-3.5" aria-hidden />Sample
        </button>
        <button role="radio" aria-checked={live} onClick={() => choose('live')}
          title={configured ? 'Data, models, and AI from your Snowflake account' : 'Needs a Snowflake connection'}>
          {live && <span className="mode-dot" aria-hidden />}<Database className="w-3.5 h-3.5" aria-hidden />Live
        </button>
      </div>

      {help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setHelp(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="live-help-title" className="card max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <h2 id="live-help-title" className="font-display text-xl text-ink">Connect Snowflake to use Live mode</h2>
              <button className="p-1 rounded text-muted" onClick={() => setHelp(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            {HOSTED_EXAMPLE ? (
              <p className="text-sm text-ink-2 leading-relaxed">
                This hosted example runs only on synthetic data in your browser. To use Live mode, clone the{' '}
                <a className="underline" href={REPO} target="_blank" rel="noreferrer">repository</a> and follow{' '}
                <a className="underline" href={LIVE_GUIDE} target="_blank" rel="noreferrer">&ldquo;Live mode: deploy to your account&rdquo;</a> in the README.
              </p>
            ) : (
              <div className="text-sm text-ink-2 leading-relaxed">
                <p className="mb-3">No Snowflake connection is configured on this server. For security, the app doesn&apos;t take credentials
                  in the browser. Set them up once on the machine running the app:</p>
                <ol className="space-y-1.5 list-decimal pl-5 mb-3">
                  <li>Run <code>sql/setup.sql</code> in a Snowsight worksheet.</li>
                  <li>Create a key pair outside the repository and register the public key on your user.</li>
                  <li>Copy <code>.env.example</code> to <code>.env.local</code> and fill in:</li>
                </ol>
                <pre className="text-xs rounded-xl p-3 mb-3 overflow-x-auto" style={{ background: 'var(--bg-2)' }}>{`SNOWFLAKE_ACCOUNT=<orgname>-<account_name>
SNOWFLAKE_USERNAME=<YOUR_USER>
SNOWFLAKE_PRIVATE_KEY_PATH=/absolute/path/to/credit_risk_key.p8`}</pre>
                <p>Then restart with <code>npm run dev</code> and switch to Live. <a className="underline" href={LIVE_GUIDE} target="_blank" rel="noreferrer">Full guide</a></p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
