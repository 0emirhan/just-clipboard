/*
 * Pure text transformations. Each function returns a string or throws.
 * Used by the row context menu (right-click).
 */

import GLib from 'gi://GLib';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64Encode(s) {
    return GLib.base64_encode(enc.encode(s));
}

export function b64Decode(s) {
    const bytes = GLib.base64_decode(s.trim());
    return dec.decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export function urlEncode(s) { return encodeURIComponent(s); }
export function urlDecode(s) { return decodeURIComponent(s); }

export function jsonFormat(s) {
    return JSON.stringify(JSON.parse(s), null, 2);
}
export function jsonMinify(s) {
    return JSON.stringify(JSON.parse(s));
}

export function trim(s) { return s.trim(); }
export function trimLines(s) { return s.split(/\r?\n/).map(l => l.trimEnd()).join('\n'); }

export function toUpper(s) { return s.toUpperCase(); }
export function toLower(s) { return s.toLowerCase(); }
export function swapCase(s) {
    return s.replace(/[A-Za-z]/g, c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());
}

export function reverse(s) { return [...s].reverse().join(''); }

export function md5(s)    { return GLib.compute_checksum_for_string(GLib.ChecksumType.MD5,    s, -1); }
export function sha1(s)   { return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA1,   s, -1); }
export function sha256(s) { return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, s, -1); }
export function sha512(s) { return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA512, s, -1); }

export function defang(s) {
    return s
        .replace(/\bhttps?:\/\//gi, m => m.replace('://', 'xx://').replace(/https?/, w => w[0] === 'H' ? 'hXXps' : 'hxxp').replace('xx','').replace(/hxxp(s)?/i, m2 => m2))
        .replace(/\./g, '[.]')
        .replace(/@/g, '[@]');
}
export function refang(s) {
    return s
        .replace(/hxxps?/gi, m => m.toLowerCase().replace('hxxp', 'http'))
        .replace(/\[\.\]/g, '.')
        .replace(/\[@\]/g, '@');
}

export function countInfo(s) {
    const lines = s.split(/\r?\n/).length;
    const words = s.trim() ? s.trim().split(/\s+/).length : 0;
    return `${s.length} chars · ${words} words · ${lines} lines`;
}

export const TRANSFORMS = [
    { id: 'b64-encode', label: 'Base64 encode',      fn: b64Encode },
    { id: 'b64-decode', label: 'Base64 decode',      fn: b64Decode },
    { id: 'url-encode', label: 'URL encode',         fn: urlEncode },
    { id: 'url-decode', label: 'URL decode',         fn: urlDecode },
    { id: 'json-fmt',   label: 'JSON format',        fn: jsonFormat },
    { id: 'json-min',   label: 'JSON minify',        fn: jsonMinify },
    { id: 'trim',       label: 'Trim whitespace',    fn: trim },
    { id: 'trim-lines', label: 'Trim each line',     fn: trimLines },
    { id: 'upper',      label: 'UPPERCASE',          fn: toUpper },
    { id: 'lower',      label: 'lowercase',          fn: toLower },
    { id: 'swap-case',  label: 'Swap case',          fn: swapCase },
    { id: 'reverse',    label: 'Reverse',            fn: reverse },
    { id: 'md5',        label: 'MD5',                fn: md5 },
    { id: 'sha1',       label: 'SHA-1',              fn: sha1 },
    { id: 'sha256',     label: 'SHA-256',            fn: sha256 },
    { id: 'sha512',     label: 'SHA-512',            fn: sha512 },
    { id: 'defang',     label: 'Defang (IOC)',       fn: defang },
    { id: 'refang',     label: 'Refang (IOC)',       fn: refang },
];
