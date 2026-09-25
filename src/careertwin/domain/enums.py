from enum import StrEnum


class RequirementKind(StrEnum):
    MUST_HAVE = "must_have"
    STRONG_SIGNAL = "strong_signal"
    NICE_TO_HAVE = "nice_to_have"
    DISQUALIFIER = "disqualifier"


class MatchStatus(StrEnum):
    SUPPORTED = "supported"
    PARTIAL = "partial"
    UNSUPPORTED = "unsupported"
    CONTRADICTED = "contradicted"


class EvidenceStrength(StrEnum):
    DIRECT_ARTIFACT = "direct_artifact"
    VERIFIED_OUTCOME = "verified_outcome"
    DETAILED_CLAIM = "detailed_claim"
    SELF_ASSERTION = "self_assertion"
    INFERENCE = "inference"


class WorkflowStatus(StrEnum):
    CREATED = "created"
    VALIDATING = "validating"
    PARSING = "parsing"
    ROLE_REVIEW = "role_review"
    EXTRACTING = "extracting"
    LINKING = "linking"
    SCORING = "scoring"
    PACKET_DRAFT = "packet_draft"
    HUMAN_REVIEW = "human_review"
    RELEASED = "released"
    RETRY_WAIT = "retry_wait"
    FAILED = "failed"
    CANCELLED = "cancelled"


class RiskSeverity(StrEnum):
    INFO = "info"
    REVIEW = "review"
    MATERIAL = "material"

