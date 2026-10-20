# Repository rules

- All installation, update, removal, and plugin activation operations belong to the user. Do not run package-manager install/add/update/remove commands, DSH plugin management mutations, or edit a Desktop Profile. This includes development dependency installation; provide commands for the user when needed.
- Source edits, builds using existing dependencies, tests, and packaging checks are allowed. Packaging is not installation. Never start or restart DSH automatically.
- The root package is a distribution bundle for all completed repository plugins, not another functional plugin. Every completed plugin must be added to plugins.json, the root package files and local file dependencies, cordis.patch.yml, activation examples, and installation documentation before delivery so GitHub installation includes it. Keep entries disabled by default. Preserve each plugin's original ID and browser module ID.
- Commit prebuilt runtime files. GitHub installation must not depend on prepare/install lifecycle scripts or a neighboring DSH checkout.
- Never publish a release, push commits, or create tags unless explicitly requested. Provide local reviewable changes first.

- Root bundle rows must use each component’s bare package name, backed by a file: dependency on its shipped directory. File-URL/path rows bypass DSH display metadata; package-subpath rows do not register the component Client manifest in DSH 0.2.1-rc.2. Keep DSH-provided peers optional and component install/prepare/prepack hooks absent.

- The workflow is now included by explicit user request: dsh-aegis-workflow/ replaces my_workflow/. Keep its collection entry disabled by default, preserve the seven original preset IDs, and generate lib/presets.yml using its build script. Its Host entry only delegates composition to the official Include; do not add a scheduler or notification system.
- The collection package is named dsh-plugins (formerly my-dsh-plugins). GitHub repository renames are separate from package/directory renames; keep installation URLs pointing at an existing repository until the remote rename is confirmed.
