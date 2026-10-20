// Generated; edit src/ and run scripts/build.mjs.
(() => {
  // src/history-view.js
  function createHistoryBrowser(React, read) {
    const { createElement: h, useState, useEffect, useRef } = React;
    return function HistoryBrowser({ sessionId, branch, onBranch, selected, onSelect, revision }) {
      const [query, setQuery] = useState(""), [draft, setDraft] = useState(""), [state, setState] = useState(), [error, setError] = useState(""), [loading, setLoading] = useState(false);
      const request = useRef(), current = useRef(), loadMore = useRef();
      const key = JSON.stringify([sessionId, branch, query, revision]);
      useEffect(() => {
        let disposed = false;
        current.current = void 0;
        setState(void 0);
        setError("");
        const load = async (more = false) => {
          if (request.current || more && !current.current?.hasMore) return;
          const abort = new AbortController();
          request.current = abort;
          setLoading(true);
          const previous = current.current;
          try {
            const result = await read("history", { sessionId, branch, query, offset: String(more ? previous.nextOffset : 0), tip: more ? previous.tip : "" }, abort.signal);
            if (disposed) return;
            const commits = more ? [...previous.commits, ...result.commits] : result.commits;
            const next = { ...result, commits: [...new Map(commits.map((commit) => [commit.hash, commit])).values()] };
            current.current = next;
            setState(next);
            setError("");
          } catch (error2) {
            if (!disposed && !abort.signal.aborted) setError(error2.message);
          } finally {
            if (request.current === abort) request.current = void 0;
            if (!disposed) setLoading(false);
          }
        };
        loadMore.current = () => load(true);
        void load();
        return () => {
          disposed = true;
          request.current?.abort();
          request.current = void 0;
        };
      }, [key]);
      return h(
        "div",
        { className: "dtd-history" },
        h(
          "div",
          { className: "dtd-history-controls" },
          h("label", null, "历史分支 ", h(
            "select",
            { value: branch, onChange: (event) => onBranch(event.target.value) },
            h("option", { value: "HEAD" }, "当前分支 (HEAD)"),
            (state?.branches ?? (branch === "HEAD" ? [] : [branch])).map((name) => h("option", { key: name, value: name }, name))
          )),
          h("form", { onSubmit: (event) => {
            event.preventDefault();
            setQuery(draft.trim());
          } }, h("input", { type: "search", value: draft, maxLength: 200, placeholder: "搜索 Hash / 提交信息", "aria-label": "搜索提交", onChange: (event) => setDraft(event.target.value) }), h("button", { type: "submit" }, "搜索"))
        ),
        h(
          "div",
          { className: "dtd-commit-list", onScroll: (event) => {
            const target = event.currentTarget;
            if (target.scrollHeight - target.scrollTop - target.clientHeight < 50 && !error) void loadMore.current?.();
          } },
          h("ul", { "aria-label": "提交历史" }, (state?.commits ?? []).map((commit) => h("li", { key: commit.hash }, h(
            "button",
            { type: "button", className: `dtd-commit-row ${selected === commit.hash ? "dtd-selected" : ""}`, title: commit.hash, onClick: () => onSelect(commit.hash) },
            h("span", { className: "dtd-commit-subject" }, commit.subject || "（无标题）"),
            h("span", { className: "dtd-commit-meta" }, h("code", null, commit.hash.slice(0, 10)), ` · ${commit.author} · ${new Date(commit.date).toLocaleString()}`)
          )))),
          !loading && !error && state?.commits.length === 0 && h("p", { className: "dtd-muted" }, "没有匹配的提交"),
          error && h("p", { role: "alert" }, error),
          loading && h("p", { role: "status" }, "正在读取提交…"),
          state?.hasMore && h("button", { type: "button", disabled: loading, onClick: () => loadMore.current?.() }, loading ? "正在加载…" : "加载更多")
        )
      );
    };
  }

  // src/views.js
  var api = (kind, params) => `api/task-diff.${kind}?${new URLSearchParams(params)}`;
  var noop = () => {
  };
  var states = { tracking: "正在记录", settled: "本轮已结束", interrupted: "恢复的历史快照", incomplete: "记录不完整", missing: "等待新任务", ready: "已更新" };
  function createViews(React, ctx, open) {
    const { createElement: h, useState, useEffect, useCallback, useMemo } = React;
    class NativeBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch() {
        console.warn("[dsh-task-diff-review] native ReviewTab contract is incompatible");
      }
      render() {
        return this.state.failed ? h("p", { className: "dtd-message", role: "alert" }, "原生 Diff 组件与当前版本不兼容。统计仍可查看，请升级插件后重开标签。") : this.props.children;
      }
    }
    const pending = /* @__PURE__ */ new Map(), cached = /* @__PURE__ */ new Map(), selections = /* @__PURE__ */ new Map();
    const read = async (kind, params, signal) => {
      const response = await fetch(api(kind, params), { signal, cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `读取失败 (${response.status})`);
      return body;
    };
    const HistoryBrowser = createHistoryBrowser(React, read);
    function useSummary(sessionId, mode = "task", base = "", taskId = "", commit = "", parent = 0) {
      const [state, setState] = useState(), [error, setError] = useState(""), [revision, setRevision] = useState(0);
      const key = JSON.stringify([sessionId, mode, base, taskId, commit, parent]);
      const value = state?.key === key ? state.value : cached.get(key);
      useEffect(() => {
        let disposed = false, timer;
        setState({ key, value: cached.get(key) });
        setError("");
        if (mode === "commits" && !commit) return;
        const load = async () => {
          try {
            if (!pending.has(key)) pending.set(key, read("summary", { sessionId, mode, base, taskId, commit, parent: String(parent) }).finally(() => pending.delete(key)));
            const result = await pending.get(key);
            cached.set(key, result);
            while (cached.size > 30) cached.delete(cached.keys().next().value);
            if (!disposed) {
              setState({ key, value: result });
              setError("");
            }
          } catch (err) {
            if (!disposed) setError(err.message);
          }
          if (!disposed && !document.hidden && mode !== "commits") timer = setTimeout(load, mode === "task" ? 4e3 : 1e4);
        };
        const visible = () => {
          if (!document.hidden) {
            clearTimeout(timer);
            void load();
          }
        };
        document.addEventListener("visibilitychange", visible);
        void load();
        return () => {
          disposed = true;
          clearTimeout(timer);
          document.removeEventListener("visibilitychange", visible);
        };
      }, [key, revision]);
      const refresh = useCallback(async () => {
        try {
          if (mode !== "commits" || commit) await read("refresh", { sessionId, mode, base, taskId, commit, parent: String(parent) });
          setRevision((value2) => value2 + 1);
        } catch (error2) {
          setError(error2.message);
        }
      }, [key]);
      return { value, error, refresh };
    }
    const counts = (value) => h(
      "span",
      { className: "dtd-counts", title: "可计算的文本行；二进制和过大文件不提供行数" },
      h("span", { className: "dtd-added" }, `+${value?.added ?? 0}`),
      " ",
      h("span", { className: "dtd-deleted" }, `−${value?.deleted ?? 0}`),
      value?.files?.some((file) => file.binary || file.oversized) && h("span", { className: "dtd-muted" }, "文本行")
    );
    const fileCount = (file) => file.binary ? h("span", { className: "dtd-muted" }, "二进制") : file.oversized ? h("span", null, "过大") : counts(file);
    function FileList({ value, select, selected }) {
      return h("ul", { className: "dtd-files", "aria-label": "改动文件" }, value.files.map((file, index) => h(
        "li",
        { key: `${file.repository}:${file.relative}` },
        h(
          "button",
          { type: "button", className: `dtd-file ${selected === index ? "dtd-selected" : ""}`, title: file.path, onClick: () => select(index) },
          h("span", { className: `dtd-status dtd-status-${file.status}`, "aria-label": { M: "修改", A: "新增", D: "删除", R: "重命名" }[file.status] || file.status }, { M: "● M", A: "+ A", D: "− D", R: "↔ R" }[file.status] || file.status),
          h("span", { className: "dtd-path" }, file.untracked ? file.display.replace(/^\[未跟踪\] /, "") : file.display),
          file.untracked && h("span", { className: "dtd-untracked" }, "未跟踪"),
          fileCount(file)
        )
      )));
    }
    function Warnings({ value }) {
      if (!value?.warnings?.length) return null;
      return h(
        "details",
        { className: "dtd-coverage" },
        h("summary", null, value.warnings.length > 1 ? "覆盖范围有限 · 查看说明" : "覆盖范围与归属说明"),
        h("ul", null, value.warnings.map((warning, index) => h("li", { key: index }, warning)))
      );
    }
    function Dock({ sessionId }) {
      const { value, error, refresh } = useSummary(sessionId);
      const [expanded, setExpanded] = useState(false);
      return h(
        "section",
        { className: "dtd-root dtd-dock", "aria-label": "本轮代码改动" },
        h(
          "div",
          { className: "dtd-heading" },
          h(
            "button",
            { type: "button", className: "dtd-disclosure", "aria-expanded": expanded, onClick: () => setExpanded(!expanded) },
            h("span", { "aria-hidden": true }, expanded ? "⌄" : "›"),
            ` ${value?.warnings?.length > 1 ? "已覆盖 " : ""}${value?.total ?? 0} 个文件`,
            counts(value)
          ),
          h("span", { className: "dtd-muted", role: "status" }, error || (value?.warnings?.length > 1 ? "覆盖有限 · " : "") + (states[value?.status] || "正在读取…")),
          h("button", { type: "button", onClick: () => open(sessionId) }, "查看全部改动")
        ),
        expanded && h(
          React.Fragment,
          null,
          value && h(FileList, { value, select: (index) => open(sessionId, index) }),
          h(Warnings, { value }),
          h("button", { type: "button", onClick: refresh }, "刷新")
        )
      );
    }
    function Review(props) {
      const { tab } = props.useTabInfo();
      const sessionId = useMemo(() => {
        try {
          return decodeURIComponent(tab.contentId.split("/session/")[1]);
        } catch {
          return props.sessionId;
        }
      }, [tab.contentId]);
      const selectionKey = `${sessionId}:${tab.id}`, remembered = selections.get(selectionKey);
      const [mode, setMode] = useState(remembered?.mode ?? "task"), [base, setBase] = useState(remembered?.base ?? ""), [taskId, setTaskId] = useState(remembered?.taskId ?? "");
      const [historyBranch, setHistoryBranch] = useState(remembered?.historyBranch ?? "HEAD"), [commit, setCommit] = useState(remembered?.commit ?? ""), [parent, setParent] = useState(remembered?.parent ?? 0);
      const [historyRevision, setHistoryRevision] = useState(0);
      const { value, error, refresh } = useSummary(sessionId, mode, base, taskId, mode === "commits" ? commit : "", mode === "commits" ? parent : 0);
      const [choices, setChoices] = useState(remembered?.choices ?? { index: 0, split: false, wrap: false, navigated: -1 });
      const [diffState, setDiffState] = useState(), [diffRevision, setDiffRevision] = useState(0);
      const index = value?.files[choices.index] ? choices.index : 0;
      const requestKey = `${value?.token}:${index}`;
      const diff = diffState?.key === requestKey ? diffState.value : "loading";
      useEffect(() => {
        selections.set(selectionKey, { mode, base, taskId, choices, historyBranch, commit, parent });
        while (selections.size > 100) selections.delete(selections.keys().next().value);
      }, [selectionKey, mode, base, taskId, choices, historyBranch, commit, parent]);
      useEffect(() => {
        if (choices.navigated === tab.navigation.revision) return;
        const params = tab.navigation.params;
        if (params?.mode === "task") {
          setMode("task");
          setTaskId(params.taskId ?? "");
        }
        setChoices((value2) => ({ ...value2, index: params?.index ?? value2.index, navigated: tab.navigation.revision }));
      }, [tab.id, tab.navigation.revision]);
      useEffect(() => {
        if (!value?.token || !value.files[index]) {
          setDiffState({ key: requestKey, value: "missing" });
          return;
        }
        const abort = new AbortController();
        setDiffState({ key: requestKey, value: "loading" });
        void read("diff", { sessionId, token: value.token, index: String(index) }, abort.signal).then((diff2) => {
          if (!abort.signal.aborted) setDiffState({ key: requestKey, value: diff2 });
        }).catch(() => {
          if (!abort.signal.aborted) setDiffState({ key: requestKey, value: "error" });
        });
        return () => abort.abort();
      }, [sessionId, value?.token, index, diffRevision]);
      const original = ctx.slots.entries("sidebar.right.pane.tab").find((entry) => entry.options.key === "@deepseek-ai/dsh-client-ui-deliverables");
      const nativeActions = useMemo(() => ({
        navigated: (_id, revision, index2) => setChoices((value2) => ({ ...value2, navigated: revision, index: index2 })),
        selected: (_id, index2) => setChoices((value2) => ({ ...value2, index: index2 })),
        toggledSplit: () => setChoices((value2) => ({ ...value2, split: !value2.split })),
        toggledWrap: () => setChoices((value2) => ({ ...value2, wrap: !value2.wrap })),
        forget: noop
      }), []);
      const changeMode = (next) => {
        setMode(next);
        setChoices((value2) => ({ ...value2, index: 0 }));
      };
      const nativeTab = {
        ...tab,
        contentId: `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/0/${Math.max(1, value?.turn ?? 1)}`,
        navigation: { ...tab.navigation, params: { index } }
      };
      const summaryKey = `api/changes.summary?${new URLSearchParams({ sessionId, seq: "0" })}`;
      const diffKey = `api/changes.diff?${new URLSearchParams({ sessionId, seq: "0", index: String(index) })}`;
      return h(
        "section",
        { className: `dtd-root dtd-review${mode === "commits" ? " dtd-review-commits" : ""}` },
        h(
          "div",
          { className: "dtd-toolbar" },
          h(
            "div",
            { role: "group", "aria-label": "改动范围", className: "dtd-scopes" },
            [["task", "本轮对话"], ["uncommitted", "未提交"], ["staged", "暂存 Staged"], ["unstaged", "未暂存 Unstaged"], ["branch", "分支对比"], ["commits", "历史提交 Commits"]].map(([key, label]) => h("button", { key, type: "button", "aria-pressed": mode === key, onClick: () => changeMode(key) }, label))
          ),
          h("button", { type: "button", onClick: () => {
            void refresh();
            if (mode === "commits") setHistoryRevision((value2) => value2 + 1);
          } }, "刷新")
        ),
        mode === "commits" && h(HistoryBrowser, {
          sessionId,
          branch: historyBranch,
          revision: historyRevision,
          selected: commit,
          onBranch: (branch) => {
            setHistoryBranch(branch);
            setCommit("");
            setParent(0);
            setChoices((value2) => ({ ...value2, index: 0 }));
          },
          onSelect: (hash) => {
            setCommit(hash);
            setParent(0);
            setChoices((value2) => ({ ...value2, index: 0 }));
          }
        }),
        mode === "commits" && value?.commit && h(
          "div",
          { className: "dtd-commit-detail" },
          h("strong", null, value.commit.subject || "（无标题）"),
          h("code", { className: "dtd-commit-hash" }, value.commit.hash),
          h("p", { className: "dtd-commit-meta" }, `${value.commit.author} · ${new Date(value.commit.date).toLocaleString()}`),
          h("details", null, h("summary", null, "完整提交说明"), h("pre", null, value.commit.body)),
          value.commit.parents.length > 1 && h("label", null, "对比父提交 ", h(
            "select",
            { value: parent, onChange: (event) => {
              setParent(Number(event.target.value));
              setChoices((value2) => ({ ...value2, index: 0 }));
            } },
            value.commit.parents.map((hash, index2) => h("option", { key: hash, value: index2 }, `父提交 ${index2 + 1} · ${hash}`))
          ))
        ),
        mode === "branch" && h("label", { className: "dtd-options" }, "基准分支 ", h("select", { value: base || value?.base || "", onChange: (event) => {
          setBase(event.target.value);
          setChoices((value2) => ({ ...value2, index: 0 }));
        } }, (value?.branches ?? []).map((branch) => h("option", { key: branch, value: branch }, branch)))),
        mode === "task" && Boolean(value?.histories?.length) && h("label", { className: "dtd-options" }, "任务 ", h("select", { value: taskId || value.taskId, onChange: (event) => {
          setTaskId(event.target.value);
          setChoices((value2) => ({ ...value2, index: 0 }));
        } }, value.histories.map((task) => h("option", { key: task.id, value: task.id }, `${new Date(task.started).toLocaleString()} · ${states[task.status] || task.status}`)))),
        h("div", { className: "dtd-totals", role: "status" }, error || (mode === "commits" && !commit ? "选择一个提交查看详情与文件 Diff" : value ? `${value.total} 个文件 · ${states[value.status] || value.status}` : "正在读取…"), !error && (mode !== "commits" || commit) && counts(value)),
        h(Warnings, { value }),
        value && value.files.length > 0 && h(FileList, { value, selected: index, select: (index2) => setChoices((value2) => ({ ...value2, index: index2 })) }),
        value?.files[index] && h("div", { className: "dtd-fullpath", title: value.files[index].path }, value.files[index].path),
        mode === "commits" && !commit ? null : original?.component && !error ? h("div", { className: "dtd-native" }, h(NativeBoundary, null, h(original.component, {
          ...props,
          sessionId,
          useTabInfo: () => ({ tab: nativeTab }),
          useStore: (selector) => selector({ byTab: { [tab.id]: choices } }),
          actions: nativeActions,
          useChangesSummary: (selector) => selector({ [summaryKey]: value || "loading" }),
          useChangesDiff: (selector) => selector({ [diffKey]: diff }),
          usePresentedHost: (selector) => selector({ available: false }),
          usePresentedOpen: (selector) => selector({}),
          loadChangesSummary: noop,
          loadChangesDiff: () => setDiffRevision((value2) => value2 + 1),
          reloadPresentedHost: noop,
          openChanged: noop,
          t: ctx.locale.bind(original.locale || "deliverables"),
          renderSlot: () => null
        }))) : h("p", { className: "dtd-message" }, error || "当前 DSH 未提供兼容的原生 Diff 组件，请核对版本；不会替换或劫持原生审查页面。")
      );
    }
    return { Dock, Review };
  }

  // src/style.css
  var style_default = ".dtd-root{font:inherit;color:inherit;min-width:0;font-size:12px;--dtd-green:light-dark(#18733c,#78d69b);--dtd-red:light-dark(#b32b36,#ff939c);--dtd-border:color-mix(in srgb,currentColor 13%,transparent)}\n.dtd-root button,.dtd-root select{font:inherit;color:inherit;border:1px solid transparent;border-radius:5px;background:transparent;cursor:pointer;padding:4px 7px}\n.dtd-root button:hover,.dtd-root button:focus-visible{background:color-mix(in srgb,currentColor 7%,transparent)}\n.dtd-root button:focus-visible,.dtd-root select:focus-visible{outline:2px solid Highlight;outline-offset:1px}\n.dtd-dock{border:1px solid var(--dtd-border);border-radius:9px;margin:0 0 6px;padding:5px 7px;background:color-mix(in srgb,currentColor 2%,transparent)}\n.dtd-heading,.dtd-disclosure,.dtd-toolbar,.dtd-counts,.dtd-totals{display:flex;align-items:center;gap:9px;min-width:0}\n.dtd-heading{flex-wrap:wrap}.dtd-heading>.dtd-muted{flex:1;font-size:11px}.dtd-counts{gap:6px;font-variant-numeric:tabular-nums;white-space:nowrap}\n.dtd-added,.dtd-status-A{color:var(--dtd-green)}.dtd-deleted,.dtd-status-D{color:var(--dtd-red)}.dtd-status-M{color:light-dark(#996200,#e9c36b)}.dtd-status-R{color:light-dark(#2764a3,#88bafa)}\n.dtd-muted{opacity:.65}.dtd-files{list-style:none;margin:4px 0;padding:0;overflow:auto;max-height:200px}.dtd-file{width:100%;display:flex;gap:9px;align-items:center;text-align:left}.dtd-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dtd-status{flex-shrink:0;width:30px;font-size:10px}.dtd-selected{background:color-mix(in srgb,currentColor 8%,transparent)!important}\n.dtd-review{height:100%;display:flex;flex-direction:column;overflow:hidden}.dtd-toolbar{justify-content:space-between;flex-wrap:wrap;padding:9px;border-bottom:1px solid var(--dtd-border)}.dtd-scopes{display:flex;gap:2px}.dtd-scopes [aria-pressed=true]{border-color:var(--dtd-border);background:color-mix(in srgb,currentColor 8%,transparent)}\n.dtd-options,.dtd-totals{padding:6px 12px}.dtd-options select{max-width:80%;background:Canvas;color:CanvasText;border-color:var(--dtd-border)}.dtd-totals{justify-content:space-between}.dtd-review>.dtd-files{max-height:170px;margin:0 7px;flex-shrink:0}\n.dtd-coverage{padding:4px 10px;font-size:11px;opacity:.75;flex-shrink:0;max-height:130px;overflow:auto}.dtd-coverage summary{cursor:pointer}.dtd-coverage ul{padding-left:17px;margin:5px 0}.dtd-coverage li{margin:4px 0;overflow-wrap:anywhere}\n.dtd-fullpath{padding:7px 12px;font-size:11px;overflow-wrap:anywhere;max-height:65px;overflow:auto;opacity:.7;border-bottom:1px solid var(--dtd-border)}.dtd-native{flex:1;min-height:0;overflow:auto}.dtd-native>div{height:100%;min-height:150px}.dtd-message{padding:12px}\n.dtd-scopes{flex-wrap:wrap}.dtd-untracked{font-size:10px;opacity:.65;white-space:nowrap}.dtd-history{padding:7px 12px;border-bottom:1px solid var(--dtd-border);flex-shrink:0;min-height:0}.dtd-history-controls{display:flex;gap:7px;flex-wrap:wrap}.dtd-history-controls form{display:flex;gap:4px;flex:1;min-width:170px}.dtd-history-controls input{font:inherit;background:Canvas;color:CanvasText;border:1px solid var(--dtd-border);border-radius:5px;padding:5px;min-width:0;width:100%}.dtd-history select,.dtd-commit-detail select{font:inherit;max-width:100%;background:Canvas;color:CanvasText;border:1px solid var(--dtd-border)}\n.dtd-commit-list{max-height:200px;overflow:auto;margin-top:5px}.dtd-commit-list ul{list-style:none;margin:0;padding:0}.dtd-commit-list p{margin:5px 0}.dtd-commit-row{display:flex;flex-direction:column;width:100%;text-align:left;gap:3px}.dtd-commit-subject{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}.dtd-commit-meta{font-size:11px;opacity:.65;overflow-wrap:anywhere}.dtd-commit-detail{padding:8px 12px;max-height:170px;overflow:auto;flex-shrink:0;border-bottom:1px solid var(--dtd-border)}.dtd-commit-hash{display:block;font-size:11px;overflow-wrap:anywhere;margin-top:5px}.dtd-commit-detail pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}.dtd-commit-detail summary{cursor:pointer}\n.dtd-review-commits{overflow:auto}.dtd-review-commits>.dtd-native{flex:1 0 200px}.dtd-history-controls input:focus-visible{outline:2px solid Highlight;outline-offset:1px}.dtd-root button:disabled{opacity:.5;cursor:default}\n";

  // locale/zh.json
  var zh_default = {
    meta: {
      title: "代码改动概览与审查",
      description: "本轮及子代理改动概览，支持未提交、暂存、未暂存、分支和历史提交的原生 Diff 审查。"
    }
  };

  // locale/en.json
  var en_default = {
    meta: {
      title: "Task Changes & Git Review",
      description: "Native Diff review for tasks, working changes, staged, unstaged, branches and commit history."
    }
  };

  // src/client.js
  window.__ModuleLoader__.load({
    id: "dsh-task-diff-review",
    factory: (require2) => {
      const React = require2("react");
      return {
        inject: ["slots", "locale", "sidebarRight", "sidebarRightTabs"],
        apply(ctx) {
          ctx.effect(() => ctx.locale.register("dsh-task-diff-review", { zh: zh_default, en: en_default }));
          ctx.effect(() => {
            const style = document.createElement("style");
            style.textContent = style_default;
            document.head.append(style);
            return () => style.remove();
          });
          const open = (sessionId, index = 0) => ctx.sidebarRight.openResource(`dsh-resource://task-diff-review/session/${encodeURIComponent(sessionId)}`, {
            kind: "task-diff-review",
            preferNewPane: false,
            revealIfOpened: true,
            params: { index, mode: "task", taskId: "" }
          });
          const views = createViews(React, ctx, open);
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: "dsh-task-diff-review",
            kind: "task-diff-review",
            patterns: ["dsh-resource://task-diff-review/session/**"],
            canOpen: (value) => /^dsh-resource:\/\/task-diff-review\/session\/[^/?#]+$/.test(value),
            title: () => "代码改动审查"
          }));
          ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "dsh-task-diff-review" }, views.Dock));
          ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: "dsh-task-diff-review" }, views.Review));
        }
      };
    }
  });
})();
