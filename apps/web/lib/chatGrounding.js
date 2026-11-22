/** Employer document chat is an excerpt selector, not an entailment classifier.
 * Only server-owned text is rendered. A document's statement is not a hiring finding.
 */
export const INSUFFICIENT_EVIDENCE = 'I cannot answer that request from authorized records.';

function abstain(error) {
  return {
    ok: !error, isAbstention: !error, errors: error ? [error] : [],
    validatedSources: [], safeReply: INSUFFICIENT_EVIDENCE
  };
}

// This route has only a Gemini transport. Never substitute it for a different
// requested provider. Python's separate generation switch is also honored here.
export function employerChatCanUseGemini(env) {
  const provider = String(env.WORKBYLINE_AI_PROVIDER || '').trim().toLowerCase();
  const strict = String(env.WORKBYLINE_AI_STRICT_PROVIDER || '').trim().toLowerCase();
  return env.WORKBYLINE_GENERATION_GATE === 'true' && !!env.GEMINI_API_KEY?.trim()
    && (provider === 'gemini' || (!provider && (strict === '' || strict === 'false')));
}

export function verifySpanSupportsAnswer(selection, text) {
  if (typeof selection !== 'string' || typeof text !== 'string') return false;
  const quote = selection.trim();
  if (!quote || text.length > 4000) return false;
  // Matching one sentence selects the ENTIRE span, retaining qualifications and context.
  return quote === text.trim() || text.trim().split(/(?<=[.!?])\s+/u).some(s => s === quote);
}

export function isCitableChatSpan(sp) {
  return [sp?.documentId, sp?.documentName, sp?.spanId, sp?.versionId || sp?.versionSha, sp?.text]
    .every(value => typeof value === 'string' && value.trim().length > 0) && sp.text.length <= 4000;
}

export function validateGroundedAnswer(selection, retrievedSpans = []) {
  if (typeof selection !== 'string' || !selection.trim()) return abstain('EMPTY_SELECTION');
  const input = selection.trim();
  if (input === INSUFFICIENT_EVIDENCE) return abstain();
  const matches = retrievedSpans.filter(sp => {
    if (!isCitableChatSpan(sp)) return false;
    const suffixes = [` [From Document: ${sp.documentName} | Span: ${sp.spanId}]`, ` See ${sp.documentName}.`];
    const suffix = suffixes.find(s => input.endsWith(s));
    return verifySpanSupportsAnswer(suffix ? input.slice(0, -suffix.length) : input, sp.text);
  });
  if (matches.length !== 1) return abstain(matches.length ? 'AMBIGUOUS_SOURCE' : 'NO_EXACT_SOURCE');
  const sp = matches[0];
  return {
    ok: true, isAbstention: false, errors: [],
    validatedSources: [{id:sp.documentId, title:sp.documentName, type:'WORKFLOW_DOCUMENT',
      version:sp.versionId || sp.versionSha, span_id:sp.spanId, supporting_span:sp.text}],
    safeReply: `Source excerpt from ${sp.documentName}:\n\n${sp.text}`
  };
}
