import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ShortcutRow = GObject.registerClass({
}, class ShortcutRow extends Adw.ActionRow {
    _init(settings, key, title, subtitle) {
        super._init({ title, subtitle });
        this._settings = settings;
        this._key = key;
        this._button = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            has_frame: true,
        });
        this.add_suffix(this._button);
        this._refresh();
        this._button.connect('clicked', () => this._capture());
    }

    _refresh() {
        const val = this._settings.get_strv(this._key)[0] ?? '';
        this._button.label = val || '(unset)';
    }

    _capture() {
        this._button.label = 'Press keys…';
        const controller = new Gtk.EventControllerKey();
        this._button.add_controller(controller);
        controller.connect('key-pressed', (_, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();
            if (keyval === Gdk.KEY_Escape) { this._refresh(); return true; }
            if (keyval === Gdk.KEY_BackSpace) { this._settings.set_strv(this._key, []); this._refresh(); return true; }
            const accel = Gtk.accelerator_name(keyval, mask);
            if (!accel || accel.length === 0) return false;
            this._settings.set_strv(this._key, [accel]);
            this._refresh();
            this._button.remove_controller(controller);
            return true;
        });
    }
});

export default class ClipboardPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const s = this.getSettings();

        const page = new Adw.PreferencesPage({ title: 'Just Clipboard', icon_name: 'edit-paste-symbolic' });
        window.add(page);

        const gHist = new Adw.PreferencesGroup({ title: 'History (ephemeral)', description: 'Entries are stored in memory only. They vanish on logout, shell restart, disable/enable or (optionally) screen lock.' });
        page.add(gHist);

        const maxRow = new Adw.SpinRow({
            title: 'Maximum entries',
            subtitle: 'Non-pinned oldest entries are pruned beyond this count',
            adjustment: new Gtk.Adjustment({ lower: 5, upper: 500, step_increment: 5, value: s.get_int('max-entries') }),
        });
        s.bind('max-entries', maxRow, 'value', 0);
        gHist.add(maxRow);

        const ssRow = new Adw.SwitchRow({ title: 'Clear on screen lock', subtitle: 'Drop non-pinned entries when the screen locks' });
        s.bind('screensaver-clear', ssRow, 'active', 0);
        gHist.add(ssRow);

        const privRow = new Adw.SwitchRow({ title: 'Private mode', subtitle: 'Pause clipboard capture' });
        s.bind('private-mode', privRow, 'active', 0);
        gHist.add(privRow);

        const gCap = new Adw.PreferencesGroup({ title: 'Capture' });
        page.add(gCap);

        const richRow = new Adw.SwitchRow({ title: 'Capture images & files', subtitle: 'PNG/JPEG/WebP and file URIs in addition to text' });
        s.bind('rich-types', richRow, 'active', 0);
        gCap.add(richRow);

        const primRow = new Adw.SwitchRow({ title: 'Capture primary selection', subtitle: 'Also capture the middle-click clipboard' });
        s.bind('capture-primary', primRow, 'active', 0);
        gCap.add(primRow);

        const imgRow = new Adw.SpinRow({
            title: 'Maximum image size',
            subtitle: 'Images larger than this (KB) are skipped',
            adjustment: new Gtk.Adjustment({ lower: 64, upper: 20000, step_increment: 64, value: s.get_int('max-image-kb') }),
        });
        s.bind('max-image-kb', imgRow, 'value', 0);
        gCap.add(imgRow);

        const blRow = new Adw.EntryRow({ title: 'App blacklist (comma-separated WM_CLASS)' });
        blRow.set_text(s.get_strv('app-blacklist').join(', '));
        blRow.connect('apply', () => {
            const list = blRow.get_text().split(',').map(x => x.trim()).filter(Boolean);
            s.set_strv('app-blacklist', list);
        });
        gCap.add(blRow);

        const gExp = new Adw.PreferencesGroup({ title: 'Auto-expiration' });
        page.add(gExp);
        const expOn = new Adw.SwitchRow({ title: 'Auto-expire entries', subtitle: 'Delete non-pinned entries after a delay' });
        s.bind('auto-expire-enabled', expOn, 'active', 0);
        gExp.add(expOn);
        const expMin = new Adw.SpinRow({
            title: 'Expiration delay (minutes)',
            adjustment: new Gtk.Adjustment({ lower: 1, upper: 10080, step_increment: 5, value: s.get_int('auto-expire-minutes') }),
        });
        s.bind('auto-expire-minutes', expMin, 'value', 0);
        gExp.add(expMin);

        const gSec = new Adw.PreferencesGroup({
            title: 'Secret detection',
            description: 'Regex-based scan for API keys, JWT, private keys, IBAN, cards, wallet addresses…',
        });
        page.add(gSec);
        const detRow = new Adw.SwitchRow({ title: 'Enable secret detection' });
        s.bind('detect-secrets', detRow, 'active', 0);
        gSec.add(detRow);
        const blurRow = new Adw.SwitchRow({ title: 'Blur secrets in popup', subtitle: 'Reveal the preview on hover' });
        s.bind('reveal-on-hover', blurRow, 'active', 0);
        gSec.add(blurRow);
        const sensRow = new Adw.SpinRow({
            title: 'Secret entry lifetime (seconds)',
            subtitle: '0 disables auto-expire for secrets',
            adjustment: new Gtk.Adjustment({ lower: 0, upper: 3600, step_increment: 10, value: s.get_int('sensitive-expire-seconds') }),
        });
        s.bind('sensitive-expire-seconds', sensRow, 'value', 0);
        gSec.add(sensRow);

        const gKeys = new Adw.PreferencesGroup({ title: 'Keybindings' });
        page.add(gKeys);
        gKeys.add(new ShortcutRow(s, 'toggle-shortcut', 'Open popup', 'Toggle the clipboard menu'));
        const quickRow = new Adw.SwitchRow({ title: 'Quick-paste shortcuts', subtitle: 'Super+Alt+1..9 to paste entry 1..9 directly' });
        s.bind('quick-paste-shortcuts', quickRow, 'active', 0);
        gKeys.add(quickRow);
        for (let i = 1; i <= 9; i++) {
            gKeys.add(new ShortcutRow(s, `quick-paste-${i}`, `Paste entry ${i}`, null));
        }

        const gSnip = new Adw.PreferencesGroup({
            title: 'Snippets',
            description: 'JSON list of { "name": "...", "template": "..." }. Template supports {date}, {time}, {datetime}, {clipboard}, {stack}, {uuid}, {n}.',
        });
        page.add(gSnip);
        const snipRow = new Adw.EntryRow({ title: 'Snippets (JSON)' });
        snipRow.set_text(s.get_string('snippets'));
        snipRow.connect('apply', () => {
            const val = snipRow.get_text();
            try { JSON.parse(val); s.set_string('snippets', val); }
            catch (e) { snipRow.add_css_class('error'); }
        });
        gSnip.add(snipRow);

        const gAbout = new Adw.PreferencesGroup({ title: 'About' });
        page.add(gAbout);
        gAbout.add(new Adw.ActionRow({
            title: 'Storage model',
            subtitle: 'In-memory only. No file, no keyring, no sync. History is wiped on shell restart.',
        }));
        gAbout.add(new Adw.ActionRow({
            title: 'Source',
            subtitle: 'github.com/0emirhan/just-clipboard — GPL-3.0',
        }));
    }
}
