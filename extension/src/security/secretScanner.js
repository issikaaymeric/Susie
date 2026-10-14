/**
 * Pattern-based secret detection. Regex covers common formats; entropy check
 * catches high-randomness strings (raw keys, tokens) that don't match a
 * known vendor prefix. This runs client-side, before any network call —
 * the backend never sees unredacted matches.
 */
const SECRET_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'AWS Secret Key', regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
  { name: 'Generic API Key', regex: /(?:api[_-]?key|apikey)["']?\s*[:=]\s*["']([A-Za-z0-9\-_]{16,})["']/gi },
  { name: 'Private Key Block', regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { name: 'JWT', regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { name: 'Connection String', regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+:[^\s"']+@[^\s"']+/gi },
];

const SHANNON_ENTROPY_THRESHOLD = 4.0;
const MIN_TOKEN_LENGTH = 20;

/**
 * @param {string} str
 * @returns {number}
 */
function shannonEntropy(str) {
  const freq = new Map();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Scans arbitrary code text and redacts matches in place.
 * Returns both the redacted text and a summary for telemetry/logging
 * (counts only — never the matched value itself).
 *
 * @param {string} code
 * @returns {{ redactedCode: string, findings: { name: string, count: number }[], hasSecrets: boolean }}
 */
function scanAndRedact(code) {
  let redactedCode = code;
  const findings = [];

  for (const { name, regex } of SECRET_PATTERNS) {
    const matches = redactedCode.match(regex);
    if (matches && matches.length > 0) {
      findings.push({ name, count: matches.length });
      redactedCode = redactedCode.replace(regex, '[REDACTED_SECRET]');
    }
  }

  // Entropy pass catches unlabeled high-randomness tokens the regexes miss
  // (e.g., a bare key assigned without an "api_key=" prefix).
  const tokenCandidates = redactedCode.match(/[A-Za-z0-9+/_-]{20,}/g) || [];
  let entropyHits = 0;
  for (const token of tokenCandidates) {
    if (token.length >= MIN_TOKEN_LENGTH && shannonEntropy(token) >= SHANNON_ENTROPY_THRESHOLD) {
      redactedCode = redactedCode.replace(token, '[REDACTED_HIGH_ENTROPY]');
      entropyHits += 1;
    }
  }
  if (entropyHits > 0) {
    findings.push({ name: 'High-entropy token', count: entropyHits });
  }

  return {
    redactedCode,
    findings,
    hasSecrets: findings.length > 0,
  };
}

module.exports = { scanAndRedact, SECRET_PATTERNS };
