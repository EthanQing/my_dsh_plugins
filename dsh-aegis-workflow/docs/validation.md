> Historical record: test code and runners have since been removed. Commands and results below describe earlier verification, not a currently runnable test suite.

# Validation — 2026-10-19

> Later adjustment: the six named delegation tools are replaced by one `aegis_delegate` with an `agent_preset` enum; Planner/Coder/Reviewer/Git Operator keep `send_message`, while Knowledge Curator and Project Mentor are completion-only. A further prompt-level change adds conservative small/normal/high-risk task tiers; small tasks use a Lead brief plus Coder/Curator and a Lead check, skipping Planner and independent Reviewer. The validation below describes the earlier full-flow composition.
>
> A later prompt-only adjustment widens the small tier (about four files/150 lines; five/200 for text/CSS/docs-only with no logic or contract impact), bounds the normal-tier Reviewer to changed files/direct interfaces with a soft 20-30 tool-call budget and blocking findings only, and makes the Lead final check reuse Reviewer evidence rather than repeat the audit. No preset composition, tool set, approval step or runtime code changed for this adjustment.
>
> The latest adjustment unifies workspace tool access across all seven presets: every role mounts `tool-fs` with write/edit enabled, `tool-fs-search`, and the official platform `tool-bash`/`tool-pwsh` pair (on Windows the Git Bash plugin's inline patch exposes `bash` and masks the fake `pwsh`). Role boundaries are now prompt-only. The config test is updated to assert the unified composition; the runtime assertions below describe the earlier tool-split state and have been updated in source but not re-executed here because no isolated copied runtime is available. No host profile, DSH core, Git Bash plugin, sandbox mode or global tool was changed; no role, delegation, approval step or lifecycle was added.

Publication copy: source is prepared for the user-selected repository `https://github.com/EthanQing/my_workflow.git`. Relative to the reviewed local project, only this note, repository/install documentation and package `repository` metadata change. The seven preset configurations, tests and scripts remain byte-identical. The previously verified local tarball is preserved separately and does not contain these publication-copy documentation/metadata changes. No tarball, copied runtime, cache, test home or credentials are included in the source repository. Historical validation below refers to the original local bundle and isolated checks; it does not claim GitHub network installation, new tags/releases or real-model acceptance. No `v0.1.0` tag is created; install `#main` or a real fixed commit from repository history.

Implementation task AEGIS-001 / P1 was explicitly approved by the user (“批准”). Baseline: empty `outputs/` and `work/`, no project Git baseline; no user files were changed. Target is the installed desktop runtime **0.2.1-rc.2**, build `332895e0f7c9d4dbfb29729f5eb367fa263ff986`, copied from its ASAR into `work/desktop-runtime`. The older global CLI was not used. Test runner: Windows, Node **22.20.0**; desktop's packaged Node differs (24.21). SQLite emitted its experimental warning but ran successfully. No new dependencies were added.

## Executed checks

All relative command paths below are from `outputs/dsh-aegis-engineering/` unless a workspace-root cwd is stated.

| Command / check | Result |
| --- | --- |
| Historical configuration checks | Historical 3/3 (now 4/4): seven unique presets/current API, official base+web composed global-tool disabling, read-only/writer/delegation composition; the tool-unification run asserts shared fs/search/shell and Lead-only delegation |
| Historical runtime checks | 2/2 pass: official Loader/loop/manager/spawn/JSONL/SQLite with deterministic LLM; six official delegation tools and continuation tools |
| `npm.cmd pack --dry-run --json` | Package whitelist inspected; no test fixture, copied runtime, credentials or install scripts shipped |
| `npm.cmd pack --pack-destination ../../work --json` | Local tarball created |
| Matching copied carrier `--profile aegis-test --from-default-profile web --dump-config` | Isolated web profile composed successfully; no server/UI started |
| Matching copied carrier `plugin --profile aegis-test add <local-tgz> --offline --ignore-scripts` | Installed successfully using copied cached pnpm 10.12.1; exit 0 |
| Matching copied carrier `--profile aegis-test --dump-config` after installation | All seven preset IDs present; official built-in preset declarations remain |

Installation cwd was workspace root. The copied carrier command begins `node --expose-internals work/desktop-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js`. Its test process used only `work/install-test-home` as DSH_HOME, `work/corepack` as COREPACK_HOME, `work/npm-cache` as npm cache, and `work/pnpm-store` as pnpm store; network was disabled for the successful offline install. The isolated profile alone pins `pnpm@10.12.1`. Initial unpinned installation failed because Corepack tried to resolve pnpm/latest and DNS returned `ENOTFOUND registry.npmjs.org`; reuse of the existing cached package manager resolved that test limitation. This did not change global configuration or the user's desktop profile.

## What the runtime assertions establish

- Seven actual definitions load alongside an unchanged `standard` test definition. Duplicate `reliable-dev` registration rejects explicitly.
- All six roles complete a first activation, release their live Agent instance, accept a second message at the same durable ID, and receive their own first-round random UUID in the next actual model request. The catalog contains exactly six continuable children, no replacement IDs.
- After the complete test host is disposed and rebuilt using the same official persistence, all six original IDs accept another message. Requests still include each role's first-round marker. This tests host/session cold restoration; it does not launch/restart the desktop GUI.
- Official `list_agents` returns all six IDs and inactive status. The final host matches Desktop `openAt: never`. After an injected Lead model connection failure, `session_event_search` explicitly fails with “session search is disabled in this deployment”. Official `session_event_read` starts at seq 0 with after 50, then advances using returned sequence numbers. Two windows locate the complete Planner plan at seq 71; a final exact read verifies its full payload. Official `send_message` continues that original Planner; catalog size stays six. No index is enabled. This supersedes the initial startup-index recovery test rejected in review R1.
- Each of the six official `aegis_*` delegation tools creates the corresponding independent preset through the actual model tool-call loop; `send_message` then reuses it. A test-specific capacity of **1** permits the six serial roles without exhaustion; the other test uses **2**.
- Historical (pre-tool-unification) actual child model-request schemas: Planner/Reviewer/Mentor omitted shell/write/edit; Curator had write/edit and no shell; Coder had write/edit and platform shell; Git Operator had platform shell and no file-write tool. After the tool-unification change, the test source now expects every child to expose `write`, `edit` and its platform shell (on Windows the model-facing name is `bash`), and to have no delegation surface. The enabled global `working_directory` tool is retained. This updated runtime expectation has not been re-executed because no isolated copied runtime was available.
- The official full **base + web** patch composition is checked separately: global filesystem/search, shell and delegation consumers are disabled. The headless runtime kernel retains this model-tool setup without starting web/server/client plugins. It is not a complete desktop application boot. Extra user-installed global tools could expand the surface; bare base hosts are unsupported.

## Limits and unexecuted scenarios

R1 (rework round 1 of 3): Lead recovery instructions, host index settings and the recovery regression were corrected together. Runtime checks passed 2/2 after this change. Initial source and installed-package runs had config 3/3 and runtime 2/2; the final revised package is installed into a fresh isolated profile and its installed contents are used for the affected runtime rerun. The command form is:

```powershell
# cwd: workspace root; DSH_HOME, COREPACK_HOME, npm cache and pnpm store point into work/
node --expose-internals work/desktop-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile aegis-r1 add <revised-local-tgz> --offline --ignore-scripts
node --expose-internals work/desktop-runtime/node_modules/@deepseek-ai/dsh/lib/bin.js --profile aegis-r1 --dump-config
# cwd: outputs/dsh-aegis-engineering/
$env:AEGIS_TEST_BUNDLE = (Resolve-Path '../../work/install-test-home/profiles/aegis-r1/node_modules/dsh-aegis-engineering').Path
```

Runtime-path isolation is an operator precondition documented in both READMEs: only use a copied runtime, never the installed runtime or personal home. The test helper writes its Loader files beneath that supplied runtime, so a custom `AEGIS_DSH_RUNTIME` must be reviewed before execution; no automated path string can establish that an arbitrary external directory is a disposable copy.

The model adapter is scripted. These are real DSH mechanism tests, **not real-model workflow acceptance**. The user chose “先完成运行时测试，暂不提供模型连接”; no credentials were searched or copied. Approval/refusal behavior, new-task authority separation, source/knowledge path discipline, NO_CHANGE branching, independent-review judgment, the three-round stopping rule and Git authorizations are configured instructions, not proven security properties or tested model judgment. There was no real business-source write, knowledge edit, Git stage/commit/push, external model call, or production-system call in these lifecycle tests. Writer execution is serial in the test trace; this does not prove all models will serialize writers.

The installed-profile `reliable-dev` conflict was not migrated. Public GitHub installation, network update/rollback, an actual desktop install, real model behavior, GUI rendering and user interaction were not executed. No public repository or release was created; creating/pushing one needs separate authorization. Tests do not promise compatibility outside desktop 0.2.1-rc.2 Desktop/Web composition.

## User manual acceptance — waiting

Build: no compilation required for the YAML bundle; package creation and headless runtime checks ran. Application/GUI startup: **not run**.

1. With separate approval, install in an independent desktop test profile, resolving the existing `reliable-dev` conflict without overwriting it. Open a new session; expect **Aegis Engineering** and six child presets alongside built-ins.
2. Configure an authorized model connection in that test profile. Ask for a normal-tier project change (not a small one), reject the first plan, and compare the directory: expect no writes. Approve a fresh version and expect Coder, optional Curator, focused independent Reviewer and Lead check in sequence.
3. Ask the same Planner a follow-up, then other roles; inspect IDs/history. Expect original child IDs and retained context, including after a supported desktop restart with persistent sessions retained.
4. Start another task and a different workspace: expect a new plan/approval rather than borrowed consent. Try a NO_CHANGE knowledge case, optional Mentor teaching, and a simulated review fix sequence; expect no fourth rework without asking.
5. Inspect Git status: expect no automatic staging/commit/push. Authorize any desired operations separately.
6. Report DSH version, profile, child IDs, exact errors, approval behavior, unexpected tools/writes, and expected versus observed results. Keep credentials out of reports.
