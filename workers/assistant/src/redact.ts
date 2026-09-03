/**
 * redact.ts — PII sanitizer that runs at the edge, before a turn is buffered
 * for storage (plan zazzy-herding-nautilus §2-5). Pure function, no bindings,
 * so it is fully testable and cannot be the reason a chat request fails.
 *
 * Two design rules, both load-bearing:
 *
 * 1. **Masking is not the only tool.** Coordinates are TRUNCATED to 2 decimals
 *    (~1.1 km), not replaced. "서울 37.566535, 126.977969 근처" masked becomes
 *    an unanswerable question in the stored corpus; truncated it stays a real
 *    question while no longer pointing at a doorstep.
 *
 * 2. **False positives are a correctness bug, not a safe default.** This
 *    corpus exists to analyze air-quality questions, which are made of
 *    numbers. A pattern that eats "PM2.5가 23.4", a station id, or a unix
 *    timestamp produces rows that look sanitized and are simply wrong. Every
 *    numeric rule here carries a second gate — a date check, Luhn+IIN, or a
 *    nearby keyword — for exactly that reason.
 *
 * Deliberately NOT here: a personal-name filter. Korean names collide with
 * ordinary nouns and place names ("박", "정", "고"), so a name pattern would
 * shred the corpus while still missing most names. Names typed into chat are
 * accepted as residual risk and covered by retention limits instead.
 */

/** Bumped whenever a rule changes, stored per row so a later re-sweep can
 *  scope itself to rows written by an older sanitizer instead of rescanning
 *  everything forever. */
export const SANITIZER_VERSION = 'redact-1';

export interface RedactResult {
  text: string;
  /** Items replaced with a placeholder. Stored as `redacted_count` — a canary:
   *  a sudden jump means either an abuse wave or a newly-broken rule. */
  count: number;
  /** Coordinate pairs truncated rather than masked. Counted separately so the
   *  masking canary is not diluted by ordinary "near me" questions. */
  coordsTruncated: number;
}

const ACCOUNT_KEYWORDS = /계좌|예금|입금|이체|송금|은행|account|bank|iban|swift/i;
/** How far from a digit run to look for one of the keywords above. One short
 *  clause in either direction — wide enough for "계좌 11012345678", narrow
 *  enough that a paragraph mentioning a bank does not arm the rule for every
 *  number in it. */
const ACCOUNT_KEYWORD_WINDOW = 24;

/** Card IINs we actually accept, so a random 16-digit run that happens to
 *  pass Luhn (≈1 in 10) is not mistaken for a card. Visa / Mastercard /
 *  Amex / Discover / UnionPay / JCB / BC-Hyundai(9). */
const CARD_IIN =
  /^(?:4\d{12,18}|5[1-5]\d{14}|2[2-7]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12}|62\d{14}|35\d{14}|9\d{15})$/;

function isValidYYMMDD(six: string): boolean {
  const month = Number(six.slice(2, 4));
  const day = Number(six.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Truncate toward zero on the STRING, not via toFixed — toFixed rounds
 *  (37.999 → 38.00), which would move a point instead of coarsening it. */
function truncateTo2Decimals(value: string): string {
  const dot = value.indexOf('.');
  return dot === -1 ? value : value.slice(0, dot + 3);
}

/** Replace + count in one pass. `decide` returns the replacement, or null to
 *  leave the match untouched (that's where the second gates live). */
function sweep(
  text: string,
  pattern: RegExp,
  decide: (match: string, groups: string[], offset: number, whole: string) => string | null,
): { text: string; hits: number } {
  let hits = 0;
  const out = text.replace(pattern, (match, ...rest) => {
    const offset = rest.find((r) => typeof r === 'number') as number;
    const groups = rest.filter((r) => typeof r === 'string' || r === undefined) as string[];
    const replacement = decide(match, groups, offset, text);
    if (replacement === null) return match;
    hits++;
    return replacement;
  });
  return { text: out, hits };
}

export function redactPII(input: string): RedactResult {
  let text = input;
  let count = 0;
  let coordsTruncated = 0;

  const apply = (pattern: RegExp, decide: Parameters<typeof sweep>[2]) => {
    const result = sweep(text, pattern, decide);
    text = result.text;
    count += result.hits;
  };

  // URLs with a query string go first and go whole. Every later rule reads
  // text left to right; none of them would see `?email=` inside a URL as an
  // email, and a link is the single most common way a token, an id, or an
  // address arrives in a chat message.
  apply(/https?:\/\/\S+/g, (match) => (match.includes('?') ? '[URL]' : null));

  apply(/[\w.+-]+@[\w-]+\.[\w.-]+/g, () => '[이메일]');

  // Registration numbers before every other digit rule — 13 digits also fits
  // the card and account shapes, and a resident number must never fall
  // through to a rule that might decline it.
  apply(/\b(\d{6})[-\s]?([1-4]\d{6})\b/g, (_match, groups) =>
    isValidYYMMDD(groups[0]) ? '[주민등록번호]' : null,
  );
  apply(/\b(\d{6})[-\s]?([5-8]\d{6})\b/g, (_match, groups) =>
    isValidYYMMDD(groups[0]) ? '[외국인등록번호]' : null,
  );

  apply(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, () => '[전화번호]');
  apply(/\b0(?:2|[3-6]\d)[-\s]?\d{3,4}[-\s]?\d{4}\b/g, () => '[전화번호]');
  apply(/\b\d{3}-\d{2}-\d{5}\b/g, () => '[사업자등록번호]');

  apply(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{1,4}\b/g, (match) => {
    const digits = match.replace(/[-\s]/g, '');
    if (digits.length < 13 || digits.length > 19) return null;
    return CARD_IIN.test(digits) && passesLuhn(digits) ? '[카드번호]' : null;
  });

  // Account numbers have no checksum and no fixed length, so shape alone
  // cannot distinguish one from a timestamp, a grid cell id, or a
  // separator-free date. The keyword requirement is the whole rule.
  apply(/\b\d{10,14}\b/g, (match, _groups, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - ACCOUNT_KEYWORD_WINDOW), offset);
    const after = whole.slice(offset + match.length, offset + match.length + ACCOUNT_KEYWORD_WINDOW);
    return ACCOUNT_KEYWORDS.test(before) || ACCOUNT_KEYWORDS.test(after) ? '[계좌번호]' : null;
  });

  apply(/\b[A-Z]{1,2}\d{8}\b/g, () => '[여권번호]');
  apply(/\b\d{2,3}[가-힣]\d{4}\b/g, () => '[차량번호]');

  // Coordinates last, and truncated rather than masked (see header). Only a
  // PAIR (or an explicitly labeled value) counts — a lone 6-decimal number in
  // an air-quality question is a measurement, not a location.
  const coordPair =
    /(-?\d{1,3}\.\d{3,})\s*[,/]\s*(-?\d{1,3}\.\d{3,})/g;
  text = text.replace(coordPair, (match, lat: string, lon: string) => {
    if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return match;
    coordsTruncated++;
    return `${truncateTo2Decimals(lat)}, ${truncateTo2Decimals(lon)}`;
  });
  const labeledCoord = /((?:위도|경도|lat|lon|latitude|longitude)\s*[:=]?\s*)(-?\d{1,3}\.\d{3,})/gi;
  text = text.replace(labeledCoord, (match, label: string, value: string) => {
    if (Math.abs(Number(value)) > 180) return match;
    coordsTruncated++;
    return `${label}${truncateTo2Decimals(value)}`;
  });

  return { text, count, coordsTruncated };
}
