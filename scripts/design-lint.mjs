#!/usr/bin/env node
/**
 * design-lint.mjs — diff-scoped design coherence lint for CI (Phase 2: fail on violation).
 *
 * Ported from AirLens-platform scripts/ci/design-lint.mjs, adapted to this
 * repo's flat layout (no `apps/web/` prefix — everything under `src/`).
 * Repo-specific deltas from the source, besides the path scope:
 *
 *   - Accent axis: this repo has no global `--viz-accent` token — the cyan hex
 *     (`#25e2f4`) is scoped to `--obs-cyan` (obs.css) and is INTENTIONALLY
 *     never global (see obs.css header). The rule below points there instead.
 *   - `RAW_ZERO_FILES` (the P4 whole-file accent sweep) starts empty: no
 *     raw-hex-elimination campaign has run in this repo yet, so no file can
 *     be claimed clean without an actual audit. Populate this list only after
 *     verifying a file is raw-hex-free end to end.
 *   - `CANONICAL_BP` is unchanged (360/480/640/768/1024/1280) — this repo's
 *     own `src/lib/breakpoints.ts` already commits to this exact set and
 *     names this script as its enforcement mechanism.
 *
 * Rule SOT (this repo): src/lib/breakpoints.ts (breakpoint axis) + the source
 * repo's `.claude/rules/policy/design-taxonomy.md §Coherence Axes` for the
 * general axis vocabulary (radius/shadow/accent/spacing/typography).
 *
 * Diff-scoped: only ADDED lines of `git diff <base>...HEAD` are linted, so the
 * pre-existing backlog never fails a PR. Whole-tree token *definitions* are
 * still indexed so the undefined-token check sees every definition.
 *
 * Per-line exception: a trailing comment naming the axis AND a reason
 * silences that one axis on that one line —
 *
 *   border-radius: 6px;  // design-lint-ok: radius — approved mockup bezel
 *
 * (a CSS block comment works the same; it just cannot be shown inside this
 * one line). The reason is NOT optional: a bare `design-lint-ok` (or one
 * whose axis name is unknown) does not suppress anything and is itself
 * reported.
 *
 * Usage: node scripts/design-lint.mjs [--base <ref>]   (default origin/main)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PHASE = 2; // 1 = warning-only, 2 = fail on violation
const LINT_EXT = /\.(css|scss|tsx|jsx|ts)$/i;
const LINT_SCOPE = /^src\//;

// OBSERVATORY instrument surfaces — a sanctioned self-contained design world
// with its own `--obs-*` token system (src/styles/obs.css, `.obs-surface`
// scope) plus any `…/observatory/` directory. Same carve-out pattern as
// sky-glass: exempts the typography + spacing axes only (dense-mono HUD type
// scale and sub-8px tick spacing the 8pt grid / `.h-*`/`.t-*` classes don't
// model). Color-hardcode / undefined-token / radius / shadow stay enforced.
const OBS_EXEMPT_SCOPE = /\/observatory\/|obs\.css$/;
const OBS_EXEMPT_AXES = /^(literal font-size|off-grid spacing)/;

// P4 whole-file accent sweep — deliberately empty (see file header). A file
// listed here that cannot be read is a HARD failure, never a skip: a silent
// skip turns the sweep vacuous while still reporting green.
const RAW_ZERO_FILES = [];

// 8pt grid (spacing axis). 0/1/2 = hairline/sub-px ok.
const SPACING_GRID = new Set([0, 1, 2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96, 112, 120, 128]);

// Breakpoint axis — canonical 6종, SOT = src/lib/breakpoints.ts (native
// @media cannot read var(), so the values are literal by necessity; this axis
// is what keeps the literals converged). Matches the query form
// `(min|max-width: Npx)` — CSS @media and JS matchMedia share it — and
// deliberately NOT bare `max-width: Npx` declarations, which are content
// caps, not breakpoints.
const CANONICAL_BP = new Set([360, 480, 640, 768, 1024, 1280]);

// Radius axis sanctions: --r-0 / --r-4 / --r-pill (+ --r-glass on sky-glass surfaces).
const RADIUS_OK = /var\(--r-|\b9{3,}px\b/;

// Axis id per finding — the vocabulary a `design-lint-ok:` comment must name.
const AXIS_BY_FINDING = [
  [/^raw #/, 'accent'],
  [/^undefined token /, 'token'],
  [/^off-axis border-radius/, 'radius'],
  [/^pure-black box-shadow/, 'shadow'],
  [/^(literal font-size|inline style fontSize)/, 'typography'],
  [/^off-grid spacing/, 'spacing'],
  [/^off-canonical breakpoint/, 'breakpoint'],
  [/^CSS comment-terminator hazard/, 'comment-hazard'],
];
const KNOWN_AXES = AXIS_BY_FINDING.map(([, axis]) => axis);

/**
 * Which axis a finding belongs to, or null when nothing claims it.
 *
 * null is the safe direction: a future rule added without an entry above cannot
 * be silenced by any comment until someone gives it an axis name here.
 */
export function axisOf(finding) {
  for (const [re, axis] of AXIS_BY_FINDING) if (re.test(finding)) return axis;
  return null;
}

/**
 * Parse a `design-lint-ok: <axis>[, <axis>] — <reason>` comment off one line.
 *
 * Returns null (no marker), `{ error }` (marker present but unusable — the
 * caller reports it and suppresses nothing), or `{ axes, reason }`.
 *
 * Separator is an em-dash or `--`; a single `-` is not accepted because axis ids
 * may contain one (`control-height`), which would make the split ambiguous.
 *
 * The marker must be the FIRST token of its comment (`/* design-lint-ok:` or
 * `// design-lint-ok:`). Prose that merely mentions the name is not a marker.
 */
export function parseSuppression(line) {
  const m = /(?:\/\*|\/\/)\s*design-lint-ok\b\s*:?\s*([^*\n]*)/.exec(line);
  if (!m) return null;

  const body = m[1].replace(/\*\/.*$/, '').trim();
  const parts = body.split(/—|--/);
  const axes = (parts[0] ?? '').split(/[,\s]+/).filter(Boolean);
  const reason = parts.slice(1).join('—').trim();

  if (axes.length === 0) {
    return { error: 'design-lint-ok 에 축 이름이 없다 — `design-lint-ok: <축> — <사유>`' };
  }
  const unknown = axes.filter((a) => !KNOWN_AXES.includes(a));
  if (unknown.length > 0) {
    return {
      error: `design-lint-ok 의 축 이름을 모른다: ${unknown.join('/')} — 허용 = ${KNOWN_AXES.join(' / ')}`,
    };
  }
  if (reason.length < 2) {
    return {
      error:
        `design-lint-ok: ${axes.join(',')} 에 사유가 없다 — ` +
        '`design-lint-ok: <축> — <사유>` 형식이어야 한다 (사유 없는 예외는 통과시키지 않는다)',
    };
  }
  return { axes, reason };
}

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function parseArgs() {
  const i = process.argv.indexOf('--base');
  return { base: i > -1 ? process.argv[i + 1] : 'origin/main' };
}

/**
 * Verbatim-move 면제 — 같은 diff 에서 trim-동일한 removed 라인이 있는 added
 * 라인은 "이동"이지 신규 작성이 아니다. 멀티셋 차감이라 removed 1줄당 added
 * 1줄만 면제 — 삭제 없는 복붙(신규 중복)은 여전히 검출된다.
 *
 * Returns a predicate: added 라인이 이동분이면 true (그 라인의 예산 1 차감).
 */
export function verbatimMoveSkipper(removedTrims) {
  const budget = new Map(removedTrims);
  return (line) => {
    const t = line.trim();
    if (!t) return false;
    const c = budget.get(t) ?? 0;
    if (c > 0) {
      budget.set(t, c - 1);
      return true;
    }
    return false;
  };
}

/**
 * Merge-base diff 파싱: added 라인(파일별, lineNo 포함) + removed 라인 trim
 * 멀티셋(verbatim-move 면제용).
 */
function addedLines(base) {
  let diff;
  try {
    diff = sh('git', ['diff', '--unified=0', `${base}...HEAD`, '--', 'src']);
  } catch (err) {
    if (!/no merge base|unknown revision|bad revision/.test(String(err.stderr ?? err.message ?? ''))) throw err;
    // Missing base ref (restricted CI refspec never created origin/<base>) or a
    // shallow fetch that cut the merge base: fetch the base into its remote ref
    // explicitly, unshallowing if needed, then retry. If it still fails, die
    // with an actionable message instead of a raw stack trace.
    const remoteBase = base.replace(/^origin\//, '');
    try {
      const shallow = sh('git', ['rev-parse', '--is-shallow-repository']).trim() === 'true';
      sh('git', [
        'fetch',
        ...(shallow ? ['--unshallow'] : []),
        'origin',
        `+refs/heads/${remoteBase}:refs/remotes/origin/${remoteBase}`,
      ]);
      diff = sh('git', ['diff', '--unified=0', `${base}...HEAD`, '--', 'src']);
    } catch {
      console.error(
        `design-lint: no merge base between ${base} and HEAD even after re-fetching ` +
          `origin/${remoteBase}. Check the checkout fetch-depth and that the base ` +
          `ref was not fetched with --depth=1.`,
      );
      process.exit(1);
    }
  }
  const byFile = {};
  const removedTrims = new Map();
  let file = null;
  let lineNo = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice(6);
      continue;
    }
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('-') && !raw.startsWith('---')) {
      const t = raw.slice(1).trim();
      if (t) removedTrims.set(t, (removedTrims.get(t) ?? 0) + 1);
      continue;
    }
    if (file && raw.startsWith('+') && !raw.startsWith('+++')) {
      (byFile[file] ??= []).push({ line: raw.slice(1), lineNo });
      lineNo += 1;
    } else if (raw.startsWith(' ')) {
      lineNo += 1;
    }
  }
  return { byFile, removedTrims };
}

/** Every `--token:` definition across tracked src CSS (+ TSX style blocks). */
function definedTokens() {
  const defs = new Set();
  const files = sh('git', ['ls-files', 'src/**/*.css', 'src/**/*.tsx'])
    .split('\n')
    .filter(Boolean);
  for (const f of files) {
    let text = '';
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defs.add(m[1]);
  }
  return defs;
}

/**
 * Axis checks on one added line.
 *
 * `tsOnly` (plain .ts files): ONLY the breakpoint axis runs. Plain .ts is in
 * scope solely because matchMedia width literals live there (lib/*.ts) — the
 * colour/token axes would false-positive on canvas/GL colour math where CSS
 * custom properties cannot reach.
 */
export function lintLine(line, isCss, isTsx, tokens, tsOnly = false) {
  const out = [];
  const isTokenDef = /^\s*--[\w-]+\s*:/.test(line);

  // CSS comment-terminator hazard — a CSS block comment ends at the first
  // literal `*/` it contains. A double-glob (`**/observatory/**`) contains
  // exactly that inside `**/`, so writing it inside a `/* ... */` comment
  // closes the comment early and corrupts everything until the real closing
  // `*/`. `**/` is not legitimate CSS syntax outside a comment either, so
  // this check does not need to know whether the line is inside a comment.
  if (isCss && /\*\*\//.test(line)) {
    out.push(
      'CSS comment-terminator hazard: "**/" contains "*/" and ends a block ' +
        'comment early, corrupting whatever follows until the real closing ' +
        '*/ → reword to avoid this exact byte sequence (e.g. drop the ' +
        'leading "**", or write "** /" with a space)',
    );
  }

  // Breakpoint axis.
  for (const m of line.matchAll(/\(\s*(?:min|max)-width\s*:\s*([\d.]+)px\s*\)/gi)) {
    const n = Number(m[1]);
    if (!CANONICAL_BP.has(n)) {
      out.push(
        `off-canonical breakpoint ${n}px → 360/480/640/768/1024/1280 (src/lib/breakpoints.ts canonical set)`,
      );
    }
  }
  if (tsOnly) return out;

  if (!isTokenDef && /#ff5c00\b/i.test(line)) {
    out.push('raw #FF5C00 → var(--orange) (brand accent)');
  }
  if (!isTokenDef && /#25e2f4\b/i.test(line)) {
    out.push('raw #25e2f4 → var(--obs-cyan) (obs.css — scoped to .obs-surface only, never global)');
  }
  if (!isTokenDef && /#ef4444\b/i.test(line)) {
    out.push('raw #ef4444 → var(--viz-bad) (status-bad, dark viz surfaces)');
  }
  if (!isTokenDef && /#4ade80\b/i.test(line)) {
    out.push('raw #4ade80 → var(--viz-live) (globe LIVE indicator green)');
  }

  // Undefined token reference — CI-only axis (needs whole-tree definitions).
  for (const m of line.matchAll(/var\(\s*(--[\w-]+)/g)) {
    if (!tokens.has(m[1])) out.push(`undefined token ${m[1]} — define it or use a canonical token`);
  }

  if (isCss && !isTokenDef) {
    const rm = line.match(/border-radius\s*:\s*([^;]+)/i);
    if (rm && /\b[1-9]\d*px\b/.test(rm[1]) && !RADIUS_OK.test(rm[1])) {
      out.push(`off-axis border-radius "${rm[1].trim().slice(0, 24)}" → var(--r-0|--r-4|--r-pill)`);
    }
    if (/box-shadow\s*:/.test(line) && /rgba\(\s*0\s*,\s*0\s*,\s*0/.test(line)) {
      out.push('pure-black box-shadow rgba(0,0,0,..) → ink-tint rgba(17,20,24,..) or var(--shadow-pop)');
    }
    // Wave 0 type scale (tokens.css `--fs-*`) is allowed vocabulary here — only a
    // bare literal (`font-size: 15px;`) is flagged, never `var(--fs-*)`.
    if (
      /font-size\s*:\s*[\d.]+px/i.test(line) &&
      !/var\(\s*--fs-/.test(line) &&
      !/\.(h|t)-[\w-]+/.test(line)
    ) {
      out.push('literal font-size → prefer var(--fs-*) type-scale token or .h-*/.t-* semantic class');
    }
    const sm = line.match(/\b(padding|margin|gap)(?:-\w+)?\s*:\s*([^;{}]+)/i);
    if (sm) {
      const off = [...sm[2].matchAll(/\b(\d+)px\b/g)]
        .map((m) => Number(m[1]))
        .filter((n) => n > 2 && !SPACING_GRID.has(n));
      if (off.length) out.push(`off-grid spacing ${[...new Set(off)].join('/')}px → snap to --sp-* (8pt)`);
    }
  }

  if (isTsx && /\bfontSize\s*:/.test(line)) {
    out.push('inline style fontSize → prefer .h-*/.t-* class (typography axis)');
  }

  return out;
}

/**
 * Raw hex literals on one line — the accent axis for the P4 whole-file sweep.
 *
 * Excluded, because none of them is drift:
 *  - a token DEFINITION (`--viz-bad: #ef4444;`), which is where hex belongs;
 *  - the fallback slot of `var(--x, #hex)`, the sanctioned idiom.
 */
export function rawHexOn(line) {
  if (/^\s*--[\w-]+\s*:/.test(line)) return [];
  const stripped = line.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, '');
  return [...stripped.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
}

function main() {
  const { base } = parseArgs();
  const { byFile, removedTrims } = addedLines(base);
  const tokens = definedTokens();
  const isVerbatimMove = verbatimMoveSkipper(removedTrims);

  let count = 0;
  const level = PHASE >= 2 ? 'error' : 'warning';
  const report = (file, lineNo, msg) => {
    count += 1;
    console.log(`::${level} file=${file},line=${lineNo}::design-lint: ${msg}`);
  };

  for (const [file, lines] of Object.entries(byFile)) {
    if (!LINT_SCOPE.test(file) || !LINT_EXT.test(file)) continue;
    const isCss = /\.(css|scss)$/i.test(file);
    const isTsx = /\.(tsx|jsx)$/i.test(file);
    const tsOnly = /\.ts$/i.test(file) && !isTsx; // plain .ts → breakpoint axis only
    const obsScope = OBS_EXEMPT_SCOPE.test(file);
    for (const { line, lineNo } of lines) {
      // Verbatim move: the line existed before this PR (a removed line with an
      // identical trim is in the same diff) — relocating backlog is not new
      // drift. Checked FIRST so migrations pass without markers.
      if (isVerbatimMove(line)) continue;

      // A malformed marker is a finding of its own, even on an otherwise clean
      // line — otherwise the habit of writing reasonless exceptions spreads.
      const sup = parseSuppression(line);
      if (sup?.error) report(file, lineNo, sup.error);
      const allowed = sup && !sup.error ? sup.axes : [];

      for (const finding of lintLine(line, isCss, isTsx, tokens, tsOnly)) {
        if (obsScope && OBS_EXEMPT_AXES.test(finding)) continue;
        if (allowed.includes(axisOf(finding))) continue;
        report(file, lineNo, finding);
      }
    }
  }

  // P4 whole-file sweep — accent axis only, on the raw-zero files.
  for (const file of RAW_ZERO_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.resolve(file), 'utf8');
    } catch (err) {
      // Hard fail, not skip. If the file moved, the list is stale and the sweep
      // is silently dead — the reviewer must re-point it, not inherit a green.
      console.error(
        `design-lint: RAW_ZERO_FILES lists ${file}, which cannot be read (${err.code ?? err.message}). ` +
          'The file moved or was deleted — update RAW_ZERO_FILES in scripts/design-lint.mjs. ' +
          'Refusing to pass a sweep that silently checks nothing.',
      );
      process.exit(1);
    }
    // Lines the diff pass already reported: reporting them twice reads as two
    // separate violations of the same line.
    const seen = new Set((byFile[file] ?? []).map((l) => l.lineNo));
    text.split('\n').forEach((line, i) => {
      const lineNo = i + 1;
      if (seen.has(lineNo)) return;
      const hexes = rawHexOn(line);
      if (hexes.length === 0) return;
      const sup = parseSuppression(line);
      if (sup?.error) return report(file, lineNo, sup.error);
      if (sup && !sup.error && sup.axes.includes('accent')) return;
      report(
        file,
        lineNo,
        `raw hex ${[...new Set(hexes)].join('/')} in a raw-zero file → use a token ` +
          '(or var(--x, #fallback)); annotate a sanctioned exception with ' +
          '`design-lint-ok: accent — <reason>`',
      );
    });
  }

  if (count === 0) {
    console.log('design-lint: no coherence findings in added lines.');
  } else {
    console.log(`design-lint: ${count} finding(s) (Phase ${PHASE} — ${PHASE >= 2 ? 'FAIL' : 'advisory'}).`);
  }
  process.exit(PHASE >= 2 && count > 0 ? 1 : 0);
}

// Run only when invoked directly (kept importable for scripts/ci/tests/).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
