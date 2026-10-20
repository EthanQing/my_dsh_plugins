# Third-party notices

This plugin is an independent fork, not an official miuzel or DSH release.

- **dsh-subagent-workspace-ui 1.10.0**, by miuzel, MIT.
  Source: https://github.com/miuzel/dsh-subagent-ui
  Pinned commit: `02036b5c3661302f902884e24e6094283eef8b21`.
  `src/client/` retains the manager, floating activity view, styles, live-output,
  session retention, formatting, translations and prompt preview from this revision.
  Changes: independent identity and CSS/storage namespaces; sidebar navigation;
  removal of the main-window chat-tab simulation; effect-owned stylesheet and
  session-scoped child colors (removing global hashed stats-row styling);
  guarded deletion client; additional error messages. The build uses esbuild
  instead of the upstream sucrase linker. Original license terms are in LICENSE.
- **dsh-session-delete-manager**, repository-local MIT implementation, copyright
  2026 dsh-session-delete-manager contributors.
  `src/index.js` adapts its guarded deletion backend with separate endpoint,
  token and plugin identity; active-work rejection precedes persistence scans.
  No runtime dependency on that plugin is needed.

Copyright (c) 2026 miuzel

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
