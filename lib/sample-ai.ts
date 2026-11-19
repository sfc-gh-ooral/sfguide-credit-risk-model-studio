// Scripted "AI_COMPLETE" drafts for Sample mode. Built from the bundled model results, so the numbers
// match the rest of the app. Always shown with the "Sample AI response" label.
import { sample } from './mock-source';

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export const MODEL_CARD_SECTIONS = [
  { id: 'purpose', label: 'Purpose and scope' },
  { id: 'performance', label: 'Performance and limitations' },
  { id: 'changes', label: 'Changes from V1 to V2' },
] as const;

export function sampleModelCardDraft(section: string, version: string): string {
  const [v1, v2] = sample.models.versions;
  const v = version === 'V2' ? v2 : v1;
  const ntc = (m: typeof v1) => m.oot.fairness.find((f) => f.segment === 'NEW_TO_CREDIT')!;
  if (section === 'purpose') {
    return [
      `**Intended use.** ${v.version} estimates the probability that a performing personal or auto loan reaches 90+ days past due within 12 months. It supports early-warning prioritization and portfolio expected-loss estimates. It is not approved for credit decisions on applications.`,
      `**Population.** Consumer installment loans observed at month 3 on book, ${v.trainingWindow}, ${v.trainRows.toLocaleString()} training observations. Features come from two Feature Store views (loan attributes and monthly bureau and payment behavior).`,
      `**Out of scope.** Accounts already 30+ days past due (handled by collections), revolving products, and small-business lending.`,
    ].join('\n\n');
  }
  if (section === 'performance') {
    const f = ntc(v);
    return [
      `**Out-of-time results.** On ${sample.models.ootWindow}, ${v.version} reaches AUC ${v.oot.auc.toFixed(3)}, KS ${v.oot.ks.toFixed(3)}, and Gini ${v.oot.gini.toFixed(3)}.`,
      `**Calibration.** Predicted and observed default rates track closely across deciles for thick-file borrowers. The new-to-credit segment is underpredicted: ${pct(f.predicted)} predicted vs. ${pct(f.observed)} observed (n = ${f.n.toLocaleString()}).`,
      `**Limitations.** Utilization drift in 2025 and later vintages (PSI above 0.25 since 2026-06) means the training distribution no longer matches the current book. Monitor monthly and recalibrate if the new-to-credit gap persists.`,
    ].join('\n\n');
  }
  const d = v2.oot.auc - v1.oot.auc;
  const gap1 = ntc(v1).observed - ntc(v1).predicted, gap2 = ntc(v2).observed - ntc(v2).predicted;
  const gapText = Math.abs(gap2) < Math.abs(gap1) ? (Math.abs(gap2) > 0.01 ? 'the gap narrows but does not close' : 'the gap largely closes') : 'the gap does not narrow';
  return [
    `**Training window.** V2 extends training from ${v1.trainingWindow} to ${v2.trainingWindow}, so it includes vintages affected by the utilization shift.`,
    `**Features.** V2 adds MONTHS_ON_BUREAU (${v2.features.length} features vs. ${v1.features.length}), which helps separate thin-file and new-to-credit borrowers.`,
    `**Performance.** Out-of-time AUC moves from ${v1.oot.auc.toFixed(3)} to ${v2.oot.auc.toFixed(3)} (${d >= 0 ? '+' : ''}${d.toFixed(3)}). The new-to-credit predicted rate moves from ${pct(ntc(v1).predicted)} to ${pct(ntc(v2).predicted)} against ${pct(ntc(v2).observed)} observed; ${gapText}.`,
    `**Validator action.** Approve V2 as champion with a condition: track new-to-credit calibration monthly and document an overlay if the gap stays above 3 points.`,
  ].join('\n\n');
}
