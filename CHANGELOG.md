# Changelog

All notable changes to Just Clipboard are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-04-20

Initial public release.

### Added
- **Ephemeral in-memory storage**: history lives in a `Map` only — no file, no keyring, no database, no sync. Cleared on enable/disable, shell restart, reboot, and (optionally) screen lock.
- **Rich content**: text, images (PNG/JPEG/WebP) with thumbnails, file URIs from Nautilus.
- **Primary selection** capture (middle-click), opt-in.
- **Secret detection**: 16 regex patterns (AWS, GitHub/GitLab/Slack/Stripe/Google/OpenAI/Anthropic, JWT, private keys, IBAN, credit cards, BTC/ETH addresses, generic `api_key=…`).
- **Blur + hover reveal** for detected secrets.
- **Auto-clear on screen lock** via `org.gnome.ScreenSaver`.
- **App blacklist**: skip capture when specific `WM_CLASS` / app-id is focused (defaults: KeePassXC, Bitwarden, 1Password).
- **Separate auto-expiration** for detected secrets (60 s default) vs normal entries (opt-in minutes).
- **Transformations** on text entries via row menu: Base64 / URL / JSON / hash (MD5/SHA-1/256/512) / case / trim / reverse / IOC defang-refang.
- **Snippets** with `{date} {time} {datetime} {clipboard} {stack} {uuid} {n}` interpolation.
- **Named stacks** to organize captures; default + user-created.
- **Quick-paste shortcuts** (`Super+Alt+1..9`).
- **Panel badge** with live entry count.
- **Date grouping** in the popup (Pinned / Today / Yesterday / This week / Older).
- **Preferences** (Adw/GTK4) with a full keyboard-shortcut editor.
- **44 unit tests** runnable via `bash tests/run.sh`.
- **GitHub Actions CI**: compile schema, run tests, syntax-check, package a `.shell-extension.zip` artifact on `main`.
- **GPL-3.0** license.
