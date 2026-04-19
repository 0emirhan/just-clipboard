import { detectSecret, listPatternNames } from '../lib/detect.js';
import { test, assertEq, assertTrue, summary } from './assert.js';

/*
 * Canonical-shape example strings built by concatenation so that GitHub's
 * secret-scanner doesn't flag the source file. The runtime regex test is
 * unaffected: the concatenated string matches the same pattern.
 */
const S = {
    awsAccess:   'AK' + 'IAIOSFODNN7EXAMPLE',
    jwt:         'eyJh' + 'bGciOiJIUzI1NiJ9.ey' + 'Jzd' + 'WIiOiIxMjM0NTY3ODkwIn0.signature123',
    ghPat:       'gh' + 'p_' + '1234567890abcdefghij1234567890abcdef',
    glPat:       'gl' + 'pat-' + 'abcdef1234567890ghijklmn',
    slackTok:    'xo' + 'xb-' + '123456789012-abcdef',
    stripeKey:   'sk' + '_live_' + 'abcdefghijklmnopqrstuv12',
    antKey:      'sk-' + 'ant-' + 'abc123xyz456def789ghi012',
    iban:        'FR76' + '30006000011234567890189',
    bech32:      'bc1' + 'qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    ethAddr:     '0x' + '742d35Cc6634C0532925a3b844Bc9e7595f0fA00',
};

print('=== detect.js ===');

test('detects AWS access key', () => assertEq(detectSecret(S.awsAccess), 'aws-access'));
test('detects JWT', () => assertEq(detectSecret(S.jwt), 'jwt'));
test('detects GitHub PAT', () => assertEq(detectSecret(S.ghPat), 'github-pat'));
test('detects GitLab PAT', () => assertEq(detectSecret(S.glPat), 'gitlab-pat'));
test('detects Slack token', () => assertEq(detectSecret(S.slackTok), 'slack'));
test('detects Stripe key', () => assertEq(detectSecret(S.stripeKey), 'stripe'));
test('detects private key header', () => assertEq(detectSecret('-----BEGIN RSA PRIVATE KEY-----'), 'private-key'));
test('detects generic api_key=...', () => assertEq(detectSecret('api_key="abc123def456ghi789jk"'), 'generic-key'));
test('detects Anthropic key', () => assertEq(detectSecret(S.antKey), 'anthropic'));
test('detects IBAN', () => assertEq(detectSecret(S.iban), 'iban'));
test('detects BTC bech32', () => assertEq(detectSecret(S.bech32), 'btc-address'));
test('detects ETH address', () => assertEq(detectSecret(S.ethAddr), 'eth-address'));
test('returns null for harmless text', () => assertEq(detectSecret('hello world how are you'), null));
test('returns null for empty input', () => assertEq(detectSecret(''), null));
test('exposes pattern name list', () => assertTrue(listPatternNames().length >= 10));

imports.system.exit(summary());
