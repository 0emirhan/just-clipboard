import {
    b64Encode, b64Decode, urlEncode, urlDecode, jsonFormat, jsonMinify,
    trim, trimLines, toUpper, toLower, swapCase, reverse,
    md5, sha1, sha256, sha512, refang, defang, countInfo, TRANSFORMS,
} from '../lib/transforms.js';
import { test, assertEq, assertTrue, summary } from './assert.js';

print('=== transforms.js ===');

test('base64 roundtrip', () => assertEq(b64Decode(b64Encode('Hello, world!')), 'Hello, world!'));
test('base64 encode known value', () => assertEq(b64Encode('abc'), 'YWJj'));
test('URL encode', () => assertEq(urlEncode('a b/c?d=1'), 'a%20b%2Fc%3Fd%3D1'));
test('URL decode', () => assertEq(urlDecode('a%20b%2Fc'), 'a b/c'));
test('JSON format', () => assertEq(jsonFormat('{"a":1,"b":[2,3]}'), '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}'));
test('JSON minify', () => assertEq(jsonMinify('{\n  "a": 1\n}'), '{"a":1}'));
test('trim', () => assertEq(trim('  hello  '), 'hello'));
test('trim lines', () => assertEq(trimLines('a  \nb  '), 'a\nb'));
test('upper', () => assertEq(toUpper('HeLLo'), 'HELLO'));
test('lower', () => assertEq(toLower('HeLLo'), 'hello'));
test('swap case', () => assertEq(swapCase('HeLLo'), 'hEllO'));
test('reverse', () => assertEq(reverse('abc'), 'cba'));
test('md5', () => assertEq(md5(''), 'd41d8cd98f00b204e9800998ecf8427e'));
test('sha1', () => assertEq(sha1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709'));
test('sha256', () => assertEq(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'));
test('sha512 produces 128 hex chars', () => assertEq(sha512('').length, 128));
test('refang reverts defanged URL', () => assertEq(refang('hxxps://evil[.]com/a[.]b'), 'https://evil.com/a.b'));
test('countInfo smoke', () => assertTrue(countInfo('hello world').includes('11 chars')));
test('TRANSFORMS registry is non-empty', () => assertTrue(TRANSFORMS.length >= 15));

imports.system.exit(summary());
