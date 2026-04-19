import { interpolate, parseSnippets, serializeSnippets } from '../lib/snippets.js';
import { test, assertEq, assertTrue, summary } from './assert.js';

print('=== snippets.js ===');

test('interpolate leaves unknown tokens', () => assertEq(interpolate('Hello {unknown}'), 'Hello {unknown}'));
test('interpolate clipboard token', () => assertEq(interpolate('>>{clipboard}<<', { clipboard: 'payload' }), '>>payload<<'));
test('interpolate stack token', () => assertEq(interpolate('[{stack}]', { stack: 'work' }), '[work]'));
test('interpolate date shape', () => assertTrue(/^\d{4}-\d{2}-\d{2}$/.test(interpolate('{date}'))));
test('interpolate time shape', () => assertTrue(/^\d{2}:\d{2}:\d{2}$/.test(interpolate('{time}'))));
test('interpolate newline token', () => assertEq(interpolate('a{n}b'), 'a\nb'));
test('parseSnippets handles empty', () => assertEq(parseSnippets('[]').length, 0));
test('parseSnippets ignores invalid JSON', () => assertEq(parseSnippets('not-json').length, 0));
test('parseSnippets filters malformed entries', () => assertEq(parseSnippets('[{"name":"n"}, {"name":"x","template":"y"}]').length, 1));
test('serializeSnippets roundtrip', () => {
    const s = [{ name: 'greet', template: 'hi {date}' }];
    assertEq(parseSnippets(serializeSnippets(s)).length, 1);
});

imports.system.exit(summary());
