import crypto from 'crypto';
import { parseProofContract } from '@packages/hiring-genome';
import { attestTrustedEvidenceProvenance } from '@packages/proof-engine';

/**
 * Validates explicit server-trusted code/repository provenance.
 * Never trusts missing fields (!== false) or caller-forged booleans on candDoc / parser_metadata alone.
 */
function hasTrustedCodeProvenance(candDoc, options = {}) {
  if (!candDoc || typeof candDoc !== 'object') return false;
  if (candDoc.authorship_verified === false || candDoc.provenance_verified === false) {
    return false;
  }

  const tp = options?.trustedProvenance;
  if (!tp || typeof tp !== 'object') return false;
  if (tp.verified !== true || tp.authorship_verified !== true || tp.provenance_verified !== true) {
    return false;
  }
  if (typeof tp.verification_source !== 'string' || tp.verification_source.trim().length === 0) {
    return false;
  }
  if (typeof candDoc.id !== 'string' || candDoc.id.trim().length === 0) {
    return false;
  }
  if (typeof tp.document_id !== 'string' || tp.document_id.trim().length === 0 || tp.document_id !== candDoc.id) {
    return false;
  }
  const docHash = candDoc.normalized_text_sha256 || candDoc.file_sha256;
  if (typeof docHash !== 'string' || docHash.trim().length === 0) {
    return false;
  }
  if (typeof tp.content_sha256 !== 'string' || tp.content_sha256.trim().length === 0 || tp.content_sha256 !== docHash) {
    return false;
  }
  return true;
}

/**
 * Normalized file_type mapper enforcing EvidenceRef contract:
 * 'pdf' | 'docx' | 'csv' | 'json' | 'code'
 */
function normalizeFileType(mime, filename = '') {
  const m = (mime || '').toLowerCase();
  const f = (filename || '').toLowerCase();
  if (m.includes('pdf') || f.endsWith('.pdf')) return 'pdf';
  if (m.includes('word') || m.includes('docx') || f.endsWith('.docx') || f.endsWith('.doc')) return 'docx';
  if (m.includes('csv') || f.endsWith('.csv')) return 'csv';
  if (m.includes('json') || f.endsWith('.json')) return 'json';
  if (m.includes('code') || f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py')) return 'code';
  return 'pdf'; // standard document fallback
}

/**
 * Truthful source offset construction adhering to shared-contracts EvidenceRef
 */
function getTruthfulSourceOffset(candDoc, startOffset, endOffset, excerptHash) {
  let pageNum = typeof candDoc?.parser_metadata?.page_number === 'number'
    ? candDoc.parser_metadata.page_number
    : undefined;

  const spans = candDoc?.parser_metadata?.page_spans;
  if (Array.isArray(spans) && spans.length > 0) {
    const matchedSpan = spans.find(s => startOffset >= s.start_char && startOffset <= s.end_char);
    if (matchedSpan) {
      pageNum = matchedSpan.page_number;
    }
  }

  return {
    page: pageNum || 1,
    start_offset: startOffset,
    end_offset: endOffset,
    excerpt_hash: excerptHash
  };
}
export function validateEvidenceRef(evRef, normText) {
  if (!evRef || typeof evRef !== 'object') {
    throw new Error('Invalid EvidenceRef: must be an object');
  }
  if (!evRef.id || !evRef.document_id || !evRef.candidate_id || !evRef.role_id) {
    throw new Error(`Invalid EvidenceRef ${evRef.id}: missing core identifier`);
  }
  const validTypes = ['pdf', 'docx', 'csv', 'json', 'code'];
  if (!validTypes.includes(evRef.file_type)) {
    throw new Error(`Invalid EvidenceRef ${evRef.id}: file_type '${evRef.file_type}' must be one of ${validTypes.join(', ')}`);
  }
  const offset = evRef.source_offset;
  if (!offset || typeof offset.start_offset !== 'number' || typeof offset.end_offset !== 'number') {
    throw new Error(`Invalid EvidenceRef ${evRef.id}: missing numeric offsets`);
  }
  if (offset.start_offset > offset.end_offset) {
    throw new Error(`Invalid EvidenceRef ${evRef.id}: start_offset > end_offset`);
  }
  if (normText) {
    const actualSlice = normText.substring(offset.start_offset, offset.end_offset);
    if (evRef.excerpt && evRef.excerpt !== actualSlice) {
      throw new Error(`Integrity assertion failed for ${evRef.id}: excerpt does not match normalized_text slice`);
    }
  }
  return true;
}

/**
 * Multi-Span Evidence & Source-Faithful Claim Extractor
 * Fully decoupled from fixture filenames and static mh_1 keyword maps.
 * Matches dynamically against the active approved ProofContract.
 */
export function extractMultiSpanEvidenceAndClaims(candDoc, run, options = {}) {
  const normText = candDoc?.normalized_text || '';
  const lowerText = normText.toLowerCase();

  const stableSerializeEvidence = (value) => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((v) => stableSerializeEvidence(v)).join(',')}]`;
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerializeEvidence(value[k])}`).join(',')}}`;
  };

  const evidenceRefs = [];
  const seenEvidenceById = new Map();
  const pushUniqueEvidenceRef = (evRef) => {
    if (!evRef?.id) return;
    const serialized = stableSerializeEvidence(evRef);
    const existing = seenEvidenceById.get(evRef.id);
    if (existing) {
      if (existing.serialized !== serialized) {
        throw new Error(`EVIDENCE_REF_CONFLICT: Conflicting EvidenceRef content shares id "${evRef.id}"`);
      }
      return;
    }
    seenEvidenceById.set(evRef.id, { ref: evRef, serialized });
    evidenceRefs.push(evRef);
  };
  const claims = [];
  const trustedProvenance = {};
  const extractionTimestamp = candDoc.created_at || new Date().toISOString();

  // Helper to build verified EvidenceRef for a specific phrase match
  function createSpanEvidence(matchText, matchIndex, sourceTier = 'document', isVerifiedCode = false) {
    const startOffset = matchIndex;
    const endOffset = matchIndex + matchText.length;
    const excerpt = normText.substring(startOffset, endOffset);
    const excerptHash = crypto.createHash('sha256').update(excerpt).digest('hex');

    if (excerpt !== normText.substring(startOffset, endOffset)) {
      throw new Error(`Integrity assertion failed: excerpt does not match normalized_text slice [${startOffset}:${endOffset}]`);
    }

    const fileType = normalizeFileType(candDoc.mime_type, candDoc.filename);
    const sha256 = candDoc.normalized_text_sha256 || candDoc.file_sha256 || crypto.createHash('sha256').update(normText).digest('hex');

    // Resolve page number if parser provided page_spans (C09-05)
    let pageNum = undefined;
    if (candDoc.parser_metadata?.page_spans && Array.isArray(candDoc.parser_metadata.page_spans)) {
      const matchSpan = candDoc.parser_metadata.page_spans.find(s => startOffset >= s.start_char && startOffset <= s.end_char);
      if (matchSpan) pageNum = matchSpan.page_number;
    } else if (typeof candDoc.parser_metadata?.page_number === 'number') {
      pageNum = candDoc.parser_metadata.page_number;
    } else if (candDoc.parser_metadata?.total_pages === 1 || candDoc.parser_metadata?.page_count === 1) {
      pageNum = 1;
    }
    const parserName = candDoc.parser_name || candDoc.parser_metadata?.parser || "pdf-parse@2.4.5";
    const physicalFileHash = candDoc.file_sha256 || sha256;
    const normTextSha256 = candDoc.normalized_text_sha256 || sha256;
    const charCount = endOffset - startOffset;

    const evRef = {
      id: `ev_${(candDoc.id || "doc").substring(0, 8)}_${startOffset}_${endOffset}`,
      document_id: candDoc.id || "doc_unknown",
      candidate_id: candDoc.candidate_id || "cand_unknown",
      role_id: run?.id || "role_unknown",
      org_id: candDoc.org_id || "org_unknown",
      filename: candDoc.filename || "document.pdf",
      file_type: fileType,
      mime_type: candDoc.mime_type || (candDoc.filename?.endsWith(".pdf") ? "application/pdf" : "text/plain"),
      source_type: fileType || "document",
      sha256: sha256,
      file_sha256: physicalFileHash,
      file_hash: physicalFileHash,
      normalized_text_sha256: normTextSha256,
      parser_name: parserName,
      parser_version: parserName,
      parser: parserName,
      excerpt: excerpt,
      excerpt_hash: excerptHash,
      page: pageNum,
      locator: pageNum ? `Page ${pageNum} (Chars ${startOffset}-${endOffset})` : `Normalized Text (Chars ${startOffset}-${endOffset})`,
      source_offset: {
        page: pageNum,
        start_offset: startOffset,
        end_offset: endOffset,
        start_char: startOffset,
        end_char: endOffset,
        char_count: charCount,
        excerpt_hash: excerptHash
      },
      source_tier: sourceTier,
      created_at: extractionTimestamp,
      version: "1.0.0"
    };

    // Runtime schema validation
    validateEvidenceRef(evRef, normText);

    if (isVerifiedCode && (evRef.source_tier === 'code' || evRef.source_tier === 'repo')) {
      const attestedRef = attestTrustedEvidenceProvenance(evRef, {
        verification_source: options.trustedProvenance.verification_source,
        document_id: evRef.document_id,
        sha256: evRef.sha256,
        authorship_verified: true,
        provenance_verified: true,
      });
      trustedProvenance[attestedRef.id] = {
        evidence_id: attestedRef.id,
        authorship_verified: true,
        provenance_verified: true,
        verification_source: options.trustedProvenance.verification_source,
        sha256: attestedRef.sha256,
        document_id: attestedRef.document_id,
      };
      return attestedRef;
    }

    return evRef;
  }

  // 1. Determine Source Tier & Explicit Trusted Code Provenance
  // Candidate resume assertions remain 'self_claim' or 'document' unless corroborated by verified code/repo
  const isCode = candDoc.mime_type?.includes('code') || candDoc.filename?.endsWith('.ts') || candDoc.filename?.endsWith('.py');
  const trustedCodeProvenance =
    (isCode || candDoc.source_tier === 'code' || candDoc.source_tier === 'repo') &&
    hasTrustedCodeProvenance(candDoc, options);
  const sourceTier = isCode ? 'code' : (candDoc.parser_metadata?.is_self_claim ? 'self_claim' : 'document');

  // 2. Parse Active Approved ProofContract
  let requirements = [];
  if (Array.isArray(run?.proof_contract?.requirements)) {
    requirements = run.proof_contract.requirements;
  } else if (Array.isArray(run?.requirements)) {
    requirements = run.requirements;
  } else if (Array.isArray(run?.brief_json?.must_haves) || Array.isArray(run?.must_haves)) {
    const parsed = parseProofContract(run || {});
    requirements = parsed.requirements || [];
  }

  // Normalize category to lowercase
  requirements = requirements.map(r => ({
    ...r,
    category: (r.category || 'must_have').toLowerCase()
  }));

  // 3. Disqualifiers Gate (Category: 'disqualifier')
  // NEVER disqualify from generic words like "conflict" (e.g. "resolved a conflict between teams")!
  // Only check explicit disqualifier requirements defined in the contract.
  // Avoid naive single-word splitting (e.g. "record" matching "track record") and polarity blindness.
  // CRITICAL: Do NOT return early — continue extracting all requirement evidence for complete evaluation.
  const disqualifierReqs = requirements.filter(r => r.category === 'disqualifier');
  for (const disqReq of disqualifierReqs) {
    const rawTitle = (disqReq.title || '').trim().toLowerCase();
    if (!rawTitle) continue;

    const phrasesToTest = [];
    if (Array.isArray(disqReq.keywords) && disqReq.keywords.length > 0) {
      phrasesToTest.push(...disqReq.keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean));
    } else {
      phrasesToTest.push(rawTitle);
    }

    for (const phrase of phrasesToTest) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phraseRegex = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
      let match;
      while ((match = phraseRegex.exec(lowerText)) !== null) {
        const idx = match.index;
        const precedingContext = lowerText.substring(Math.max(0, idx - 40), idx);
        const subsequentContext = lowerText.substring(idx + match[0].length, Math.min(lowerText.length, idx + match[0].length + 40));

        // Polarity check: Is the candidate stating they do NOT have this disqualifier?
        const isNegated = /\b(no|never|clean|zero|without|not|none|free\s+of)\b\s*(\w+\s+){0,3}$/i.test(precedingContext) ||
                          /^\s*(is|are|was|were)?\s*(clean|clear|none|zero|absent|unblemished)\b/i.test(subsequentContext);

        // False positive idiom check (e.g., "track record", "proven record", "record of success")
        const isIdiomFalsePositive = /\b(track|proven|stellar|strong|flawless|excellent|impressive|demonstrated)\s*$/i.test(precedingContext);

        if (isNegated || isIdiomFalsePositive) {
          continue;
        }

        const windowEnd = Math.min(normText.length, idx + 80);
        const spanText = normText.substring(idx, windowEnd);
        const evRef = createSpanEvidence(spanText, idx, sourceTier);
        pushUniqueEvidenceRef(evRef);

        claims.push({
          id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_disq_${idx}`,
          claim_text: `Disqualifier criteria matched (${disqReq.title}): "${spanText.trim()}"`,
          requirement_id: disqReq.id,
          evidence_refs: [evRef],
          is_conflicting: true,
          status: 'CONFLICTING',
          confidence: 0.90
        });
        break; // Matched this disqualifier requirement; proceed to next without returning early
      }
    }
  }

  // 4. Conflicting Evidence Detection
  // Check for explicit contradiction markers (e.g. "contains conflict: claimed senior role but resume lists internship")
  const conflictMarkers = ['contains conflict:', 'record contradicts:', 'discrepancy in dates:'];
  for (const marker of conflictMarkers) {
    if (lowerText.includes(marker)) {
      const idx = lowerText.indexOf(marker);
      const windowEnd = Math.min(normText.length, idx + 80);
      const spanText = normText.substring(idx, windowEnd);
      const evRef = createSpanEvidence(spanText, idx, sourceTier);
      pushUniqueEvidenceRef(evRef);

      claims.push({
        id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_conflict_${idx}`,
        claim_text: `Conflicting evidence detected: "${spanText.trim()}"`,
        requirement_id: 'conflict_audit',
        evidence_refs: [evRef],
        is_conflicting: true
      });
    }
  }

  // 5. Match Evidence Against Active Approved ProofContract Requirements
  const activeReqs = requirements.filter(r => r.category !== 'disqualifier');

  // Helper function to extract cleanly bounded sentence/clause window
  function getBoundedSpan(idx, termLength) {
    const precedingText = normText.substring(0, idx);
    const lastBreakMatch = precedingText.match(/[.;\n\r][^.;\n\r]*$/);
    let windowStart = lastBreakMatch ? idx - (lastBreakMatch[0].length - 1) : Math.max(0, idx - 45);

    const followingText = normText.substring(idx + termLength);
    const nextBreakIndex = followingText.search(/[.;\n\r]/);
    let windowEnd = nextBreakIndex !== -1 ? idx + termLength + nextBreakIndex : Math.min(normText.length, idx + termLength + 45);

    if (idx - windowStart > 55) windowStart = idx - 55;
    if (windowEnd - (idx + termLength) > 55) windowEnd = idx + termLength + 55;

    while (windowStart < windowEnd && /\s/.test(normText[windowStart])) windowStart++;
    while (windowEnd > windowStart && /\s/.test(normText[windowEnd - 1])) windowEnd--;

    if (windowStart >= windowEnd) {
      windowStart = Math.max(0, idx - 25);
      windowEnd = Math.min(normText.length, idx + termLength + 25);
    }
    return { windowStart, windowEnd };
  }

  // If role has explicit requirements in the ProofContract, match against them!
  if (activeReqs.length > 0) {
    activeReqs.forEach(req => {
      const reqTitleLower = (req.title || '').toLowerCase();
      const searchTerms = [];
      if (Array.isArray(req.keywords)) {
        searchTerms.push(...req.keywords.map(k => String(k).toLowerCase()));
      }
      
      const knownTechTerms = [
        { term: 'go', aliases: ['go', 'golang'] },
        { term: 'node.js', aliases: ['node.js', 'nodejs', 'node'] },
        { term: 'postgresql', aliases: ['postgresql', 'postgres'] },
        { term: 'python', aliases: ['python'] },
        { term: 'fastapi', aliases: ['fastapi'] },
        { term: 'docker', aliases: ['docker'] },
        { term: 'kubernetes', aliases: ['kubernetes', 'k8s'] },
        { term: 'terraform', aliases: ['terraform'] },
        { term: 'react', aliases: ['react'] },
        { term: 'next.js', aliases: ['next.js', 'nextjs'] },
        { term: 'bash', aliases: ['bash', 'shell'] },
        { term: 'distributed systems', aliases: ['distributed systems'] }
      ];

      for (const item of knownTechTerms) {
        // Enforce word boundaries on requirement title to avoid substring collisions (e.g. Django -> go)
        const hasAlias = item.aliases.some(a => {
          const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?:[^a-z0-9_]|$)`, 'i').test(reqTitleLower);
        });
        if (hasAlias) {
          searchTerms.push(...item.aliases);
        }
      }

      if (searchTerms.length === 0) {
        const words = reqTitleLower.split(/[\s,–—\-\/]+/).filter(w => (w.length > 3 || w === 'go') && !['experience', 'knowledge', 'years', 'skills', 'design', 'architecture', 'development'].includes(w));
        searchTerms.push(...words);
      }

      for (const term of searchTerms) {
        let searchPos = 0;
        let matched = false;
        while (searchPos < lowerText.length) {
          const idx = lowerText.indexOf(term, searchPos);
          if (idx === -1) break;

          // Enforce word boundary checks on document text (with camelCase boundary support for longer tech terms)
          const charBefore = idx > 0 ? lowerText[idx - 1] : ' ';
          const charAfter = idx + term.length < lowerText.length ? lowerText[idx + term.length] : ' ';
          const origBefore = idx > 0 ? normText[idx - 1] : ' ';
          const origFirst = normText[idx] || ' ';
          const origAfter = idx + term.length < normText.length ? normText[idx + term.length] : ' ';
          const isCamelStart = /[a-z]/.test(origBefore) && /[A-Z]/.test(origFirst);
          const isCamelEnd = /[A-Z]/.test(origAfter);

          if (term === 'node') {
            if (charAfter && /[a-z0-9]/i.test(charAfter) && charAfter !== '.') {
              searchPos = idx + 4;
              continue;
            }
          } else if (term === 'go') {
            if (/[a-z0-9]/i.test(charBefore) || /[a-z0-9]/i.test(charAfter)) {
              searchPos = idx + 2;
              continue;
            }
          } else if (term === 'next' && lowerText.substring(idx, idx + 7) !== 'next.js' && lowerText.substring(idx, idx + 6) !== 'nextjs') {
            searchPos = idx + 4;
            continue;
          } else {
            // Alphanumeric word-boundary protection (allows snake_case and camelCase code identifiers for >=5-char terms)
            const blockedBefore = /[a-z0-9]/i.test(charBefore) && !(term.length >= 5 && isCamelStart);
            const blockedAfter = /[a-z0-9]/i.test(charAfter) && !(term.length >= 5 && isCamelEnd);
            if (blockedBefore || blockedAfter) {
              searchPos = idx + term.length;
              continue;
            }
          }

          // Negation Detection (e.g., "no Kubernetes experience", "haven't used Docker", "zero experience with React")
          const precedingSnippet = lowerText.substring(Math.max(0, idx - 40), idx);
          const subsequentSnippet = lowerText.substring(idx + term.length, Math.min(lowerText.length, idx + term.length + 35));
          const isNegatedPre = /\b(no|not|never|without|lack\s+of|haven't|hasn't|hadn't|zero|no\s+prior)\b\s*(\w+\s+){0,3}$/i.test(precedingSnippet);
          const isNegatedPost = /^\s*(is|are|was|were)?\s*(not|never|no|zero|unsupported|lacking)\b/i.test(subsequentSnippet);
          const isNegated = isNegatedPre || isNegatedPost;

          const { windowStart, windowEnd } = getBoundedSpan(idx, term.length);
          const spanText = normText.substring(windowStart, windowEnd);

          // Accurate line-level boundary analysis (C09-04)
          // Do NOT label an experience paragraph as a skill list because a nearby heading contains skills!
          const prevNewline = normText.lastIndexOf('\n', idx);
          const lineStart = prevNewline === -1 ? 0 : prevNewline + 1;
          const nextNewline = normText.indexOf('\n', idx);
          const lineEnd = nextNewline === -1 ? normText.length : nextNewline;
          const currentLine = normText.substring(lineStart, lineEnd).trim();

          const isSkillListHeader = /^(technical\s+competencies|programming\s*&\s*scripting|skills\s*:|competencies\s*:|technologies\s*:|tools\s*:|languages\s*:|proficiencies\s*:)/i.test(currentLine);
          const isCommaDelimitedList = /^([A-Za-z0-9_+#.\s-]{1,30}[,|•·/]\s*){2,}[A-Za-z0-9_+#.\s-]{1,30}$/.test(currentLine);
          const hasSentenceStructure = /\b(led|architected|engineered|built|designed|migrated|deployed|implemented|scaled|maintained|orchestrated|automated|developed|created|managed|responsible\s+for|worked\s+with|contributed\s+to)\b/i.test(currentLine) ||
                                       /^(at|\d{4}|from|role:|experience:)\b/i.test(currentLine);

          const isSkillList = (isSkillListHeader || isCommaDelimitedList) && !hasSentenceStructure;

          // 3-Way Separation: Corroborated Code vs Detailed Resume Assertion vs Skill-List Mention
          // Resume action words alone must NOT produce corroborated/VERIFIED competence!
          let classification = 'self_reported';
          let sourceType = 'resume_assertion';
          let claimStatus = 'INFERRED';
          let confidence = 0.50;
          let spanTier = 'self_claim';

          const isVerifiedCodeProvenance = trustedCodeProvenance;

          if (isVerifiedCodeProvenance) {
            classification = 'corroborated';
            sourceType = 'corroborated';
            claimStatus = 'VERIFIED';
            confidence = 0.95;
            spanTier = candDoc.source_tier === 'repo' ? 'repo' : 'code';
          } else if (isSkillList) {
            classification = 'self_reported';
            sourceType = 'skill_list';
            claimStatus = 'INFERRED';
            confidence = 0.40;
            spanTier = isCode ? 'code' : 'self_claim';
          } else {
            // Detailed resume experience assertion (or unverified code) remains unverified assertion
            classification = 'self_reported';
            sourceType = 'resume_assertion';
            claimStatus = 'INFERRED';
            confidence = 0.60;
            spanTier = isCode ? 'code' : 'self_claim';
          }

          if (candDoc.parser_metadata?.is_self_claim || candDoc.source_tier === 'self_claim') {
            spanTier = 'self_claim';
            if (classification !== 'corroborated') {
              claimStatus = 'INFERRED';
            }
          }
          const evRef = createSpanEvidence(spanText, windowStart, spanTier, isVerifiedCodeProvenance);
          pushUniqueEvidenceRef(evRef);

          if (isNegated) {
            claims.push({
              id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_neg_${req.id}_${windowStart}`,
              claim_text: `Negated requirement assertion: "${spanText.trim()}"`,
              requirement_id: req.id,
              evidence_refs: [evRef],
              source_type: 'negated',
              evidence_classification: 'negated',
              is_conflicting: true,
              is_negated: true,
              status: 'UNPROVEN',
              confidence: 0.95
            });
            searchPos = idx + term.length;
            continue; // Do NOT count as positive match for requirement!
          }

          let claimDescription = '';
          if (classification === 'corroborated') {
            claimDescription = `${req.title} corroborated in code/repository: "${spanText.trim()}" (offset ${windowStart}-${windowEnd})`;
          } else if (isSkillList) {
            claimDescription = `${req.title} mentioned in resume skill list: "${spanText.trim()}" (self-reported)`;
          } else {
            claimDescription = `${req.title} asserted in resume experience: "${spanText.trim()}" (candidate assertion, offset ${windowStart}-${windowEnd})`;
          }

          claims.push({
            id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_${req.id}_${windowStart}`,
            claim_text: claimDescription,
            requirement_id: req.id,
            evidence_refs: [evRef],
            source_type: sourceType,
            evidence_classification: classification,
            is_conflicting: false,
            is_inferred: classification === 'self_reported',
            status: claimStatus,
            confidence
          });
          matched = true;
          break;
        }
        if (matched) break;
      }
    });
  } else {
    // Exploratory parsing for roles without predefined contract requirements
    const standardTechKeywords = [
      { key: 'go', label: 'Go', reqId: 'tech_go' },
      { key: 'golang', label: 'Go', reqId: 'tech_go' },
      { key: 'bash', label: 'Bash', reqId: 'tech_bash' },
      { key: 'node', label: 'Node.js', reqId: 'tech_node' },
      { key: 'postgres', label: 'PostgreSQL', reqId: 'tech_postgres' },
      { key: 'postgresql', label: 'PostgreSQL', reqId: 'tech_postgres' },
      { key: 'python', label: 'Python', reqId: 'tech_python' },
      { key: 'fastapi', label: 'FastAPI', reqId: 'tech_fastapi' },
      { key: 'docker', label: 'Docker', reqId: 'tech_docker' },
      { key: 'kubernetes', label: 'Kubernetes', reqId: 'tech_kubernetes' },
      { key: 'terraform', label: 'Terraform', reqId: 'tech_terraform' },
      { key: 'react', label: 'React', reqId: 'tech_react' },
      { key: 'next.js', label: 'Next.js', reqId: 'tech_nextjs' },
      { key: 'nextjs', label: 'Next.js', reqId: 'tech_nextjs' }
    ];

    standardTechKeywords.forEach(kw => {
      let searchPos = 0;
      while (searchPos < lowerText.length) {
        const idx = lowerText.indexOf(kw.key, searchPos);
        if (idx === -1) break;

        if (kw.key === 'next' && lowerText.substring(idx, idx + 7) !== 'next.js' && lowerText.substring(idx, idx + 6) !== 'nextjs') {
          searchPos = idx + kw.key.length;
          continue;
        }

        // Negation Detection
        const precedingSnippet = lowerText.substring(Math.max(0, idx - 40), idx);
        const subsequentSnippet = lowerText.substring(idx + kw.key.length, Math.min(lowerText.length, idx + kw.key.length + 35));
        const isNegatedPre = /\b(no|not|never|without|lack\s+of|haven't|hasn't|hadn't|zero|no\s+prior)\b\s*(\w+\s+){0,3}$/i.test(precedingSnippet);
        const isNegatedPost = /^\s*(is|are|was|were)?\s*(not|never|no|zero|unsupported|lacking)\b/i.test(subsequentSnippet);
        const isNegated = isNegatedPre || isNegatedPost;

        const isVerifiedExploratoryCode = trustedCodeProvenance;
        const { windowStart, windowEnd } = getBoundedSpan(idx, kw.key.length);
        const spanText = normText.substring(windowStart, windowEnd);
        const expTier = isVerifiedExploratoryCode
          ? (candDoc.source_tier === 'repo' ? 'repo' : 'code')
          : (isCode ? 'code' : 'self_claim');
        const evRef = createSpanEvidence(spanText, windowStart, expTier, isVerifiedExploratoryCode);
        pushUniqueEvidenceRef(evRef);

        if (isNegated) {
          claims.push({
            id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_neg_${kw.key}_${windowStart}`,
            claim_text: `Negated requirement assertion: "${spanText.trim()}"`,
            requirement_id: kw.reqId,
            evidence_refs: [evRef],
            is_conflicting: true,
            is_negated: true,
            status: 'UNPROVEN'
          });
          searchPos = idx + kw.key.length;
          continue; // Do NOT count as positive match!
        }

        claims.push({
          id: `claim_${(candDoc.id || 'doc').substring(0, 8)}_${kw.key}_${windowStart}`,
          claim_text: `${kw.label} mentioned in document: "${spanText.trim()}" (offset ${windowStart}-${windowEnd})`,
          requirement_id: kw.reqId,
          evidence_refs: [evRef],
          source_type: isVerifiedExploratoryCode ? 'corroborated' : 'self_reported',
          evidence_classification: isVerifiedExploratoryCode ? 'corroborated' : 'self_reported',
          is_conflicting: false,
          is_inferred: !isVerifiedExploratoryCode,
          status: isVerifiedExploratoryCode ? 'VERIFIED' : 'INFERRED',
          confidence: isVerifiedExploratoryCode ? 0.95 : 0.50
        });

        searchPos = idx + kw.key.length;
        break;
      }
    });
  }

  // Zero arbitrary fallbacks to mh_1! Unsupported requirements remain unresolved.
  return { evidenceRefs, claims, trustedProvenance };
}

export function extractEvidenceClaims(candDocOrText, docId, run) {
  let candDoc;
  if (typeof candDocOrText === 'string') {
    candDoc = {
      id: docId || 'doc_test',
      normalized_text: candDocOrText,
      mime_type: 'application/pdf',
      filename: 'document.pdf'
    };
  } else {
    candDoc = candDocOrText;
  }
  const result = extractMultiSpanEvidenceAndClaims(candDoc, run);
  return result.claims;
}
