# Aegis Engineering Workflow

[简体中文](README.zh-CN.md)

A configuration-only DeepSeek Harness Plugin Bundle: Lead (`reliable-dev`, displayed as **Aegis Engineering**) and six independent, continuable local subagent presets. Target: **DSH desktop 0.2.1-rc.2**, build `332895e0f7c9d4dbfb29729f5eb367fa263ff986`. Older global CLI releases are not supported. No core changes, custom session database, scheduler, notification system, installation scripts or machine-specific paths. A minimal Host entry delegates loading of the seven presets to the official Include.

| Preset | Responsibility |
| --- | --- |
| `reliable-dev` | Investigate, obtain approval, coordinate, recover and deliver |
| `aegis-planner` | Read-only investigation and complete versioned plan |
| `aegis-coder` | Approved source/config/tests and non-UI checks |
| `aegis-knowledge-curator` | Approved knowledge documentation, or NO_CHANGE |
| `aegis-reviewer` | Independent current-diff review |
| `aegis-project-mentor` | Read-only teaching in Chinese |
| `aegis-git-operator` | Separately authorized stage, commit and push |

All seven presets mount the same workspace tool set: file read, write, edit and search, plus the platform shell pair (the Windows face resolves to Git Bash `bash`). Role boundaries are prompt-level rules, not tool restrictions. The Lead alone mounts `aegis_delegate` and `list_agents`; children gain no secondary delegation. Reviewer uses `git status`/`git diff`/`rg` for evidence instead of repeated whole-file reads.

The 0.2.1-rc.2 local `spawn` provider implements continuations automatically; the obsolete `backgroundMode` field is deliberately absent. Lead delegates through one `aegis_delegate` tool with an explicit `agent_preset`, retains the returned child id, and uses `send_message` directly; it permits one `list_agents` lookup only when discovering an existing child is necessary after a real connection interruption, session recovery or missing result. A finished activation releases execution resources; persisted sessions survive and can resume. The six roles start only when needed. The host's default `maxActiveSubagents` is 8. Cold recovery requires retained session storage and the same available preset IDs; it mounts the currently installed preset revision, not a frozen copy of an older bundle.

Planner, Coder, Reviewer and Git Operator can use the official `send_message` tool to ask their direct parent Lead for a decision, report a blocker or material risk, and Lead can steer them while they work. Knowledge Curator and Project Mentor are completion-only. The call returns delivery confirmation, not a reply. Unrelated or idle roles are not queried, woken or broadcast to; normal completion uses the official notice, and history recovery is only for missing results or a broken connection.

When no useful independent work remains, Lead gives a brief status without tools and ends its current model turn, returning control to DSH without ending the workflow. The official `subagent-settled` notice carries the ending status and closing result and wakes the live Lead; Lead proceeds through the existing workflow and approval gates without reconfirming completion. Shell sleep, waiting loops, periodic status/history queries and repeated Git/search/timestamp checks are forbidden as subagent waiting mechanisms. Necessary bounded external-service readiness checks remain allowed. Genuine exception recovery is limited to one necessary catalog lookup, three advancing history windows and one exact-result read; no sequence progress means stop and report, not retry or recreate the child.

## Context-first, on-demand workflow

Reuse a detailed user/GPT implementation brief: goal, files, suggested changes, constraints and acceptance criteria. Lead verifies the workspace and critical code facts, interfaces and risks, then references the existing brief for approval. Technical judgments are hypotheses, not code facts. Broaden investigation only for a concrete contradiction, missing decision or actual risk; prompt length alone determines neither complexity nor safety.

| Task | Route |
| --- | --- |
| Small | Lead brief → user approval → Coder → brief Lead acceptance. |
| Normal with a clear implementation path | The same direct route; no mandatory Planner or Reviewer. |
| Unresolved requirement, technical choice or cross-module dependency analysis | Clarify or use Planner for the specific gap, then seek approval before implementation. |
| High-risk | Retain a risk-aware plan, user approval, independent Reviewer and essential targeted verification. Reuse a supplied plan only after verifying critical facts and safety assumptions; use Planner where decisions or risk analysis remain missing. |

Security/permissions, payment, data/migration, destructive operations, public contracts, dependency/toolchain, production configuration, cross-cutting refactors and large/uncertain impact remain high-risk. Detailed instructions never downgrade real risk. Small retains the existing roughly four-file/150-line limit (five files/200 lines for text-only work without contract impact) and excludes high-risk conditions.

Planner returns only the missing decisions or corrections rather than duplicating an adequate plan. Coder inherits locations, valid findings and acceptance criteria and owns implementation plus necessary checks. Reviewer is used for high-risk work, a named unresolved risk or an explicit independent-review request; it reviews the actual diff and relevant interfaces. Lead acceptance checks scope, criteria and valid evidence without repeating an independent audit or builds/tests.

Curator, Mentor and Git Operator run only for actual knowledge changes, teaching or individually authorized Git work. Pure knowledge work uses Curator instead of Coder, with the same risk-based routing. No role is added merely to complete a sequence.

Modification approval remains mandatory and scoped to the task/version/workspace. A detailed request, silence or old approval is not authorization. Material scope/risk/workspace changes stop affected writes and require renewed approval. Git stage, commit and push each require separate explicit authorization.

Only useful independent read-only investigations without prerequisites may run concurrently. Workspace writers remain serial; do not parallelize same-file edits, dependent implementation/verification or unapproved writes. Prefer removing unnecessary stages to adding agents. Reuse still-valid evidence, avoid repeated reads/builds and do not default to full suites or one-off smoke scripts. Review and Lead checks share at most three rework rounds, stopping earlier after two rounds without progress on the same issue.

Desktop defaults to `openAt: never` for the search index. Recovery does not enable indexing: Lead reads the original child's raw events with `session_event_read`, starting at `seq: 0, after: 50`, advances using returned event sequence numbers, and fully reads the identified result. Full-text search is optional when available; disabled search falls back to raw reads without spawning another child.

## Installation and activation

This workflow is included in the [DSH Plugins collection](../README.md). Its directory/package is now **dsh-aegis-workflow 0.2.0** (formerly my_workflow / dsh-aegis-engineering).

Install or update the collection through DSH using:

```text
github:EthanQing/my_dsh_plugins#main
```

The workflow is disabled by default. Enable its component, then create a new session and select **Aegis Engineering**. An [activation example](../examples/aegis-workflow.patch.yml) is provided. Current source lives in the [collection repository](https://github.com/EthanQing/my_dsh_plugins/tree/main/dsh-aegis-workflow), rather than the original standalone repository.

For standalone installation use the packaged dsh-aegis-workflow-0.2.0.tgz or a local workflow directory, not a GitHub subdirectory webpage. Disable/remove the old workflow before enabling this version: reliable-dev and the six aegis-* preset IDs are intentionally unchanged and must remain unique. The collection package is now dsh-plugins; it must not be enabled alongside the former my-dsh-plugins collection.

Preserve prior packages, profile configuration and session storage. Restart DSH yourself after updating and verify presets in a new session. For rollback, disable the new package before restoring the old one. No installation, Profile edit, Desktop startup or real-model/GUI acceptance was performed during this change.

## Windows shell

The verified Windows host is DSH desktop 0.2.1-rc.2 with `dsh-gitbash-shell` 0.38.5. The plugin replaces the process-wide `ctx.shell` with Git for Windows bash (`bash.exe -c`; currently `C:/Program Files/Git/bin/bash.exe`) and, for a preset face with `pwsh` but no `bash`, activates the official `bash` tool and masks the fake `pwsh`. All seven roles therefore see `bash` with MSYS paths and must use bash syntax. If the face instead exposes a real `pwsh` tool, Git Bash integration is not active: use PowerShell syntax only for genuinely Windows-native operations and state the limitation.

All seven presets intentionally keep the official per-platform tool pair (`tool-pwsh` on win32, `tool-bash` elsewhere) as the plugin's input. Do not statically flip it to `tool-bash`: on a Windows profile without the Git Bash executor, the bash tool would dispatch to the pwsh executor — the mismatch this bundle avoids. Hosts without the plugin are outside the verified scope.

## Daily execution boundaries

Daily work uses minimal sufficient verification: inspect docs/comments/text edits; use one existing targeted check for a small fix; run one most relevant build or test for a normal feature; add only genuinely necessary checks for high-risk work; follow an explicit user request for full tests. Do not default to new smoke scripts, full suites, repeated builds, new test frameworks/dependencies, unrelated checks or large reports. When a temporary verification file is unavoidable, put it in the OS temp directory and remove it before finishing; never leave it in the business project, hide it via `.gitignore`, use `git clean`/wildcard deletion, or delete pre-existing user files or legitimate build output. Reviewer and Lead do not rerun checks whose evidence remains valid. Essential verification for security/data-integrity work is not optional, and unrun checks must be reported honestly.

These are prompt-level behavioral rules, not host enforcement; host permissions and user approval remain the final boundary.

Tool access no longer distinguishes roles. Every preset can read, write, edit and run the platform shell; Planner, Reviewer, Mentor, Lead, Curator and Git Operator stay within their prompts by discipline, not by missing tools. This is not system-level isolation. The shell itself can modify files and run Git, and on Windows the third-party Git Bash executor may run confined shell calls under different effective sandbox semantics (the plugin reports this), while file tools remain under the host sandbox policy. The user's DSH permission mode and approval still apply, and prompts cannot guarantee that a model never oversteps.

## Development and verification

Test code and its runners have been removed from this repository. Historical verification notes remain in [validation](docs/validation.md); [architecture](docs/architecture.md) describes the workflow boundaries.

This is prompt-driven coordination, not a hardened permission system. The supported Desktop/Web composition disables base-global model tools and lets presets own their surfaces. A bare base host or additional globally registered tools can expose extra capabilities and is outside this tool-boundary guarantee. All seven presets now expose mutation and shell tools; role boundaries require correct model behavior and host permissions, and prompts are not an OS sandbox. No real-model behavioral acceptance is claimed.

## References

- [Official repository](https://github.com/deepseek-ai/deepseek-harness)
- [Plugin publishing](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
- [Agent Preset](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/README.md)
- [Subagent mechanism](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/subagent/README.md)
- [Delegation tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/subagent/tool-subagent/README.md)
- [Tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)
- [Subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)

Current master references can change; the installed desktop build above is the implementation baseline. License has not been selected; the package is marked UNLICENSED pending a release decision.
