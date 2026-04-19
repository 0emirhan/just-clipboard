/*
 * Regex-based secret detection. Returns the first matching pattern name, or null.
 * Designed for fast first-pass filtering, not forensic analysis — false positives
 * are accepted for generic catch-all patterns.
 */

const PATTERNS = [
    { name: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/ },
    { name: 'jwt',         re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
    { name: 'aws-access',  re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
    { name: 'aws-secret',  re: /\baws(?:_|-)?(?:secret|sec)[^a-z0-9]{0,5}[A-Za-z0-9/+=]{40}\b/i },
    { name: 'github-pat',  re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
    { name: 'gitlab-pat',  re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'slack',       re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
    { name: 'stripe',      re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/ },
    { name: 'google-api',  re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
    { name: 'openai',      re: /\bsk-[A-Za-z0-9]{20,}\b/ },
    { name: 'anthropic',   re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
    { name: 'generic-key', re: /(?:api[_-]?key|token|secret|password|passwd|pwd|authorization)\s*[:=]\s*["']?[A-Za-z0-9._\-+/=]{16,}["']?/i },
    { name: 'iban',        re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/ },
    { name: 'ccard',       re: /\b(?:\d[ -]?){13,19}\b/ },
    { name: 'btc-address', re: /\b(?:bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}\b/ },
    { name: 'eth-address', re: /\b0x[a-fA-F0-9]{40}\b/ },
];

export function detectSecret(text) {
    if (!text || text.length < 8) return null;
    for (const p of PATTERNS) {
        if (p.re.test(text)) return p.name;
    }
    return null;
}

export function listPatternNames() {
    return PATTERNS.map(p => p.name);
}
