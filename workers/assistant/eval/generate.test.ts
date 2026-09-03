// Unit tests for the A/B generator's pure logic. These run with NO credentials
// — the network path is covered by model-ab.eval.test.ts, which skips unless
// the Workers AI env is set.
import { describe, it, expect, vi } from 'vitest';
import {
  parseWranglerVars,
  wranglerVars,
  buildEvalMessages,
  extractAnswer,
  generateAnswer,
  retryDelayMs,
  GENERATE_ATTEMPTS,
} from './generate';
import { CASES } from './cases';

const TOML = `
[vars]
CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it"
MAX_TOKENS = "512"
TEMPERATURE = "0.3"
MAX_HISTORY_TURNS = "10"
`;

describe('parseWranglerVars', () => {
  it('reads the production generation settings', () => {
    // Arrange / Act
    const vars = parseWranglerVars(TOML);
    // Assert
    expect(vars).toEqual({
      chatModel: '@cf/google/gemma-4-26b-a4b-it',
      maxTokens: 512,
      temperature: 0.3,
      maxHistoryTurns: 10,
    });
  });

  it('throws when a setting is absent rather than defaulting silently', () => {
    // Arrange
    const missing = TOML.replace(/^MAX_TOKENS.*$/m, '');
    // Act / Assert — a silent default would make the A/B measure a budget we do not ship
    expect(() => parseWranglerVars(missing)).toThrow(/MAX_TOKENS/);
  });

  it('reads the real wrangler.toml on disk', () => {
    // Arrange / Act
    const vars = wranglerVars();
    // Assert
    expect(vars.chatModel).toMatch(/^@cf\//);
    expect(vars.maxTokens).toBeGreaterThan(0);
  });
});

describe('buildEvalMessages', () => {
  it('sends the production system prompt plus the structured-evidence block', () => {
    // Arrange
    const testCase = CASES.find((c) => c.id === 'band_disclosure')!;
    // Act
    const messages = buildEvalMessages(testCase);
    // Assert
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('<security_rules>');
    expect(messages[0].content).toContain('<structured_context>');
    expect(messages[0].content).toContain('p10-p90 18-32');
    expect(messages.at(-1)).toEqual({
      role: 'user',
      content: `<user_query>${testCase.question}</user_query>`,
    });
  });

  it('always includes retrieved_context (even with zero matches) and omits the structured_context block when there are no blocks', () => {
    // Arrange
    const testCase = CASES.find((c) => c.id === 'no_evidence')!;
    // Act
    const messages = buildEvalMessages(testCase);
    // Assert — mirrors chat-stream.ts buildRagStream: buildGroundedContext
    // runs unconditionally (NO_EVIDENCE_BLOCK when matches is empty),
    // structured_context is the piece that's actually gated on the case
    // data. Checked via the CLOSING tag, not the opening one — the base
    // system prompt's own response_format rule 1 mentions the tag NAME in
    // prose ("...from <retrieved_context> or <structured_context>") on
    // every request, so `<structured_context>` alone is present regardless
    // of whether a block was actually wrapped in it.
    expect(messages[0].content).toContain('<retrieved_context>');
    expect(messages[0].content).not.toContain('</structured_context>');
  });

  it('omits the causal skeleton for a data_lookup-classified question', () => {
    // Arrange — 'no_evidence' asks "지금 울란바토르 PM2.5 수치 알려줘" (data_lookup, not causal/policy)
    const testCase = CASES.find((c) => c.id === 'no_evidence')!;
    // Act
    const messages = buildEvalMessages(testCase);
    // Assert
    expect(messages[0].content).not.toContain('<causal_reasoning>');
  });
});

describe('extractAnswer', () => {
  it('reads result.response', () => {
    expect(extractAnswer({ result: { response: '  hi  ' } })).toEqual({
      text: 'hi',
      finishReason: null,
    });
  });

  it('reads the OpenAI-style choices shape with its finish reason', () => {
    // Arrange
    const json = { result: { choices: [{ message: { content: 'hi' }, finish_reason: 'length' }] } };
    // Act / Assert
    expect(extractAnswer(json)).toEqual({ text: 'hi', finishReason: 'length' });
  });

  it('returns empty text for an empty answer — a real, measurable failure', () => {
    // Arrange — the thinking-budget failure: reasoning consumed everything
    // (probed live against this account's CHAT_MODEL at a 20-token cap — see
    // parseWranglerVars's doc comment).
    const json = { result: { response: '', finish_reason: 'length' } };
    // Act / Assert
    expect(extractAnswer(json)).toEqual({ text: '', finishReason: 'length' });
  });

  it('throws on an unknown shape instead of scoring it as silence', () => {
    expect(() => extractAnswer({ result: { unexpected: 1 } })).toThrow(/shape mismatch/);
    expect(() => extractAnswer({})).toThrow(/shape mismatch/);
  });

  it('surfaces a Workers AI error envelope', () => {
    expect(() => extractAnswer({ success: false, errors: [{ message: 'no such model' }] })).toThrow(
      /no such model/,
    );
  });
});

/** Responses in call order; `number` = an error status, `string` = an answer. */
function stubWorkersAi(sequence: Array<number | string>): typeof fetch {
  let call = 0;
  return vi.fn(async () => {
    const next = sequence[call++];
    if (typeof next === 'number') {
      return {
        ok: false,
        status: next,
        text: async () => `{"errors":[{"message":"AiError: Request timeout"}]}`,
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ result: { response: next } }) } as unknown as Response;
  }) as unknown as typeof fetch;
}

const noSleep = async (): Promise<void> => {};
const REQ = { model: '@cf/test/model', question: '지금 서울 미세먼지 얼마나 심해?' };

describe('generateAnswer retries', () => {
  it('rides out a transient 408 — one flaky timeout must not void a paid run', async () => {
    // Arrange — the failure class that killed a retired-worker A/B run
    const fetchImpl = stubWorkersAi([408, 'recovered answer']);
    // Act
    const result = await generateAnswer(REQ, fetchImpl, noSleep);
    // Assert
    expect(result.text).toBe('recovered answer');
  });

  it('retries 429 and 5xx too', async () => {
    const fetchImpl = stubWorkersAi([429, 503, 'ok']);
    await expect(generateAnswer(REQ, fetchImpl, noSleep)).resolves.toMatchObject({ text: 'ok' });
  });

  it('gives up after the attempt budget and says how many it spent', async () => {
    // Arrange
    const fetchImpl = stubWorkersAi([408, 408, 408, 408]);
    // Act / Assert
    await expect(generateAnswer(REQ, fetchImpl, noSleep)).rejects.toThrow(
      new RegExp(`after ${GENERATE_ATTEMPTS} attempts`),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(GENERATE_ATTEMPTS);
  });

  it('does NOT retry a wrong model id or a bad token — retrying cannot fix those', async () => {
    // Arrange
    const fetchImpl = stubWorkersAi([404, 'never reached']);
    // Act / Assert
    await expect(generateAnswer(REQ, fetchImpl, noSleep)).rejects.toThrow(/HTTP 404/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('backs off linearly', () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
  });
});
