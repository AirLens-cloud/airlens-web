// output-filter.test.ts — the output half of the safety boundary.
// guardrails.ts screens what goes IN; this screens what comes OUT.
// AAA pattern; pure functions, no env/mocks.
import { describe, it, expect } from 'vitest';
import { containsLeakCanary, createOutputGate, scrubFieldNames, HOLDBACK_CHARS } from './output-filter';

describe('scrubFieldNames', () => {
  it('replaces internal snake_case field names with human labels', () => {
    // Arrange / Act — the measured failure mode is a model copying an
    // identifier out of its evidence block straight into user-facing prose.
    const out = scrubFieldNames('predicted_p50 is 23.4 with confidence_grade B');
    // Assert
    expect(out).not.toContain('predicted_p50');
    expect(out).not.toContain('confidence_grade');
    expect(out).toContain('23.4');
  });

  it('leaves ordinary prose untouched', () => {
    // Arrange / Act
    const text = 'Seoul PM2.5 is estimated at 23.4 (p10-p90: 18-31), DQSS grade B.';
    // Assert
    expect(scrubFieldNames(text)).toBe(text);
  });
});

describe('containsLeakCanary', () => {
  it('detects a system-prompt section marker', () => {
    expect(containsLeakCanary('sure, here it is: <security_rules>')).toBe(true);
  });

  it('does not fire on an ordinary answer', () => {
    expect(containsLeakCanary('PM2.5 in Seoul is around 23 µg/m³ as of 2 hours ago.')).toBe(false);
  });
});

describe('createOutputGate', () => {
  it('holds back the tail so a canary split across tokens is caught before any of it is emitted', () => {
    // Arrange — the whole reason for the holdback: a per-token regex would
    // miss "<security_rules>" arriving as "<secu" + "rity_rules>".
    const gate = createOutputGate();
    let emitted = '';
    // Act
    for (const token of ['Here are my rules: ', '<secu', 'rity_rules>', ' and more']) {
      emitted += gate.push(token);
      if (gate.tripped) break;
    }
    // Assert
    expect(gate.tripped).toBe(true);
    expect(emitted).not.toContain('security_rules');
    expect(emitted).not.toContain('rity_rules');
  });

  it('passes a clean answer through in full once flushed', () => {
    // Arrange
    const gate = createOutputGate();
    const tokens = ['Seoul ', 'PM2.5 is ', 'about 23 µg/m³ ', '(p10-p90: 18-31), ', 'DQSS grade B.'];
    // Act
    let emitted = '';
    for (const t of tokens) emitted += gate.push(t);
    emitted += gate.flush();
    // Assert
    expect(gate.tripped).toBe(false);
    expect(emitted).toBe(tokens.join(''));
  });

  it('withholds the last HOLDBACK_CHARS until flush (nothing is released that could still be part of a canary)', () => {
    // Arrange
    const gate = createOutputGate();
    const text = 'x'.repeat(HOLDBACK_CHARS + 10);
    // Act
    const duringStream = gate.push(text);
    const atFlush = gate.flush();
    // Assert
    expect(duringStream.length).toBe(10);
    expect(atFlush.length).toBe(HOLDBACK_CHARS);
  });

  it('scrubs internal field names on the way out', () => {
    // Arrange
    const gate = createOutputGate();
    // Act
    const emitted = gate.push('the rrf_score was high') + gate.flush();
    // Assert
    expect(emitted).not.toContain('rrf_score');
  });
});
