# Just Clipboard

> Ephemeral, in-memory clipboard history for GNOME Shell — with built-in secret detection, blur, and auto-expiration. **Nothing ever touches disk.**

![GNOME Shell](https://img.shields.io/badge/GNOME%20Shell-47%20%7C%2048-4A86CF?logo=gnome&logoColor=white)
![GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)
![Status](https://img.shields.io/badge/status-alpha-orange)

Just Clipboard is an opinionated clipboard manager designed around one rule:
**the clipboard is a transit buffer, not a vault**. Content passes through it
briefly — it should never be silently persisted to disk, shipped to a cloud,
or left lying around in plaintext after you close your laptop.

So this extension holds your history in a plain in-memory `Map`. No file, no
keyring, no database, no sync. When GNOME Shell restarts — or when you lock
your screen, if you enable that option — the history is gone.

---

## Features

- **Ephemeral storage** — no file, no keyring, no sync, no telemetry.
- **Rich content** — text, images (PNG / JPEG / WebP) with thumbnails, file URIs.
- **Primary selection** capture (middle-click), opt-in.
- **Secret detection** — 16 patterns out of the box (AWS, GitHub / GitLab / Slack / Stripe / Google / OpenAI / Anthropic keys, JWT, private keys, IBAN, credit cards, BTC / ETH addresses, generic `api_key=…`). Sensitive entries get a short, separate auto-expiration.
- **Blur + hover reveal** for secrets.
- **Auto-clear on screen lock** (via `org.gnome.ScreenSaver`).
- **App blacklist** — never capture while KeePassXC, Bitwarden or any WM_CLASS you configure has focus.
- **Transformations** — right-click any text entry: Base64 / URL encode-decode, JSON format-minify, hash (MD5 / SHA-1/256/512), case toggle, trim, reverse, IOC defang/refang.
- **Snippets** with variable interpolation — `{date}`, `{time}`, `{datetime}`, `{clipboard}`, `{stack}`, `{uuid}`, `{n}`.
- **Named stacks** — group captures into contexts (e.g. `work`, `scratch`).
- **Quick paste** — `Super+Alt+1..9` to paste entry N directly.
- **Date grouping** — Pinned / Today / Yesterday / This week / Older.
- **Panel badge** — live entry count.
- **Preferences** with full keyboard-shortcut editor.

## Installation

### From source

```bash
git clone https://github.com/0emirhan/just-clipboard.git just-clipboard@0emirhan
cd just-clipboard@0emirhan
make install
make schemas
```

Then **log out and back in** (Wayland doesn't allow hot-reloading `gnome-shell`),
and enable the extension:

```bash
gnome-extensions enable just-clipboard@0emirhan
```

### From a pre-packaged zip

```bash
gnome-extensions install --force just-clipboard@0emirhan.shell-extension.zip
```

### Testing in a nested session (no logout)

```bash
dbus-run-session -- gnome-shell --nested --wayland
```

## Usage

| Action | Default shortcut |
|---|---|
| Open popup | `Super + Shift + V` |
| Paste entry N | `Super + Alt + N` (N = 1..9) |
| Search | Type in the popup search bar |
| Pin / unpin | Star icon on the row |
| Delete | Trash icon on the row |
| Transform | ⚙ icon (text entries only) |
| Switch stack | Click a stack chip at the top of the popup |

Preferences: `gnome-extensions prefs just-clipboard@0emirhan`

## Design rationale — why no encryption at rest?

The natural question when you see "clipboard" and "security" in the same
sentence is: *"why don't you just encrypt the history with a password?"*.
I considered it when designing this extension, and deliberately chose not
to. Here's why.

### The friction / security equation is cruel

- **Lock every 5 minutes** → user picks `1234` or `azerty` to avoid ragequitting.
- **Never lock** → a stolen laptop = full compromise.
- **Smart long-timeout lock** → equivalent to no lock for a patient attacker.

There is no sweet spot. The UX pressure always wins, and the "protection"
quietly degrades to security theater.

### The deeper trap: accumulated fragilities

A separate-password lock on a clipboard manager doesn't just have one weakness
— it has a stack of them:

1. **Weak password** picked out of friction (as above).
2. **Typing fatigue**: after the 10th prompt of the day, the user disables the lock.
3. **Password reuse**: *"it's the same as my login anyway"* — if the login is compromised, so is the clipboard.
4. **Shoulder surfing**: typing the clipboard password in a café is visible.
5. **Keylogger**: if malware reaches the session, the clipboard password falls *on top* of everything else.
6. **False sense of security**: *"it's encrypted, so it's fine"* — the user relaxes their vigilance about what they copy in the first place.

**Net result**: in practice, the final security is often *worse* than a system
with no lock but no persistence either, because the user has dropped their
guard in the belief that "the vault has their back".

### What this means for Just Clipboard

Just Clipboard deliberately refuses to add a separate-password lock.
The "laptop stolen while powered off + data at rest" threat model is
**poorly covered** by a clipboard-specific password, because you're stuck
between two bad options:

- **Derive the key from the login password** → you're back to trusting the
  login password's strength, with no real second factor.
- **Ask for a separate password** → high friction → weak password → security
  equivalent to none.

### Use the right tool for each threat

| Need | The actual solution |
|---|---|
| Secrets accidentally copied | Short auto-purge (built in, 60 s default for detected secrets) |
| Laptop stolen powered off | **Full-disk encryption (LUKS)** with a strong passphrase — covers *everything*, not just the clipboard |
| Laptop stolen powered on, unlocked | Nothing works at this point. Even a "locked clipboard" is already decrypted in RAM. This is why the extension auto-clears on screen lock instead. |
| Fast access to a long-term secret | A **real password manager** (Bitwarden, KeePassXC) — not a clipboard manager |

### The core insight

> **The clipboard is a transit buffer, not a vault.**

Trying to turn it into a password-protected safe means:

- Reinventing (badly) a password manager.
- Degrading overall security through weak, frequently-typed passwords.
- Conflating two fundamentally different threat models.

Just Clipboard explicitly refuses to make that mistake. The history lives
where it should — in RAM, briefly — and disappears when it's no longer needed.
If you want a vault, use a vault.

## Threat model (concrete)

Just Clipboard protects against **accidental disclosure** — screen sharing,
shoulder surfing, post-lock inspection, basic on-disk forensics, and other
extensions that scrape persistent clipboard history files.

It does **not** protect against a malicious process that can read GNOME Shell's
memory (e.g. `ptrace`). That threat belongs to your kernel and sandboxing stack,
not to a clipboard manager.

Specifically:

- **Disk**: nothing is written except ordinary dconf metadata (your preferences; no clipboard content).
- **Keyring**: not used. No `libsecret` dependency.
- **Network**: no network code.
- **Logs**: errors go to `journalctl -u gnome-shell`, but captured content is never logged.

## Architecture

```
┌──────────────────┐    changed    ┌─────────────────┐
│ ClipboardMonitor │──────────────▶│ Indicator       │
│  (polls 1 Hz)    │               │  ├ Store        │ ← in-memory Map<id, entry>
└────────┬─────────┘               │  ├ Popup        │
         │                         │  ├ Expiration   │
         ▼                         │  └ Stacks       │
  St.Just Clipboard                     └─────────────────┘
  (CLIPBOARD +                          │
   optional PRIMARY)                    ▼
                                  GSettings (prefs
                                  only, no content)
```

### Files

```
just-clipboard@0emirhan/
├── extension.js        # Indicator, popup, capture loop, expiration
├── prefs.js            # Adw (GTK4) preferences window
├── stylesheet.css      # Popup styling
├── metadata.json
├── lib/
│   ├── store.js        # EphemeralStore (Map) + stacks + pruning
│   ├── clipboard.js    # ClipboardMonitor (polling + suppress)
│   ├── detect.js       # Secret regexes
│   ├── transforms.js   # Pure text transformations
│   └── snippets.js     # Snippet interpolation
├── tests/              # gjs-runnable unit tests
├── schemas/            # GSettings schema
├── Makefile
└── .github/workflows/  # CI
```

## Development

```bash
make test        # run the 44 unit tests
make lint        # node --check syntax on all JS
make schemas     # recompile GSettings schema
make pack        # create a shell-extension.zip
make logs        # tail gnome-shell logs for clipboard
```

### Debugging tips

- Looking Glass: `Alt + F2` → `lg` → Enter. Then:
  ```js
  Main.extensionManager.lookup('just-clipboard@0emirhan')
  Main.panel.statusArea['clipboard']
  ```
- Live logs: `journalctl -f -o cat /usr/bin/gnome-shell | grep -i clipboard`
- Force reload (X11 only): `Alt + F2` → `r` → Enter
- Nested session (Wayland): `dbus-run-session -- gnome-shell --nested --wayland`

## Contributing

PRs welcome. Please:

1. Keep the ephemeral guarantee — no persistence backends without an explicit opt-in and clear UX.
2. Add tests for new transformations or detection patterns.
3. Run `make test && make lint` before opening a PR.
4. Match the code style (`.editorconfig` provided).

## License

GNU GPL v3.0 or later — see [LICENSE](LICENSE).

---

## FAQ

**Q: Why the name "Just Clipboard"? It's so generic.**
A: That's the point. No cute product name, no vault-sounding rebranding
("Crypt", "Vault", "Safe") that would oversell what the extension does.
It's a clipboard history, nothing more. The personality is in the design,
not the label.

**Q: Does it work on X11?**
A: Yes, it should work on both X11 and Wayland (tested on Wayland, GNOME 48.7).

**Q: Does it compete with Clipman / Pano / GPaste?**
A: Pano is the modern Rust-based clipboard manager; GPaste is the classic
battle-tested option. Both persist history and have richer features. This
extension makes a different tradeoff: **zero persistence** + **secret-aware UX**.
Pick the one that matches your threat model.

**Q: Can I export my history?**
A: No — that would defeat the design. If you pin an entry, it stays until
explicitly unpinned or cleared.
