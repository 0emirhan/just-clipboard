/*
 * Ephemeral in-memory store.
 *
 * No persistence of any kind. All entries live in a Map<id, {kind, content, ...}>.
 * Cleared on enable(), disable(), GNOME Shell restart, screensaver lock (optional), reboot.
 * The only thing GSettings holds is the lightweight metadata view (no content).
 */

import GLib from 'gi://GLib';

const PREVIEW_LEN = 60;

export class EphemeralStore {
    constructor() {
        this._map = new Map();
        this._stacks = new Map([['default', []]]);
        this._activeStack = 'default';
    }

    setActiveStack(name) {
        if (!this._stacks.has(name)) this._stacks.set(name, []);
        this._activeStack = name;
    }

    getActiveStack() { return this._activeStack; }
    listStacks() { return [...this._stacks.keys()]; }

    createStack(name) {
        if (!this._stacks.has(name)) this._stacks.set(name, []);
    }

    deleteStack(name) {
        if (name === 'default') return false;
        const ids = this._stacks.get(name) ?? [];
        for (const id of ids) this._map.delete(id);
        this._stacks.delete(name);
        if (this._activeStack === name) this._activeStack = 'default';
        return true;
    }

    renameStack(oldName, newName) {
        if (oldName === 'default' || !this._stacks.has(oldName) || this._stacks.has(newName))
            return false;
        this._stacks.set(newName, this._stacks.get(oldName));
        this._stacks.delete(oldName);
        if (this._activeStack === oldName) this._activeStack = newName;
        return true;
    }

    _ids(stack = this._activeStack) {
        if (!this._stacks.has(stack)) this._stacks.set(stack, []);
        return this._stacks.get(stack);
    }

    add(entry, stack = this._activeStack) {
        const id = GLib.uuid_string_random();
        const now = Date.now();
        const stored = { id, timestamp: now, pinned: false, ...entry };
        this._map.set(id, stored);
        this._ids(stack).unshift(id);
        return stored;
    }

    get(id) { return this._map.get(id); }

    update(id, patch) {
        const e = this._map.get(id);
        if (!e) return null;
        Object.assign(e, patch);
        return e;
    }

    remove(id) {
        if (!this._map.has(id)) return false;
        this._map.delete(id);
        for (const list of this._stacks.values()) {
            const i = list.indexOf(id);
            if (i >= 0) list.splice(i, 1);
        }
        return true;
    }

    list(stack = this._activeStack) {
        return this._ids(stack).map(id => this._map.get(id)).filter(Boolean);
    }

    findDuplicate(kind, lookupKey, stack = this._activeStack) {
        for (const id of this._ids(stack)) {
            const e = this._map.get(id);
            if (!e) continue;
            if (e.kind === kind && e._dedup === lookupKey) return e;
        }
        return null;
    }

    touch(id) {
        const e = this._map.get(id);
        if (!e) return;
        e.timestamp = Date.now();
        const list = this._ids();
        const i = list.indexOf(id);
        if (i > 0) { list.splice(i, 1); list.unshift(id); }
    }

    prune(max, stack = this._activeStack) {
        const ids = this._ids(stack);
        const entries = ids.map(id => this._map.get(id));
        const pinned = [];
        const unpinned = [];
        for (const e of entries) (e.pinned ? pinned : unpinned).push(e);
        const budget = Math.max(0, max - pinned.length);
        const kept = unpinned.slice(0, budget);
        const dropped = unpinned.slice(budget);
        for (const e of dropped) this._map.delete(e.id);
        this._stacks.set(stack, [...pinned.map(e => e.id), ...kept.map(e => e.id)]);
    }

    sortPinnedFirst(stack = this._activeStack) {
        const ids = this._ids(stack);
        const entries = ids.map(id => this._map.get(id)).filter(Boolean);
        entries.sort((a, b) => (b.pinned - a.pinned) || (b.timestamp - a.timestamp));
        this._stacks.set(stack, entries.map(e => e.id));
    }

    clearAll({ keepPinned = false } = {}) {
        for (const [stack, ids] of this._stacks) {
            const kept = [];
            for (const id of ids) {
                const e = this._map.get(id);
                if (keepPinned && e?.pinned) { kept.push(id); continue; }
                this._map.delete(id);
            }
            this._stacks.set(stack, kept);
        }
    }

    dropSecrets() {
        for (const [id, e] of this._map) {
            if (e.sensitive && !e.pinned) this.remove(id);
        }
    }

    // Lightweight index (for UI), returns data safe to display / filter.
    describe(e) {
        return {
            id: e.id,
            kind: e.kind,
            preview: e.preview ?? '',
            length: e.length ?? (e.content?.length ?? 0),
            timestamp: e.timestamp,
            pinned: e.pinned,
            sensitive: e.sensitive ?? null,
            mime: e.mime ?? null,
            count: e.count ?? null,
        };
    }

    static PREVIEW_LEN = PREVIEW_LEN;
}
