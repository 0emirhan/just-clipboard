/*
 * Just Clipboard — ephemeral in-memory clipboard history for GNOME Shell.
 *
 * Nothing is persisted. Entries live in a Map until the next enable/disable,
 * shell restart, or (optionally) the next screensaver lock.
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GdkPixbuf from 'gi://GdkPixbuf';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { EphemeralStore } from './lib/store.js';
import { detectSecret } from './lib/detect.js';
import { ClipboardMonitor, setClipboardText, setClipboardImage, setClipboardUris } from './lib/clipboard.js';
import { TRANSFORMS } from './lib/transforms.js';
import { interpolate, parseSnippets } from './lib/snippets.js';

const EXPIRE_INTERVAL_MS = 15000;
const MAX_QUICK_SHORTCUTS = 9;
const SCREENSAVER_BUS = 'org.gnome.ScreenSaver';
const SCREENSAVER_PATH = '/org/gnome/ScreenSaver';

const ScreenSaverProxy = Gio.DBusProxy.makeProxyWrapper(`
<node>
  <interface name="org.gnome.ScreenSaver">
    <signal name="ActiveChanged"><arg type="b" name="active"/></signal>
  </interface>
</node>
`);

const ClipboardIndicator = GObject.registerClass(
class ClipboardIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'Just Clipboard');
        this._ext = extension;
        this._settings = extension.getSettings();
        this._store = new EphemeralStore();

        // Top bar button: icon + count badge
        const box = new St.BoxLayout({ style_class: 'cc-indicator' });
        this._icon = new St.Icon({ icon_name: 'edit-paste-symbolic', style_class: 'system-status-icon' });
        box.add_child(this._icon);
        this._badge = new St.Label({ text: '', y_align: Clutter.ActorAlign.CENTER, style_class: 'cc-badge' });
        this._badge.visible = false;
        box.add_child(this._badge);
        this.add_child(box);

        // Search row
        const searchItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        this._searchEntry = new St.Entry({
            hint_text: 'Search…', can_focus: true, x_expand: true, style_class: 'cc-search',
        });
        this._searchEntry.clutter_text.connect('text-changed', () => this._rebuildList());
        searchItem.add_child(this._searchEntry);
        this.menu.addMenuItem(searchItem);

        // Stack switcher row
        this._stackRow = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        this._stackBox = new St.BoxLayout({ style_class: 'cc-stacks' });
        this._stackRow.add_child(this._stackBox);
        this.menu.addMenuItem(this._stackRow);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Scrollable entry list
        this._listScroll = new St.ScrollView({
            style_class: 'cc-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            x_expand: true, y_expand: true,
        });
        this._listScroll.style = 'max-height: 460px; min-width: 420px;';
        this._listBox = new St.BoxLayout({ vertical: true });
        this._listScroll.set_child(this._listBox);
        const scrollItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        scrollItem.add_child(this._listScroll);
        this.menu.addMenuItem(scrollItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Snippets submenu
        this._snippetsMenu = new PopupMenu.PopupSubMenuMenuItem('Snippets');
        this.menu.addMenuItem(this._snippetsMenu);

        // Private mode toggle
        this._privateSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Private mode (pause capture)',
            this._settings.get_boolean('private-mode')
        );
        this._privateSwitch.connect('toggled', (_, s) => this._settings.set_boolean('private-mode', s));
        this.menu.addMenuItem(this._privateSwitch);

        // Clear all
        const clearItem = new PopupMenu.PopupMenuItem('Clear history');
        clearItem.connect('activate', () => { this._store.clearAll({ keepPinned: true }); this._syncUI(); });
        this.menu.addMenuItem(clearItem);

        // Monitor
        this._monitor = new ClipboardMonitor({ settings: this._settings });
        this._monitor.connect('changed', (_, payload) => this._onClipboardChange(payload));

        // Timers & signals
        this._expireId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, EXPIRE_INTERVAL_MS, () => {
            this._runExpiration(); return GLib.SOURCE_CONTINUE;
        });
        this._settingsHandlers = [
            this._settings.connect('changed::private-mode', () => this._privateSwitch.setToggleState(this._settings.get_boolean('private-mode'))),
            this._settings.connect('changed::snippets', () => this._rebuildSnippets()),
            this._settings.connect('changed::active-stack', () => this._syncUI()),
        ];

        this.menu.connect('open-state-changed', (_, open) => {
            if (open) { this._searchEntry.set_text(''); this._syncUI(); global.stage.set_key_focus(this._searchEntry); }
        });

        // Screensaver hook
        this._setupScreensaver();

        this._rebuildStacks();
        this._rebuildSnippets();
        this._monitor.start();
    }

    _setupScreensaver() {
        try {
            this._ssProxy = new ScreenSaverProxy(Gio.DBus.session, SCREENSAVER_BUS, SCREENSAVER_PATH);
            this._ssHandler = this._ssProxy.connectSignal('ActiveChanged', (_, __, [active]) => {
                if (active && this._settings.get_boolean('screensaver-clear')) {
                    this._store.clearAll({ keepPinned: true });
                    this._syncUI();
                }
            });
        } catch (e) { /* optional */ }
    }

    // ---------- Capture ----------

    _isBlacklisted() {
        const bl = this._settings.get_strv('app-blacklist').map(s => s.toLowerCase());
        const w = global.display.focus_window;
        if (!w) return false;
        const wm = (w.get_wm_class?.() ?? '').toLowerCase();
        const inst = (w.get_wm_class_instance?.() ?? '').toLowerCase();
        const gtkId = (w.get_gtk_application_id?.() ?? '').toLowerCase();
        const sandboxed = (w.get_sandboxed_app_id?.() ?? '').toLowerCase();
        return bl.some(b => b && (b === wm || b === inst || b === gtkId || b === sandboxed));
    }

    _onClipboardChange(payload) {
        if (this._isBlacklisted()) return;
        if (payload.kind === 'text')  this._captureText(payload.text);
        if (payload.kind === 'uris')  this._captureUris(payload.uris);
        if (payload.kind === 'image') this._captureImage(payload.mime, payload.data, payload.sizeKB);
    }

    _captureText(text) {
        const dedup = `t:${text.length}:${text.slice(0, 96)}`;
        const dup = this._store.findDuplicate('text', dedup);
        if (dup) { this._store.touch(dup.id); this._syncUI(); return; }

        const sensitive = this._settings.get_boolean('detect-secrets') ? detectSecret(text) : null;
        this._store.add({
            kind: 'text',
            content: text,
            preview: text.slice(0, EphemeralStore.PREVIEW_LEN),
            length: text.length,
            sensitive,
            _dedup: dedup,
        });
        this._store.prune(this._settings.get_int('max-entries'));
        this._syncUI();
    }

    _captureUris(uris) {
        const dedup = `u:${uris.length}:${uris[0]}`;
        const dup = this._store.findDuplicate('uris', dedup);
        if (dup) { this._store.touch(dup.id); this._syncUI(); return; }

        const preview = uris.length === 1
            ? decodeURIComponent(uris[0].replace(/^file:\/\//, ''))
            : `${uris.length} files: ${uris.slice(0, 3).map(u => decodeURIComponent(u.split('/').pop())).join(', ')}`;
        this._store.add({
            kind: 'uris',
            content: uris,
            preview: preview.slice(0, EphemeralStore.PREVIEW_LEN),
            count: uris.length,
            length: uris.join('\n').length,
            sensitive: null,
            _dedup: dedup,
        });
        this._store.prune(this._settings.get_int('max-entries'));
        this._syncUI();
    }

    _captureImage(mime, data, sizeKB) {
        const dedup = `i:${mime}:${data.length}`;
        const dup = this._store.findDuplicate('image', dedup);
        if (dup) { this._store.touch(dup.id); this._syncUI(); return; }

        let dims = '';
        try {
            const loader = GdkPixbuf.PixbufLoader.new();
            loader.write(data);
            loader.close();
            const pix = loader.get_pixbuf();
            if (pix) dims = `${pix.get_width()}×${pix.get_height()}`;
        } catch {}

        this._store.add({
            kind: 'image',
            content: data,
            mime,
            preview: `🖼  ${mime.split('/')[1].toUpperCase()}  ${dims}  ·  ${sizeKB} KB`,
            length: data.length,
            sensitive: null,
            _dedup: dedup,
        });
        this._store.prune(this._settings.get_int('max-entries'));
        this._syncUI();
    }

    // ---------- Expiration ----------

    _runExpiration() {
        const now = Date.now();
        const normalMs = this._settings.get_boolean('auto-expire-enabled')
            ? this._settings.get_int('auto-expire-minutes') * 60_000 : null;
        const sensSec = this._settings.get_int('sensitive-expire-seconds');
        const sensMs = sensSec > 0 ? sensSec * 1000 : null;

        let changed = false;
        for (const e of [...this._store.list()]) {
            if (e.pinned) continue;
            const age = now - e.timestamp;
            if (e.sensitive && sensMs !== null && age >= sensMs) { this._store.remove(e.id); changed = true; continue; }
            if (!e.sensitive && normalMs !== null && age >= normalMs) { this._store.remove(e.id); changed = true; }
        }
        if (changed) this._syncUI();
    }

    // ---------- UI ----------

    _syncUI() {
        this._rebuildList();
        this._rebuildStacks();
        this._updateBadge();
    }

    _updateBadge() {
        const n = this._store.list().length;
        this._badge.text = n > 0 ? ` ${n}` : '';
        this._badge.visible = n > 0;
        this._icon.opacity = this._settings.get_boolean('private-mode') ? 120 : 255;
    }

    _rebuildStacks() {
        this._stackBox.destroy_all_children();
        const stacks = this._store.listStacks();
        const active = this._store.getActiveStack();
        for (const s of stacks) {
            const btn = new St.Button({
                label: s,
                style_class: s === active ? 'cc-stack cc-stack-active' : 'cc-stack',
            });
            btn.connect('clicked', () => { this._store.setActiveStack(s); this._settings.set_string('active-stack', s); this._syncUI(); });
            this._stackBox.add_child(btn);
        }
        const add = new St.Button({ label: '+', style_class: 'cc-stack cc-stack-add' });
        add.connect('clicked', () => this._promptNewStack());
        this._stackBox.add_child(add);
    }

    _promptNewStack() {
        let i = 2;
        let name;
        do { name = `stack-${i++}`; } while (this._store.listStacks().includes(name));
        this._store.createStack(name);
        this._store.setActiveStack(name);
        this._settings.set_string('active-stack', name);
        this._syncUI();
    }

    _rebuildSnippets() {
        this._snippetsMenu.menu.removeAll();
        const snippets = parseSnippets(this._settings.get_string('snippets'));
        if (!snippets.length) {
            const empty = new PopupMenu.PopupMenuItem('No snippets — edit in Preferences');
            empty.setSensitive(false);
            this._snippetsMenu.menu.addMenuItem(empty);
            return;
        }
        for (const s of snippets) {
            const item = new PopupMenu.PopupMenuItem(s.name);
            item.connect('activate', () => this._pasteSnippet(s));
            this._snippetsMenu.menu.addMenuItem(item);
        }
    }

    _pasteSnippet(s) {
        const last = this._store.list()[0];
        const ctx = { clipboard: last?.kind === 'text' ? last.content : '', stack: this._store.getActiveStack() };
        const text = interpolate(s.template, ctx);
        this._monitor.suppressNext('clipboard');
        setClipboardText(text);
        this.menu.close();
    }

    _rebuildList() {
        this._listBox.destroy_all_children();
        const q = this._searchEntry.get_text().toLowerCase();
        const entries = this._store.list();
        const filtered = q ? entries.filter(e => e.preview.toLowerCase().includes(q) || (e.kind === 'text' && e.content.toLowerCase().includes(q))) : entries;

        if (!filtered.length) {
            this._listBox.add_child(new St.Label({ text: '  (empty)', style_class: 'cc-empty' }));
            return;
        }

        const groups = this._groupByDate(filtered);
        for (const [label, items] of groups) {
            const header = new St.Label({ text: label, style_class: 'cc-group-header' });
            this._listBox.add_child(header);
            let idx = 0;
            for (const entry of items) {
                const rank = entries.indexOf(entry);
                this._listBox.add_child(this._buildRow(entry, rank));
                idx++;
            }
        }
    }

    _groupByDate(entries) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterday = today - 86_400_000;
        const weekAgo = today - 7 * 86_400_000;
        const groups = new Map([['Pinned', []], ['Today', []], ['Yesterday', []], ['This week', []], ['Older', []]]);
        for (const e of entries) {
            if (e.pinned) groups.get('Pinned').push(e);
            else if (e.timestamp >= today) groups.get('Today').push(e);
            else if (e.timestamp >= yesterday) groups.get('Yesterday').push(e);
            else if (e.timestamp >= weekAgo) groups.get('This week').push(e);
            else groups.get('Older').push(e);
        }
        return [...groups].filter(([, arr]) => arr.length);
    }

    _buildRow(entry, rank) {
        const row = new St.BoxLayout({ style_class: 'cc-row', x_expand: true });

        // Pin toggle
        const pinIcon = new St.Icon({
            icon_name: entry.pinned ? 'starred-symbolic' : 'non-starred-symbolic',
            icon_size: 14, style_class: 'cc-pin',
        });
        const pinBtn = new St.Button({ child: pinIcon, style_class: 'cc-btn' });
        pinBtn.connect('clicked', () => {
            this._store.update(entry.id, { pinned: !entry.pinned });
            this._store.sortPinnedFirst();
            this._syncUI();
        });
        row.add_child(pinBtn);

        // Rank badge (for Super+1..9)
        if (rank < MAX_QUICK_SHORTCUTS && this._settings.get_boolean('quick-paste-shortcuts')) {
            const rankLabel = new St.Label({ text: `${rank + 1}`, style_class: 'cc-rank' });
            row.add_child(rankLabel);
        }

        // Kind icon + image thumbnail if applicable
        if (entry.kind === 'image') {
            const thumb = this._makeThumbnail(entry);
            if (thumb) row.add_child(thumb);
        } else {
            const kindIcon = new St.Icon({ icon_name: this._iconForKind(entry), icon_size: 14, style_class: 'cc-kind' });
            row.add_child(kindIcon);
        }

        // Label
        const reveal = !this._settings.get_boolean('reveal-on-hover');
        const shouldBlur = entry.sensitive && !reveal;
        const visibleText = shouldBlur
            ? `🔒 ${entry.sensitive}  ·  ${'•'.repeat(Math.min(24, entry.preview.length))}`
            : entry.sensitive
                ? `🔒 ${entry.sensitive}  ·  ${entry.preview.replace(/\n/g, '⏎ ')}`
                : entry.preview.replace(/\n/g, '⏎ ');
        const fullText = visibleText + (entry.length > EphemeralStore.PREVIEW_LEN ? '…' : '');
        const label = new St.Label({
            text: fullText,
            x_expand: true,
            style_class: entry.sensitive ? 'cc-label cc-sensitive' : 'cc-label',
        });
        label.clutter_text.ellipsize = 3;
        const labelBtn = new St.Button({ child: label, x_expand: true, style_class: 'cc-btn' });
        labelBtn.connect('clicked', () => this._copyBack(entry));

        // Hover reveal for sensitive entries
        if (shouldBlur) {
            labelBtn.connect('enter-event', () => {
                label.text = (`🔒 ${entry.sensitive}  ·  ${entry.preview.replace(/\n/g, '⏎ ')}`) +
                    (entry.length > EphemeralStore.PREVIEW_LEN ? '…' : '');
            });
            labelBtn.connect('leave-event', () => {
                label.text = fullText;
            });
        }
        row.add_child(labelBtn);

        // Transform (right-click style — via small ⚙ button for discoverability)
        if (entry.kind === 'text') {
            const xfIcon = new St.Icon({ icon_name: 'emblem-system-symbolic', icon_size: 14 });
            const xfBtn = new St.Button({ child: xfIcon, style_class: 'cc-btn' });
            xfBtn.connect('clicked', () => this._openTransformMenu(entry, xfBtn));
            row.add_child(xfBtn);
        }

        // Delete
        const delIcon = new St.Icon({ icon_name: 'edit-delete-symbolic', icon_size: 14 });
        const delBtn = new St.Button({ child: delIcon, style_class: 'cc-btn' });
        delBtn.connect('clicked', () => { this._store.remove(entry.id); this._syncUI(); });
        row.add_child(delBtn);

        return row;
    }

    _makeThumbnail(entry) {
        try {
            const bytes = entry.content instanceof GLib.Bytes ? entry.content : GLib.Bytes.new(entry.content);
            const gicon = Gio.BytesIcon.new(bytes);
            return new St.Icon({ gicon, icon_size: 28, style_class: 'cc-thumb' });
        } catch { return null; }
    }

    _openTransformMenu(entry, button) {
        const menu = new PopupMenu.PopupMenu(button, 0.0, St.Side.TOP);
        const mgr = new PopupMenu.PopupMenuManager(button);
        mgr.addMenu(menu);

        for (const t of TRANSFORMS) {
            const item = new PopupMenu.PopupMenuItem(t.label);
            item.connect('activate', () => {
                try {
                    const out = t.fn(entry.content);
                    this._store.add({
                        kind: 'text',
                        content: out,
                        preview: out.slice(0, EphemeralStore.PREVIEW_LEN),
                        length: out.length,
                        sensitive: this._settings.get_boolean('detect-secrets') ? detectSecret(out) : null,
                        _dedup: `t:${out.length}:${out.slice(0, 96)}`,
                    });
                    this._syncUI();
                } catch (e) {
                    Main.notify('Just Clipboard', `Transform failed: ${e.message}`);
                }
                menu.close();
            });
            menu.addMenuItem(item);
        }

        Main.uiGroup.add_child(menu.actor);
        menu.open();
    }

    _iconForKind(e) {
        if (e.kind === 'image') return 'image-x-generic-symbolic';
        if (e.kind === 'uris')  return 'folder-symbolic';
        return 'text-x-generic-symbolic';
    }

    async _copyBack(entry) {
        try {
            if (entry.kind === 'image') {
                this._monitor.suppressNext('clipboard');
                setClipboardImage(entry.mime, entry.content);
            } else if (entry.kind === 'uris') {
                this._monitor.suppressNext('clipboard');
                setClipboardUris(entry.content);
            } else {
                this._monitor.suppressNext('clipboard');
                setClipboardText(entry.content);
            }
        } catch (e) { logError(e); }
        this.menu.close();
    }

    // ---------- Quick paste ----------

    quickPaste(n) {
        const entries = this._store.list();
        const e = entries[n];
        if (!e) return;
        this._copyBack(e);
    }

    // ---------- Teardown ----------

    destroy() {
        this._monitor.stop();
        if (this._expireId) { GLib.source_remove(this._expireId); this._expireId = null; }
        for (const id of this._settingsHandlers ?? []) this._settings.disconnect(id);
        if (this._ssProxy && this._ssHandler) { try { this._ssProxy.disconnectSignal(this._ssHandler); } catch {} }
        this._store.clearAll();
        super.destroy();
    }
});

export default class ClipboardExtension extends Extension {
    enable() {
        this._indicator = new ClipboardIndicator(this);
        Main.panel.addToStatusArea('clipboard', this._indicator);

        const settings = this.getSettings();

        Main.wm.addKeybinding(
            'toggle-shortcut', settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._indicator.menu.toggle()
        );

        this._quickKeys = [];
        if (settings.get_boolean('quick-paste-shortcuts')) {
            for (let i = 1; i <= 9; i++) {
                const key = `quick-paste-${i}`;
                Main.wm.addKeybinding(
                    key, settings, Meta.KeyBindingFlags.NONE,
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                    () => this._indicator.quickPaste(i - 1)
                );
                this._quickKeys.push(key);
            }
        }
    }

    disable() {
        try { Main.wm.removeKeybinding('toggle-shortcut'); } catch {}
        for (const k of this._quickKeys ?? []) { try { Main.wm.removeKeybinding(k); } catch {} }
        this._quickKeys = null;
        this._indicator?.destroy();
        this._indicator = null;
    }
}
