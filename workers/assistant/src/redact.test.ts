// redact.test.ts — the sanitizer that runs before anything is buffered for
// storage. Its job is measured in two directions: what it must mask, and
// what it must NOT touch (a sanitizer that mangles air-quality numbers makes
// the stored corpus useless and hides that fact behind a "redacted" label).
// AAA pattern; pure function.
import { describe, it, expect } from 'vitest';
import { redactPII, SANITIZER_VERSION } from './redact';

describe('redactPII — masks personal identifiers', () => {
  it('masks an email address', () => {
    const { text, count } = redactPII('내 이메일은 test.person@example.com 이야');
    expect(text).not.toContain('test.person@example.com');
    expect(count).toBe(1);
  });

  it('masks a Korean mobile number in any separator style', () => {
    for (const raw of ['010-1234-5678', '01012345678', '010 1234 5678']) {
      const { text } = redactPII(`연락처 ${raw}`);
      expect(text, raw).not.toMatch(/1234/);
    }
  });

  it('masks a landline / area-code number', () => {
    const { text } = redactPII('사무실 02-987-6543 으로 전화주세요');
    expect(text).not.toContain('987-6543');
  });

  it('masks a resident registration number', () => {
    const { text, count } = redactPII('주민번호 900101-1234567 입니다');
    expect(text).not.toContain('900101-1234567');
    expect(count).toBe(1);
  });

  it('masks a foreign registration number (5-8 leading digit — the draft missed this entirely)', () => {
    const { text } = redactPII('등록번호 900101-5234567');
    expect(text).not.toContain('900101-5234567');
  });

  it('does not treat a 13-digit run with an impossible date as a registration number', () => {
    // 991345 is not a valid YYMMDD — without the date gate this is a false
    // positive that eats ordinary numbers.
    const { text } = redactPII('측정 코드 991345-1234567');
    expect(text).toContain('991345-1234567');
  });

  it('masks a card number that passes Luhn with a real IIN', () => {
    // 4111 1111 1111 1111 — the canonical Visa test number.
    const { text } = redactPII('카드번호 4111 1111 1111 1111');
    expect(text).not.toContain('4111');
  });

  it('does not mask a 16-digit run that fails Luhn', () => {
    const { text } = redactPII('센서 시리얼 1234567812345678');
    expect(text).toContain('1234567812345678');
  });

  it('masks a bank-account-shaped number only when an account keyword is nearby', () => {
    const withKeyword = redactPII('계좌 11012345678 로 입금해주세요');
    const without = redactPII('관측소 식별자 11012345678 의 값');
    expect(withKeyword.text).not.toContain('11012345678');
    expect(without.text).toContain('11012345678');
  });

  it('masks a business registration number', () => {
    const { text } = redactPII('사업자등록번호 123-45-67890');
    expect(text).not.toContain('123-45-67890');
  });

  it('masks a URL query string wholesale (individual patterns miss what is inside one)', () => {
    const { text } = redactPII('여기 링크 https://example.com/a?email=me@x.com&token=abc123 확인해줘');
    expect(text).not.toContain('me@x.com');
    expect(text).not.toContain('token=abc123');
  });
});

describe('redactPII — leaves air-quality content intact', () => {
  it('does not touch measurements, percentages, or model scores', () => {
    // The false-positive direction. A sanitizer that eats these makes the
    // stored questions useless for the retrieval analysis they exist for.
    const text = '서울 PM2.5가 23.4이고 p10-p90은 18-31, DQSS는 B, 관련도 0.8234, 2026년 대비 12% 개선';
    const result = redactPII(text);
    expect(result.text).toBe(text);
    expect(result.count).toBe(0);
  });

  it('does not touch a plain year or a 4-digit station id', () => {
    const text = '2026년 관측소 1145 데이터';
    expect(redactPII(text).text).toBe(text);
  });

  it('does not touch a 13-digit unix millisecond timestamp', () => {
    // Explicitly called out in the design: the account-shaped pattern's digit
    // range covers timestamps, grid ids, and separator-free ISO dates.
    const text = '스냅샷 시각 1756800000000 기준';
    expect(redactPII(text).text).toBe(text);
  });
});

describe('redactPII — coordinates are truncated, not masked', () => {
  it('truncates a precise coordinate pair to ~1.1km precision', () => {
    const { text, coordsTruncated } = redactPII('서울 37.566535, 126.977969 근처 어때?');
    expect(text).toContain('37.56');
    expect(text).not.toContain('37.566535');
    expect(text).not.toContain('126.977969');
    expect(coordsTruncated).toBe(1);
  });

  it('leaves a coarse coordinate pair alone (already imprecise)', () => {
    const text = '37.56, 126.97 근처';
    expect(redactPII(text).text).toBe(text);
  });

  it('does not truncate a lone decimal that is a measurement, not a coordinate', () => {
    const text = 'PM2.5 농도가 37.566535 였어';
    expect(redactPII(text).text).toBe(text);
  });
});

describe('SANITIZER_VERSION', () => {
  it('is a non-empty string so a later re-sweep can scope itself', () => {
    // Without it, adding a rule means rescanning every stored row forever.
    expect(typeof SANITIZER_VERSION).toBe('string');
    expect(SANITIZER_VERSION.length).toBeGreaterThan(0);
  });
});
