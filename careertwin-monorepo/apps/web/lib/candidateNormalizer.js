/**
 * Bounded Candidate Display Normalizer for CareerTWiN Shortlist
 * Safely parses string and object candidate payloads while preventing
 * raw JSON, serialized objects, emails, or internal payloads from rendering.
 */

export function normalizeCandidateDisplay(extraction) {
  if (!extraction || typeof extraction !== 'object') {
    return {
      name: 'Anonymous Candidate',
      current_role: null,
      summary: 'Summary not available',
      bio: null,
      skills: [],
    };
  }

  const profile = extraction.candidate_profiles || {};

  // 1. Normalize Name
  let name = extraction.candidate_name || profile.name || null;
  name = cleanStringField(name, 'Anonymous Candidate');

  // 2. Normalize Current Role
  let current_role = extraction.current_role || profile.current_role || profile.bio || null;
  current_role = cleanStringField(current_role, null);

  // 3. Normalize Summary / Bio
  let rawSummary = extraction.summary || profile.summary || profile.bio || extraction.raw_payload || null;
  let summary = parseSafeSummary(rawSummary);

  // 4. Normalize Location
  let location = extraction.location || profile.location || null;
  location = cleanStringField(location, null);

  // 5. Construct Subtitle Bio Line
  const bioParts = [current_role, location].filter(Boolean);
  const bio = bioParts.length > 0 ? bioParts.join(' · ') : null;

  // 6. Normalize Skills Array
  let rawSkills = extraction.skills || profile.skills || [];
  let skills = parseSafeSkills(rawSkills);

  return {
    name,
    current_role,
    summary,
    location,
    bio,
    skills,
  };
}

function cleanStringField(val, fallback) {
  if (val == null) return fallback;

  if (typeof val === 'object') {
    if (val.name && typeof val.name === 'string') return val.name.trim();
    if (val.title && typeof val.title === 'string') return val.title.trim();
    return fallback;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;

    // Check if string is serialized JSON object/array
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return cleanStringField(parsed, fallback);
      } catch {
        return fallback;
      }
    }

    if (trimmed === '[object Object]') return fallback;
    return stripEmails(trimmed);
  }

  return String(val);
}

function parseSafeSummary(val) {
  if (val == null) return 'Summary not available';

  if (typeof val === 'object') {
    if (val.summary && typeof val.summary === 'string') return stripEmails(val.summary.trim());
    if (val.bio && typeof val.bio === 'string') return stripEmails(val.bio.trim());
    if (val.description && typeof val.description === 'string') return stripEmails(val.description.trim());
    return 'Summary not available';
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return 'Summary not available';

    if (trimmed === '[object Object]') return 'Summary not available';

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseSafeSummary(parsed);
      } catch {
        return 'Summary not available';
      }
    }

    return stripEmails(trimmed);
  }

  return 'Summary not available';
}

function parseSafeSkills(val) {
  if (!val) return [];

  let items = val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('[')) {
      try {
        items = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      items = trimmed.split(',').map((s) => s.trim());
    }
  }

  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object' && item.name) return String(item.name).trim();
      return null;
    })
    .filter(Boolean)
    .filter((s) => !s.startsWith('{') && s !== '[object Object]');
}

function stripEmails(str) {
  if (typeof str !== 'string') return str;
  // Mask explicit email addresses
  return str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL REDACTED]');
}
