/*
 * Clipboard abstraction: polls CLIPBOARD (and optionally PRIMARY).
 * Emits a change event when content shifts, carrying the full payload.
 *
 * On GNOME 48+, St.Clipboard.get_mimetypes is synchronous. get_text and
 * get_content remain async via callback.
 */

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

const POLL_MS = 1000;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

export const ClipboardMonitor = GObject.registerClass(
{
    Signals: {
        'changed': { param_types: [GObject.TYPE_JSOBJECT] },
    },
},
class ClipboardMonitor extends GObject.Object {
    _init({ settings }) {
        super._init();
        this._settings = settings;
        this._lastSig = { clipboard: null, primary: null };
        this._suppress = { clipboard: false, primary: false };
        this._sourceId = null;
    }

    start() {
        if (this._sourceId) return;
        this._sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POLL_MS, () => {
            this._tick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    stop() {
        if (this._sourceId) { GLib.source_remove(this._sourceId); this._sourceId = null; }
    }

    suppressNext(which = 'clipboard') {
        this._suppress[which] = true;
    }

    _tick() {
        if (this._settings.get_boolean('private-mode')) return;
        this._readOne(St.ClipboardType.CLIPBOARD, 'clipboard');
        if (this._settings.get_boolean('capture-primary'))
            this._readOne(St.ClipboardType.PRIMARY, 'primary');
    }

    _readOne(stType, key) {
        const clip = St.Clipboard.get_default();
        const rich = this._settings.get_boolean('rich-types');

        if (rich) {
            const mimes = clip.get_mimetypes(stType) ?? [];
            const imageMime = mimes.find(m => IMAGE_MIMES.includes(m));
            if (imageMime) { this._readImage(clip, stType, key, imageMime); return; }
            if (mimes.includes('text/uri-list')) { this._readUris(clip, stType, key); return; }
        }
        this._readText(clip, stType, key);
    }

    _readText(clip, stType, key) {
        clip.get_text(stType, (_, text) => {
            if (!text || !text.length) return;
            const sig = `t:${text.length}:${text.slice(0, 96)}`;
            if (this._dedupe(key, sig)) return;
            this.emit('changed', { source: key, kind: 'text', text });
        });
    }

    _readUris(clip, stType, key) {
        clip.get_content(stType, 'text/uri-list', (_, bytes) => {
            if (!bytes) return;
            const raw = bytes.get_data?.() ?? bytes;
            const text = new TextDecoder().decode(raw);
            const uris = text.split(/\r?\n/).filter(l => l && !l.startsWith('#'));
            if (!uris.length) return;
            const sig = `u:${uris.length}:${uris[0]}`;
            if (this._dedupe(key, sig)) return;
            this.emit('changed', { source: key, kind: 'uris', uris });
        });
    }

    _readImage(clip, stType, key, mime) {
        clip.get_content(stType, mime, (_, bytes) => {
            if (!bytes) return;
            const raw = bytes.get_data?.() ?? bytes;
            const sizeKB = Math.round(raw.length / 1024);
            const maxKB = this._settings.get_int('max-image-kb');
            if (sizeKB > maxKB) return;
            const sig = `i:${mime}:${raw.length}`;
            if (this._dedupe(key, sig)) return;
            this.emit('changed', { source: key, kind: 'image', mime, data: raw, sizeKB });
        });
    }

    _dedupe(key, sig) {
        if (sig === this._lastSig[key]) return true;
        if (this._suppress[key]) { this._suppress[key] = false; this._lastSig[key] = sig; return true; }
        this._lastSig[key] = sig;
        return false;
    }
});

export function setClipboardText(text, which = 'clipboard') {
    const stType = which === 'primary' ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD;
    St.Clipboard.get_default().set_text(stType, text);
}

export function setClipboardImage(mime, data) {
    const bytes = data instanceof GLib.Bytes ? data : new GLib.Bytes(data);
    St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, mime, bytes);
}

export function setClipboardUris(uris) {
    const text = uris.join('\n') + '\n';
    const bytes = new GLib.Bytes(new TextEncoder().encode(text));
    St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, 'text/uri-list', bytes);
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
}
