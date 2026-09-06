import { readFileSync, writeFileSync } from 'node:fs';

const SCORE_FLOOR = 80;
const STALE_AFTER_HOURS = 48;
const BASELINE_PATH = '.github/agentic-baseline.json';

const say = (line) => process.stdout.write(`${line}\n`);

const report = JSON.parse(readFileSync('is-agentic.json', 'utf8'));
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const essential = report.score_breakdown.essential;
const recommended = report.score_breakdown.recommended;
const ageHours = (Date.now() - Date.parse(report.scanned_at)) / 3_600_000;

say(
  `score ${report.score} (essential ${essential.passing}/${essential.total}, recommended ${recommended.passing}/${recommended.total}) scanned ${report.scanned_at}`
);
say(`baseline score ${baseline.score}, essential ${baseline.essentialPassing}, floor ${SCORE_FLOOR}`);
say(report.report_url);

const essentialIssues = report.issues.filter((entry) => entry.tier === 'essential');
for (const issue of essentialIssues) {
  say(`::warning title=${issue.name}::${issue.recommendation}`);
}

if (ageHours > STALE_AFTER_HOURS) {
  say(
    `::warning title=Stale report::The scan is ${Math.round(ageHours)}h old, so this run measured an old snapshot. Rescan from ${report.report_url}.`
  );
}

const failures = [];
if (report.score < SCORE_FLOOR) failures.push(`score ${report.score} is below the floor of ${SCORE_FLOOR}`);
if (report.score < baseline.score) failures.push(`score fell from ${baseline.score} to ${report.score}`);
if (essential.passing < baseline.essentialPassing) {
  failures.push(`essential checks fell from ${baseline.essentialPassing} to ${essential.passing}`);
}

if (failures.length > 0) {
  for (const failure of failures) say(`::error title=Agentic regression::${failure}`);
  process.exit(1);
}

const raised = {
  score: Math.max(baseline.score, report.score),
  essentialPassing: Math.max(baseline.essentialPassing, essential.passing),
};
if (raised.score !== baseline.score || raised.essentialPassing !== baseline.essentialPassing) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(raised, null, 2)}\n`);
  say(`raised the baseline to score ${raised.score}, essential ${raised.essentialPassing}`);
}
