// Copies the live Snowflake ML results into the bundled sample, so Sample mode shows what the live
// run produced (real XGBoost metrics, experiment runs, and SHAP reason codes from explain).
//
//   1. Run sql/setup.sql, configure .env.local, and start the app: npm run dev
//   2. Before promoting V2 in the app:  npm run capture-live   (optional: BASE=http://localhost:3000)
//
// PSI isn't captured: the generator already produces it exactly. Portfolio figures match the generator
// too, except expected loss, which depends on the champion's scores.
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
async function get(path) {
  const r = await fetch(BASE + path);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`${path}: ${j.error ?? r.status}. Is the app running in Live mode at ${BASE}?`);
  return j;
}

const models = await get('/api/models');
const promo = await get('/api/promote');
if (promo.promoted) throw new Error('V2 is already promoted. Capture before promoting so the sample starts from the beginning of the story.');
for (const v of models.versions) delete v.currentAliases;
writeFileSync('data/sample/models.json', JSON.stringify({ ...models, source: 'live-capture' }));

const queue = await get('/api/queue');
const accounts = queue.accounts.map(({ ...a }) => a).sort((x, y) => x.loanId - y.loanId);
writeFileSync('data/sample/queue.json', JSON.stringify({ ...queue, source: 'live-capture', accounts }));

// Expected loss uses the champion's batch scores, so it changes with the model; take it from live too.
const portfolio = await get('/api/portfolio');
writeFileSync('data/sample/portfolio.json', JSON.stringify(portfolio));

console.log(`Captured ${models.versions.length} model versions, ${models.runs.length} runs, ${accounts.length} queue accounts from ${BASE}.`);
