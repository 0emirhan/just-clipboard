/*
 * Snippet interpolation.
 * Tokens: {date}, {time}, {datetime}, {clipboard}, {stack}, {n}
 */

import GLib from 'gi://GLib';

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

export function interpolate(template, ctx = {}) {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const vars = {
        date, time, datetime: `${date} ${time}`,
        clipboard: ctx.clipboard ?? '',
        stack: ctx.stack ?? '',
        n: '\n',
        uuid: GLib.uuid_string_random(),
    };
    return template.replace(/\{(\w+)\}/g, (m, k) => Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m);
}

export function parseSnippets(json) {
    try {
        const arr = JSON.parse(json);
        if (!Array.isArray(arr)) return [];
        return arr.filter(s => s && typeof s.name === 'string' && typeof s.template === 'string');
    } catch { return []; }
}

export function serializeSnippets(list) {
    return JSON.stringify(list);
}
