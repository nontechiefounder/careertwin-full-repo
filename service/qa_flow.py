"""Bounded LangGraph execution with claim-to-evidence support verification; no agent loops, no model reasoning storage."""
import re
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from .core import Fault

class QAState(TypedDict, total=False):
    question: str
    evidence: dict
    output: dict

PROMPT_INJECTION_PATTERN = re.compile(
    r"(?i)\b(ignore\s+(?:all\s+|previous\s+|prior\s+)?instructions|system\s+prompt|disregard\s+(?:all\s+)?rules|you\s+are\s+now|developer\s+mode|admin\s+override|exfiltrate)\b"
)

HIGH_STAKES_QUALIFICATIONS = {
    'aws', 'gcp', 'azure', 'certified', 'certification', 'phd', 'doctorate',
    'master', 'masters', 'bachelor', 'bachelors', 'degree', 'architect', 'principal',
    'director', 'vp', 'executive', 'lead', 'staff', 'expert', 'pmp', 'cissp', 'ckad', 'cka'
}

NEGATION_TERMS = {
    'no', 'not', 'never', 'none', 'neither', 'nor', 'lacks', 'lacking',
    'without', 'cannot', "can't", "doesn't", "hasn't", "isn't", "aren't",
    "won't", "wouldn't", 'zero'
}

TEAM_TERMS = {'team', 'we', 'our', 'company', 'department', 'group'}
INDIVIDUAL_TERMS = {'candidate', 'i', 'he', 'she', 'individual', 'personal'}


NON_ENTITY_WORDS = {
    'the', 'this', 'that', 'these', 'those', 'in', 'on', 'at', 'to', 'for', 'with', 'from',
    'by', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'under', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can',
    'will', 'just', 'should', 'now', 'he', 'she', 'they', 'it', 'we', 'i', 'you', 'candidate',
    'document', 'source', 'evidence', 'section', 'page', 'python', 'aws', 'gcp', 'azure',
    'rust', 'golang', 'java', 'sql', 'linux', 'docker', 'kubernetes', 'kafka', 'git'
}

REPORTING_STOPWORDS = {
    'the', 'a', 'an', 'and', 'or', 'for', 'with', 'to', 'in', 'on', 'at', 'from', 'by',
    'as', 'of', 'candidate', 'experience', 'has', 'have', 'had', 'is', 'was', 'are', 'were',
    'been', 'being', 'years', 'mentions', 'document', 'worked', 'served', 'role', 'background',
    'completed', 'delivered', 'built', 'also', 'states', 'according', 'source', 'evidence',
    'section', 'notes', 'that', 'this', 'these', 'those', 'who', 'which', 'their', 'his', 'her',
    'its', 'well'
}

INDIVIDUAL_TERMS = {
    'candidate', 'i', 'he', 'she', 'individual', 'personal',
    'independently', 'individually', 'solely', 'single-handedly', 'alone', 'myself'
}


NUMBER_WORDS = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
    'ten': '10', 'eleven': '11', 'twelve': '12', 'thirteen': '13',
    'fourteen': '14', 'fifteen': '15', 'sixteen': '16', 'seventeen': '17',
    'eighteen': '18', 'nineteen': '19', 'twenty': '20', 'thirty': '30',
    'forty': '40', 'fifty': '50', 'sixty': '60', 'seventy': '70',
    'eighty': '80', 'ninety': '90', 'hundred': '100', 'thousand': '1000'
}

ACTION_ROLE_VERBS = {
    'certified', 'earned', 'received', 'holds', 'awarded', 'built', 'created',
    'designed', 'led', 'managed', 'mentored', 'architected', 'architect',
    'authored', 'wrote', 'developed', 'implemented', 'directed', 'founded'
}

SYNONYM_SETS = [
    {'programming', 'development', 'engineering'},
    {'build', 'develop', 'create'},
    {'lead', 'head', 'manage'},
]


def extract_entities(text: str) -> set[str]:
    """Extract capitalized candidate and coworker entity names."""
    words = re.findall(r"\b[A-Z][a-z]+\b", text)
    return {w for w in words if w.lower() not in NON_ENTITY_WORDS}


def extract_numbers(text: str) -> set[str]:
    """Extract numeric representations including digits and recognized number words."""
    nums = set(re.findall(r"\b\d+(?:\.\d+)?\b", text))
    words = re.findall(r"\b[a-zA-Z]+\b", text.lower())
    for w in words:
        if w in NUMBER_WORDS:
            nums.add(NUMBER_WORDS[w])
    return nums


def split_into_clauses(sentence: str) -> list[str]:
    """Split sentence into component clauses along semicolons and clause-separating commas."""
    raw_clauses = re.split(r";\s*|,\s+(?:and|but|while|whereas|although|though|with|having|as well as)\s*|,\s*", sentence)
    clauses = [c.strip() for c in raw_clauses if c.strip()]
    return clauses if clauses else [sentence]


def check_entity_relationship_inversion(clause: str, cited_text: str, all_known_entities: set) -> tuple[bool, str]:
    """Detect when entity relationships are reversed between clause and citation (e.g. Alice mentored Bob vs Bob mentored Alice)."""
    clause_ents = []
    for m in re.finditer(r"\b[A-Za-z]+\b", clause):
        w = m.group()
        for ent in all_known_entities:
            if w.lower() == ent.lower():
                clause_ents.append((ent, m.start(), m.end()))
                break

    for i in range(len(clause_ents)):
        for j in range(i + 1, len(clause_ents)):
            e1, s1, end1 = clause_ents[i]
            e2, s2, end2 = clause_ents[j]
            if e1.lower() == e2.lower():
                continue
            between_clause = clause[end1:s2].strip().lower()
            between_clause_words = set(re.findall(r"\b[a-z]{3,}\b", between_clause))
            verbs = between_clause_words - REPORTING_STOPWORDS - NEGATION_TERMS
            if not verbs:
                continue
            for verb in verbs:
                citation_inverted_pattern = rf"(?i)\b{re.escape(e2)}\b(?:\s+\w+){{0,4}}\s+\b{re.escape(verb)}\b(?:\s+\w+){{0,4}}\s+\b{re.escape(e1)}\b"
                citation_direct_pattern = rf"(?i)\b{re.escape(e1)}\b(?:\s+\w+){{0,4}}\s+\b{re.escape(verb)}\b(?:\s+\w+){{0,4}}\s+\b{re.escape(e2)}\b"
                if re.search(citation_inverted_pattern, cited_text) and not re.search(citation_direct_pattern, cited_text):
                    return False, f"Entity relationship inversion: evidence states '{e2} ... {verb} ... {e1}', but clause asserts '{e1} ... {verb} ... {e2}'"
    return True, "OK"


def check_contrastive_action_mismatch(clause: str, cited_text: str) -> tuple[bool, str]:
    """Detect when contrasting actions and objects are cross-attributed (e.g. evaluated Python but deployed Go vs deployed Python)."""
    contrast_re = re.compile(
        r"(?i)\b([a-zA-Z]{3,})\s+(?:the\s+|a\s+|an\s+)?([a-zA-Z0-9_\-\+]{2,})\s+"
        r"(?:but|whereas|while|instead of|rather than|yet|though)\s+"
        r"(?:had\s+|has\s+|was\s+)?([a-zA-Z]{3,})\s+(?:the\s+|a\s+|an\s+)?([a-zA-Z0-9_\-\+]{2,})\b"
    )
    for m in contrast_re.finditer(cited_text):
        v1, o1, v2, o2 = m.groups()
        v1_l, o1_l, v2_l, o2_l = v1.lower(), o1.lower(), v2.lower(), o2.lower()
        if v1_l != v2_l and o1_l != o2_l:
            p1 = rf"(?i)\b{re.escape(v2_l)}\b(?:\s+\w+){{0,2}}\s+\b{re.escape(o1_l)}\b"
            if re.search(p1, clause):
                return False, f"Action-object mismatch: citation states '{v1} {o1} but {v2} {o2}', but clause asserts '{v2} {o1}'"
            p2 = rf"(?i)\b{re.escape(v1_l)}\b(?:\s+\w+){{0,2}}\s+\b{re.escape(o2_l)}\b"
            if re.search(p2, clause):
                return False, f"Action-object mismatch: citation states '{v1} {o1} but {v2} {o2}', but clause asserts '{v1} {o2}'"
    return True, "OK"


def verify_clause_support(clause: str, cited_text: str, cited_words: set, cited_numbers: set, cited_entities: set, all_known_entities: set | None = None) -> tuple[bool, str]:
    clause_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", clause.lower()))
    number_words_in_clause = {w for w in clause_words if w in NUMBER_WORDS}
    substantive_terms = clause_words - NEGATION_TERMS - REPORTING_STOPWORDS - number_words_in_clause
    if all_known_entities is None:
        all_known_entities = cited_entities

    # Expand cited_numbers with number words in citation
    full_cited_numbers = set(cited_numbers) | extract_numbers(cited_text)
    clause_numbers = extract_numbers(clause)

    # 1. Number / Metric checking (normalized across digits and number words)
    for num in clause_numbers:
        if num not in full_cited_numbers:
            return False, f"Unsupported numerical claim: '{num}'"

    # 2. High-stakes qualification checking
    unsupported_quals = (clause_words & HIGH_STAKES_QUALIFICATIONS) - cited_words
    if unsupported_quals:
        return False, f"Unsupported qualification: {unsupported_quals}"

    # 3. Entity attribution & relational directionality checking
    ok_rel, reason_rel = check_entity_relationship_inversion(clause, cited_text, all_known_entities)
    if not ok_rel:
        return False, reason_rel

    mentioned_entities = {e for e in all_known_entities if re.search(rf"\b{re.escape(e)}\b", clause, re.IGNORECASE)}
    if mentioned_entities:
        for ent in mentioned_entities:
            if ent.lower() not in cited_words:
                return False, f"Ungrounded entity mentioned: '{ent}'"
            if clause_words & (HIGH_STAKES_QUALIFICATIONS | ACTION_ROLE_VERBS):
                for qual in (clause_words & (HIGH_STAKES_QUALIFICATIONS | ACTION_ROLE_VERBS)):
                    for other_ent in all_known_entities:
                        if other_ent.lower() != ent.lower():
                            other_pattern = rf"(?i)\b{other_ent}\b(?:\s+\w+){{0,6}}\s+\b{qual}\b|\b{qual}\b(?:\s+\w+){{0,6}}\s+\b{other_ent}\b"
                            ent_pattern = rf"(?i)\b{ent}\b(?:\s+\w+){{0,6}}\s+\b{qual}\b|\b{qual}\b(?:\s+\w+){{0,6}}\s+\b{ent}\b"
                            if re.search(other_pattern, cited_text) and not re.search(ent_pattern, cited_text):
                                return False, f"Entity attribution mismatch: '{qual}' belongs to '{other_ent}', not '{ent}'"

    # 4. Contrastive action-object binding checking
    ok_action, reason_action = check_contrastive_action_mismatch(clause, cited_text)
    if not ok_action:
        return False, reason_action

    # 5. Negation & Polarity checking
    for term in substantive_terms:
        if term in cited_text.lower():
            neg_pattern = rf"(?i)\b(?:{'|'.join(NEGATION_TERMS)})\s+(?:\w+\s+){{0,3}}{term}\b|\b{term}\s+(?:\w+\s+){{0,3}}(?:{'|'.join(NEGATION_TERMS)})\b"
            term_negated_in_citation = bool(re.search(neg_pattern, cited_text))
            term_negated_in_clause = bool(re.search(neg_pattern, clause))
            if term_negated_in_citation != term_negated_in_clause:
                return False, f"Polarity/negation contradiction on term: '{term}'"

    # 6. Ownership attribution: team vs individual
    clause_claims_individual = bool(clause_words & INDIVIDUAL_TERMS) or bool(re.search(r"(?i)\b(solely|single-handedly|alone|personal|individually|independently)\b", clause))
    citation_claims_team = bool(set(re.findall(r"\b[a-zA-Z]{2,}\b", cited_text.lower())) & TEAM_TERMS)
    citation_has_individual = bool(set(re.findall(r"\b[a-zA-Z]{2,}\b", cited_text.lower())) & (INDIVIDUAL_TERMS - {'independently'}))
    if citation_claims_team and not citation_has_individual and clause_claims_individual:
        return False, "Unsupported individual ownership attribution (evidence describes team/collective scope)"

    # 7. Content relevance & grounding check with technical synonyms
    unsupported_terms = set()
    for term in substantive_terms:
        if term in cited_words:
            continue
        synonym_found = False
        for sset in SYNONYM_SETS:
            if term in sset and (sset & cited_words):
                synonym_found = True
                break
        if not synonym_found:
            unsupported_terms.add(term)

    if substantive_terms and not (substantive_terms & cited_words) and unsupported_terms == substantive_terms:
        return False, "Clause lacks substantive ground in cited evidence"
    if unsupported_terms:
        return False, f"Ungrounded terms in clause: {unsupported_terms}"

    return True, "Supported"


def verify_sentence_support(sentence: str, cited_text: str, cited_words: set, cited_numbers: set, cited_entities: set | None = None) -> tuple[bool, str]:
    if cited_entities is None:
        cited_entities = extract_entities(cited_text)
    clauses = split_into_clauses(sentence)
    for c in clauses:
        is_ok, reason = verify_clause_support(c, cited_text, cited_words, cited_numbers, cited_entities)
        if not is_ok:
            return False, reason
    return True, "Supported"


def build_qa_flow(retrieve, generate=None):
    def evidence(state):
        result = retrieve(state['question'])
        if sum(len(p['text']) for p in result['passages']) > 32000:
            raise Fault(413, 'QA_CONTEXT_BUDGET_EXCEEDED')
        return {'evidence': result}

    def answer(state):
        if not state['evidence']['passages']:
            return {'output': {'answer': 'Insufficient source evidence.', 'status': 'INSUFFICIENT_EVIDENCE', 'citations': [], 'has_validation_errors': False}}
        if generate is None:
            raise Fault(503, 'LIVE_GENERATION_UNAVAILABLE')
        # Provider owns network timeout and token budget; this graph does not retry it.
        return {'output': generate(state['question'], state['evidence']['passages'])}

    def validate(state):
        raw = state['output']
        passages = state['evidence']['passages']
        allowed = {p['span_id']: p for p in passages}

        invalid = not isinstance(raw, dict) or (isinstance(raw, dict) and 'citations' not in raw)
        citations = raw.get('citations', []) if isinstance(raw, dict) else []
        invalid |= not isinstance(citations, list)

        if not invalid:
            for c in citations:
                p = allowed.get(c.get('span_id')) if isinstance(c, dict) else None
                quote = c.get('quote') if isinstance(c, dict) else None
                if (not p or not isinstance(quote, str) or not quote.strip() or quote not in p['text']
                    or c.get('source_id') != p['source_id'] or c.get('version_id') != p['version_id']):
                    invalid = True

        if not isinstance(raw, dict) or not isinstance(raw.get('answer'), str) or not raw.get('answer', '').strip():
            invalid = True

        if isinstance(raw, dict) and (raw.get('status') not in ('GROUNDED', 'AMBIGUOUS', 'DISAGREEMENT', 'INSUFFICIENT_EVIDENCE')
                                     or raw.get('has_validation_errors', False) is not False):
            invalid = True

        if not citations and isinstance(raw, dict) and raw.get('status') != 'INSUFFICIENT_EVIDENCE':
            invalid = True

        if not citations and isinstance(raw, dict) and raw.get('status') == 'INSUFFICIENT_EVIDENCE':
            raw = {'answer': 'Insufficient source evidence.', 'status': 'INSUFFICIENT_EVIDENCE', 'citations': []}

        if invalid:
            raw = {'answer': 'Evidence validation failed; request human review.', 'status': 'INSUFFICIENT_EVIDENCE', 'citations': []}

        claims_representation = []
        unsupported_reasons = []

        # ── Claim-to-Evidence Support Check Across All Statuses (Including DISAGREEMENT) ──
        if raw.get('status') in ('GROUNDED', 'AMBIGUOUS', 'DISAGREEMENT'):
            cited_text = " ".join(c.get('quote', '') for c in citations if isinstance(c, dict))
            all_known_entities = set()
            for c in citations:
                if isinstance(c, dict):
                    all_known_entities.update(extract_entities(c.get('quote', '')))

            # Prompt injection check in citations and answer
            if PROMPT_INJECTION_PATTERN.search(cited_text) or PROMPT_INJECTION_PATTERN.search(raw.get('answer', '')):
                raw = {'answer': 'Evidence validation failed; prompt injection instruction detected in source.', 'status': 'INSUFFICIENT_EVIDENCE', 'citations': []}
                unsupported_reasons.append('Prompt injection instruction detected.')
                claims_representation.append({
                    'claim_id': 'claim_1',
                    'text': 'Prompt injection detected in context.',
                    'supporting_span_id': None,
                    'validation_outcome': 'UNSUPPORTED',
                    'validation_reason': 'Prompt injection instruction detected.',
                })
            else:
                sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw['answer']) if s.strip()]
                supported_sentences = []

                for s_idx, s in enumerate(sentences):
                    clauses = split_into_clauses(s)
                    supported_clauses = []
                    for c_idx, clause in enumerate(clauses):
                        # Evaluate clause against each citation to find exact supporting span
                        matched_span = None
                        clause_supported = False
                        clause_reason = "No matching citation found"

                        for c in citations:
                            if not isinstance(c, dict):
                                continue
                            c_quote = c.get('quote', '')
                            c_words = set(re.findall(r"\b[a-zA-Z]{3,}\b", c_quote.lower()))
                            c_numbers = extract_numbers(c_quote)
                            c_entities = extract_entities(c_quote) | {e for e in all_known_entities if re.search(rf"\b{re.escape(e)}\b", c_quote, re.IGNORECASE)}

                            ok, reason = verify_clause_support(clause, c_quote, c_words, c_numbers, c_entities, all_known_entities)
                            if ok:
                                clause_supported = True
                                matched_span = c.get('span_id')
                                clause_reason = "Supported"
                                break
                            else:
                                clause_reason = reason

                        claims_representation.append({
                            'claim_id': f'claim_{s_idx + 1}_{c_idx + 1}',
                            'text': clause,
                            'supporting_span_id': matched_span,
                            'validation_outcome': 'SUPPORTED' if clause_supported else 'UNSUPPORTED',
                            'validation_reason': clause_reason,
                        })

                        if clause_supported:
                            supported_clauses.append(clause)
                        else:
                            unsupported_reasons.append(clause_reason)

                    if supported_clauses:
                        supported_sentences.append(", ".join(supported_clauses))

                if unsupported_reasons:
                    if not supported_sentences:
                        # Zero claims supported: abstain and withhold answer
                        raw = {'answer': 'Insufficient source evidence; claims unsupported by citation.', 'status': 'INSUFFICIENT_EVIDENCE', 'citations': []}
                    else:
                        # Partial support: remove unsupported text and downgrade status from GROUNDED
                        cleaned_answer = " ".join(supported_sentences)
                        target_status = 'DISAGREEMENT' if raw.get('status') == 'DISAGREEMENT' else 'AMBIGUOUS'
                        raw = {
                            'answer': cleaned_answer,
                            'status': target_status,
                            'citations': citations,
                        }

        has_errors = bool(invalid or unsupported_reasons or (raw.get('status') == 'GROUNDED' and not citations))

        # Return contracted fields with literal boolean has_validation_errors
        return {'output': {
            'answer': raw.get('answer', 'Insufficient source evidence.'),
            'status': raw.get('status', 'INSUFFICIENT_EVIDENCE'),
            'citations': raw.get('citations', []),
            'has_validation_errors': has_errors,
            'claims': claims_representation,
            'disclaimer': 'SOURCE MATERIAL / NOT EMPLOYER-APPROVED; citations do not establish competence',
            'validation_scope': 'citation identity, exact quotation, and claim-support consistency; semantic entailment requires separate evaluation'
        }}

    graph = StateGraph(QAState)
    graph.add_node('retrieve', evidence)
    graph.add_node('generate_or_abstain', answer)
    graph.add_node('validate', validate)
    graph.add_edge(START, 'retrieve')
    graph.add_edge('retrieve', 'generate_or_abstain')
    graph.add_edge('generate_or_abstain', 'validate')
    graph.add_edge('validate', END)
    return graph.compile()
