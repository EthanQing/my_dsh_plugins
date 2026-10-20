# Repository rules

- All installation, update, removal, and plugin activation operations belong to the user. Do not run package-manager install/add/update/remove commands, DSH plugin management mutations, or edit a Desktop Profile. This includes development dependency installation; provide commands for the user when needed.
- Source edits, builds using existing dependencies, tests, and packaging checks are allowed. Packaging is not installation. Never start or restart DSH automatically.
- The root package is a distribution bundle for all completed repository plugins, not another functional plugin. Every completed plugin must be added to plugins.json, the root package files, cordis.patch.yml, activation examples, and installation documentation before delivery so GitHub installation includes it. Keep entries disabled by default. Preserve each plugin's original ID and browser module ID.
- Commit prebuilt runtime files. GitHub installation must not depend on prepare/install lifecycle scripts or a neighboring DSH checkout.
- Never publish a release, push commits, or create tags unless explicitly requested. Provide local reviewable changes first.
