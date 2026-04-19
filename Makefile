UUID := just-clipboard@0emirhan
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP := $(UUID).shell-extension.zip

.PHONY: all schemas test pack install uninstall clean logs enable disable lint

all: schemas

schemas:
	glib-compile-schemas schemas/

test: schemas
	bash tests/run.sh

lint:
	@for f in extension.js prefs.js lib/*.js; do node --check $$f && echo "  $$f OK"; done

pack: schemas test
	gnome-extensions pack --force \
	  --extra-source=lib \
	  --extra-source=README.md \
	  --extra-source=LICENSE \
	  --extra-source=CHANGELOG.md \
	  .

install: schemas
	mkdir -p $(INSTALL_DIR)
	cp -r extension.js prefs.js stylesheet.css metadata.json lib schemas $(INSTALL_DIR)/

uninstall:
	rm -rf $(INSTALL_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

logs:
	journalctl -f -o cat /usr/bin/gnome-shell | grep -i clipboard

clean:
	rm -f $(ZIP) schemas/gschemas.compiled
