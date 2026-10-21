# Third-party notices

The bundled browser renderer contains unmodified published xterm.js modules:

- `@xterm/xterm` 6.0.0, MIT, https://github.com/xtermjs/xterm.js, npm tarball SHA-1 `93637b0f2ee3a70718b5746a27c9c506af16745b`. Full license: [vendor/xterm/LICENSE](vendor/xterm/LICENSE).
- `@xterm/addon-fit` 0.11.0, MIT, same upstream repository, npm tarball SHA-1 `ba4778b69fcc9044a060c2176bbe077657d7b37e`. Full license: [vendor/addon-fit/LICENSE](vendor/addon-fit/LICENSE).

The complete published packages, including sources and licenses, are retained under `vendor/` for repeatable builds. The distribution includes the bundled runtime and both licenses; it does not download code at runtime. No native PTY dependency is bundled.

DSH's `ClientTerminals` and Cordis services are consumed from the running DSH installation through its module loader. They are not copied into this plugin. Compatibility is checked against Desktop 0.2.1-rc.2; review those APIs when upgrading DSH.
