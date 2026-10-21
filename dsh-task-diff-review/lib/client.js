// Generated; edit src/ and run scripts/build.mjs.
(() => {
  // src/refresh.js
  var listeners = /* @__PURE__ */ new Set();
  var subscribeGitRefresh = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  var refreshGitViews = () => {
    for (const listener of listeners) listener();
  };

  // src/icons.js
  function createIcons(React) {
    const h = React.createElement;
    const IconBranch = ({ size = 14 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", className: "dtd-svg-icon" },
      h("circle", { cx: 4, cy: 4, r: 2 }),
      h("circle", { cx: 4, cy: 12, r: 2 }),
      h("circle", { cx: 12, cy: 7, r: 2 }),
      h("path", { d: "M4 6v4M4 8.5C6 8.5 7.5 7 10 7" })
    );
    const IconChevron = ({ size = 12, className = "" }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", className: `dtd-svg-chevron ${className}` },
      h("path", { d: "M3 4.5L6 7.5L9 4.5" })
    );
    const IconChevronRight = ({ size = 12, className = "" }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", className: `dtd-svg-chevron-right ${className}` },
      h("path", { d: "M4.5 3L7.5 6L4.5 9" })
    );
    const IconClose = ({ size = 12 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", className: "dtd-svg-icon" },
      h("path", { d: "M2.5 2.5l7 7M9.5 2.5l-7 7" })
    );
    const IconCheck = ({ size = 12 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className: "dtd-svg-icon" },
      h("path", { d: "M2.5 6.5l2.5 2.5 4.5-5" })
    );
    const IconRefresh = ({ size = 13 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", className: "dtd-svg-icon" },
      h("path", { d: "M2.5 8a5.5 5.5 0 0 1 9.3-3.9L13.5 6M13.5 2v4h-4M13.5 8a5.5 5.5 0 0 1-9.3 3.9L2.5 10M2.5 14v-4h4" })
    );
    const IconInfo = ({ size = 13 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", className: "dtd-svg-icon" },
      h("circle", { cx: 8, cy: 8, r: 6.5 }),
      h("path", { d: "M8 7v4.5M8 4.75v.5" })
    );
    const IconSparkles = ({ size = 13 }) => h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", className: "dtd-svg-icon" },
      h("path", { d: "M8 1.5l1.5 3.8 3.8 1.5-3.8 1.5L8 12.1 6.5 8.3 2.7 6.8l3.8-1.5L8 1.5z" })
    );
    return { IconBranch, IconChevron, IconChevronRight, IconClose, IconCheck, IconRefresh, IconInfo, IconSparkles };
  }

  // src/views.js
  var api = (kind, params) => `api/task-diff.${kind}?${new URLSearchParams(params)}`;
  var noop = () => {
  };
  var states = { tracking: "正在记录", settled: "本轮已结束", interrupted: "恢复的历史快照", incomplete: "记录不完整", missing: "等待新任务", ready: "已更新" };
  var scopes = [["task", "本轮对话"], ["uncommitted", "未提交"], ["unstaged", "未暂存"], ["staged", "已暂存"], ["commits", "历史提交"], ["branch", "分支对比"]];
  var emptyStates = { task: "本轮尚无代码改动", uncommitted: "没有未提交的改动", unstaged: "没有未暂存的改动", staged: "暂存区没有改动", commits: "此提交没有文件差异", branch: "当前分支相对基准没有改动" };
  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(dateStr).toLocaleDateString();
  }
  function createViews(React, ctx, open) {
    const { createElement: h, useState, useEffect, useCallback, useMemo, useRef } = React;
    const { IconChevron, IconChevronRight, IconCheck, IconRefresh, IconInfo } = createIcons(React);
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
    function useSummary(sessionId, mode = "task", base = "", taskId = "", commit = "", parent = 0) {
      const [state, setState] = useState(), [error, setError] = useState(""), [revision, setRevision] = useState(0);
      const key = JSON.stringify([sessionId, mode, base, taskId, commit, parent]);
      const value = state?.key === key ? state.value : cached.get(key);
      useEffect(() => subscribeGitRefresh(() => {
        cached.clear();
        pending.clear();
        setRevision((v) => v + 1);
      }), []);
      useEffect(() => {
        let disposed = false, timer, loading = false;
        setState({ key, value: cached.get(key) });
        setError("");
        if (mode === "commits" && !commit) return;
        const load = async () => {
          if (disposed || loading) return;
          loading = true;
          try {
            if (!pending.has(key)) {
              const task = read("summary", { sessionId, mode, base, taskId, commit, parent: String(parent) });
              pending.set(key, task);
              void task.finally(() => {
                if (pending.get(key) === task) pending.delete(key);
              }).catch(() => {
              });
            }
            const result = await pending.get(key);
            cached.set(key, result);
            while (cached.size > 30) cached.delete(cached.keys().next().value);
            if (!disposed) {
              setState({ key, value: result });
              setError("");
            }
          } catch (err) {
            if (!disposed) setError(err.message);
          } finally {
            loading = false;
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
          setRevision((v) => v + 1);
        } catch (err) {
          setError(err.message);
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
          h("span", { className: `dtd-status dtd-status-${file.status}`, "aria-label": { M: "修改", A: "新增", D: "删除", R: "重命名" }[file.status] || file.status }, { M: "M", A: "A", D: "D", R: "R" }[file.status] || file.status),
          h("span", { className: "dtd-path" }, file.untracked ? file.display.replace(/^\[未跟踪\] /, "") : file.display),
          file.untracked && h("span", { className: "dtd-untracked" }, "未跟踪"),
          fileCount(file)
        )
      )));
    }
    function Dock({ sessionId }) {
      const { value, error, refresh } = useSummary(sessionId);
      const [expanded, setExpanded] = useState(false);
      useEffect(() => {
        setExpanded(false);
      }, [sessionId, value?.taskId]);
      if (!value || value.total <= 0) return null;
      return h(
        "div",
        { className: "dtd-dock-seat" },
        h(
          "section",
          { className: "dtd-root dtd-dock-bar", "aria-label": "本轮代码改动" },
          h(
            "div",
            { className: "dtd-dock-bar-main" },
            // Left side: SVG Chevron + File count + Line counts
            h(
              "button",
              {
                type: "button",
                className: "dtd-dock-trigger",
                "aria-expanded": expanded,
                onClick: () => setExpanded(!expanded),
                title: expanded ? "折叠文件列表" : "展开文件列表"
              },
              h(IconChevronRight, { size: 12, className: `dtd-chevron-rotate ${expanded ? "is-expanded" : ""}` }),
              h("span", { className: "dtd-dock-files-label" }, `${value?.warnings?.length > 1 ? "已覆盖 " : ""}${value?.total ?? 0} 个文件`),
              counts(value)
            ),
            // Right side: Status indicator + Review button
            h(
              "div",
              { className: "dtd-dock-right" },
              h(
                "span",
                { className: "dtd-dock-status" },
                h("span", { className: "dtd-pulse-dot" }),
                error || (value?.warnings?.length > 1 ? "覆盖有限 · " : "") + (states[value?.status] || "正在读取…")
              ),
              h("button", { type: "button", className: "dtd-dock-open-btn", onClick: () => open(sessionId) }, "查看审查")
            )
          ),
          // Expanded file list drawer inside dock
          expanded && h(
            "div",
            { className: "dtd-dock-drawer" },
            value && h(FileList, { value, select: (index) => open(sessionId, index) }),
            h(
              "div",
              { className: "dtd-dock-drawer-foot" },
              h("button", { type: "button", className: "dtd-btn-compact", onClick: refresh }, "刷新")
            )
          )
        )
      );
    }
    function ScopeSelector({ mode, onSelectMode, commit, onSelectCommit, base, onSelectBase, value, sessionId, historyRevision }) {
      const [open2, setOpen] = useState(false);
      const [submenuOpen, setSubmenuOpen] = useState(false);
      const [flipLeft, setFlipLeft] = useState(false);
      const [commits, setCommits] = useState([]);
      const [loadingCommits, setLoadingCommits] = useState(false);
      const [search, setSearch] = useState("");
      const menuRef = useRef(null);
      const triggerRef = useRef(null);
      const hoverTimer = useRef(null);
      useEffect(() => {
        if (!open2 || !submenuOpen) return;
        const abort = new AbortController();
        setLoadingCommits(true);
        void read("history", { sessionId, branch: "HEAD", query: search, offset: "0", tip: "" }, abort.signal).then((result) => {
          if (!abort.signal.aborted) setCommits(result.commits || []);
        }).catch(() => {
          if (!abort.signal.aborted) setCommits([]);
        }).finally(() => {
          if (!abort.signal.aborted) setLoadingCommits(false);
        });
        return () => abort.abort();
      }, [open2, submenuOpen, search, historyRevision, sessionId]);
      useEffect(() => {
        if (!open2) setSubmenuOpen(false);
        return () => clearTimeout(hoverTimer.current);
      }, [open2]);
      useEffect(() => {
        if (!open2) return;
        const onMouseDown = (e) => {
          if (menuRef.current && !menuRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
            setOpen(false);
            setSubmenuOpen(false);
          }
        };
        const onKeyDown = (e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setSubmenuOpen(false);
          }
        };
        document.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
          document.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("keydown", onKeyDown, true);
        };
      }, [open2]);
      const handleHoverCommits = (enter) => {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        if (enter) {
          hoverTimer.current = setTimeout(() => {
            if (menuRef.current) {
              const rect = menuRef.current.getBoundingClientRect();
              setFlipLeft(rect.right + 340 > window.innerWidth - 12);
            }
            setSubmenuOpen(true);
          }, 120);
        } else {
          hoverTimer.current = setTimeout(() => {
            setSubmenuOpen(false);
          }, 200);
        }
      };
      const currentLabel = scopes.find((s) => s[0] === mode)?.[1] || "范围选择";
      const displayTitle = mode === "commits" && commit ? `历史提交 · ${commit.slice(0, 7)}` : mode === "branch" && base ? `分支 · ${base}` : currentLabel;
      return h(
        "div",
        { className: "dtd-scope-picker-wrap" },
        // Trigger Button (高 28px，圆角 6px，内联 SVG 下拉箭头)
        h(
          "button",
          {
            ref: triggerRef,
            type: "button",
            className: `dtd-scope-trigger ${open2 ? "dtd-scope-trigger-active" : ""}`,
            onClick: () => setOpen(!open2),
            title: "选择代码审查范围",
            "aria-expanded": open2
          },
          h("span", { className: "dtd-scope-trigger-label" }, displayTitle),
          value && h("span", { className: "dtd-scope-badge" }, counts(value)),
          h(IconChevron, { size: 12, className: `dtd-chevron-rotate ${open2 ? "is-expanded" : ""}` })
        ),
        // Cascading Menu
        open2 && h(
          "div",
          { ref: menuRef, className: "dtd-cascade-menu" },
          // Primary Menu (宽 160px)
          h(
            "div",
            { className: "dtd-menu-primary" },
            scopes.map(([key, label]) => {
              const isSelected = mode === key;
              const isCommits = key === "commits";
              return h(
                "div",
                {
                  key,
                  className: `dtd-menu-item ${isSelected ? "dtd-menu-item-active" : ""}`,
                  onClick: () => {
                    if (isCommits) {
                      setSubmenuOpen(true);
                    } else {
                      onSelectMode(key);
                      setOpen(false);
                      setSubmenuOpen(false);
                    }
                  },
                  onMouseEnter: () => isCommits ? handleHoverCommits(true) : handleHoverCommits(false),
                  onMouseLeave: () => isCommits ? handleHoverCommits(false) : null
                },
                h("span", { className: "dtd-menu-check" }, isSelected ? h(IconCheck, { size: 12 }) : null),
                h("span", { className: "dtd-menu-label" }, label),
                isCommits && h(IconChevronRight, { size: 11, className: "dtd-menu-arrow" })
              );
            })
          ),
          // Submenu: Commits (宽 340px，自适应防遮挡)
          submenuOpen && h(
            "div",
            {
              className: `dtd-submenu-panel ${flipLeft ? "dtd-submenu-left" : "dtd-submenu-right"}`,
              onMouseEnter: () => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current);
              },
              onMouseLeave: () => handleHoverCommits(false)
            },
            h(
              "div",
              { className: "dtd-submenu-search" },
              h("input", {
                type: "search",
                className: "dtd-search-input",
                value: search,
                placeholder: "搜索提交记录或 Hash...",
                autoFocus: true,
                onChange: (e) => setSearch(e.target.value)
              })
            ),
            h(
              "div",
              { className: "dtd-submenu-list" },
              loadingCommits && h("div", { className: "dtd-submenu-empty" }, "正在加载提交…"),
              !loadingCommits && commits.length === 0 && h("div", { className: "dtd-submenu-empty" }, "未找到匹配提交"),
              commits.map((c) => h(
                "div",
                {
                  key: c.hash,
                  className: `dtd-commit-item ${commit === c.hash ? "dtd-commit-item-selected" : ""}`,
                  onClick: () => {
                    onSelectCommit(c.hash);
                    onSelectMode("commits");
                    setOpen(false);
                    setSubmenuOpen(false);
                  }
                },
                h("div", { className: "dtd-commit-subject" }, c.subject || "（无标题）"),
                h(
                  "div",
                  { className: "dtd-commit-meta-line" },
                  h("code", { className: "dtd-hash-code" }, c.hash.slice(0, 7)),
                  h("span", { className: "dtd-muted" }, ` · ${c.author}`),
                  h("span", { className: "dtd-muted" }, ` · ${timeAgo(c.date)}`)
                )
              ))
            )
          )
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
      const [mode, setMode] = useState(remembered?.mode ?? "task");
      const [base, setBase] = useState(remembered?.base ?? "");
      const [taskId, setTaskId] = useState(remembered?.taskId ?? "");
      const [historyBranch, setHistoryBranch] = useState(remembered?.historyBranch ?? "HEAD");
      const [commit, setCommit] = useState(remembered?.commit ?? "");
      const [parent, setParent] = useState(remembered?.parent ?? 0);
      const [historyRevision, setHistoryRevision] = useState(0);
      const [infoOpen, setInfoOpen] = useState(false);
      useEffect(() => subscribeGitRefresh(() => setHistoryRevision((v) => v + 1)), []);
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
        setChoices((v) => ({ ...v, index: params?.index ?? v.index, navigated: tab.navigation.revision }));
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
        navigated: (_id, revision, idx) => setChoices((v) => ({ ...v, navigated: revision, index: idx })),
        selected: (_id, idx) => setChoices((v) => ({ ...v, index: idx })),
        toggledSplit: () => setChoices((v) => ({ ...v, split: !v.split })),
        toggledWrap: () => setChoices((v) => ({ ...v, wrap: !v.wrap })),
        forget: noop
      }), []);
      const changeMode = (next) => {
        setMode(next);
        setChoices((v) => ({ ...v, index: 0 }));
      };
      const nativeTab = {
        ...tab,
        contentId: `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/0/${Math.max(1, value?.turn ?? 1)}`,
        navigation: { ...tab.navigation, params: { index } }
      };
      const summaryKey = `api/changes.summary?${new URLSearchParams({ sessionId, seq: "0" })}`;
      const diffKey = `api/changes.diff?${new URLSearchParams({ sessionId, seq: "0", index: String(index) })}`;
      const uncapturedWarning = value?.warnings?.find((w) => w.includes("未捕获") || w.includes("大小限制"));
      return h(
        "section",
        { className: `dtd-root dtd-review${mode === "commits" ? " dtd-review-commits" : ""}` },
        // Single-line High-Density Toolbar (高 38px，严格单行)
        h(
          "div",
          { className: "dtd-toolbar-compact" },
          h(
            "div",
            { className: "dtd-toolbar-left" },
            h(ScopeSelector, {
              mode,
              onSelectMode: changeMode,
              commit,
              onSelectCommit: (hash) => {
                setCommit(hash);
                setParent(0);
                setChoices((v) => ({ ...v, index: 0 }));
              },
              base,
              onSelectBase: setBase,
              value,
              sessionId,
              historyRevision
            }),
            // Mini Task Round Selector (only for task mode with history)
            mode === "task" && Boolean(value?.histories?.length) && h("select", {
              className: "dtd-mini-select",
              value: taskId || value.taskId,
              onChange: (e) => {
                setTaskId(e.target.value);
                setChoices((v) => ({ ...v, index: 0 }));
              },
              title: "切换历史任务轮次"
            }, value.histories.map((t) => h("option", { key: t.id, value: t.id }, `${new Date(t.started).toLocaleTimeString()} · ${states[t.status] || t.status}`))),
            // Branch mode base picker
            mode === "branch" && h("select", {
              className: "dtd-mini-select",
              value: base || value?.base || "",
              onChange: (e) => {
                setBase(e.target.value);
                setChoices((v) => ({ ...v, index: 0 }));
              },
              title: "基准分支"
            }, (value?.branches ?? []).map((b) => h("option", { key: b, value: b }, b))),
            // File Summary
            value && !error && h(
              "span",
              { className: "dtd-file-summary" },
              h("span", null, `${value.total} 个文件`),
              counts(value)
            )
          ),
          h(
            "div",
            { className: "dtd-toolbar-right" },
            // Disclaimers Popover Button (ⓘ SVG)
            Boolean(value?.warnings?.length) && h(
              "div",
              { className: "dtd-info-popover-wrap" },
              h("button", {
                type: "button",
                className: "dtd-icon-btn dtd-info-trigger",
                title: "查看技术覆盖说明",
                onClick: () => setInfoOpen(!infoOpen)
              }, h(IconInfo, { size: 13 })),
              infoOpen && h(
                "div",
                { className: "dtd-info-popover" },
                h("div", { className: "dtd-info-popover-title" }, "覆盖范围与归属说明"),
                h("ul", { className: "dtd-info-list" }, value.warnings.map((w, i) => h("li", { key: i }, w)))
              )
            ),
            // Refresh Button (↻ SVG)
            h("button", {
              type: "button",
              className: "dtd-icon-btn",
              title: "刷新改动",
              onClick: () => {
                void refresh();
                if (mode === "commits") setHistoryRevision((v) => v + 1);
              }
            }, h(IconRefresh, { size: 13 }))
          )
        ),
        // Conditional slim warning alert for uncaptured/large files (26px)
        uncapturedWarning && h(
          "div",
          { className: "dtd-slim-warning-bar" },
          h("span", null, `⚠️ ${uncapturedWarning}`),
          h("button", { type: "button", className: "dtd-btn-link", onClick: () => setInfoOpen(true) }, "查看说明")
        ),
        // Commit Detail Bar (compact 1-2 lines for commits mode)
        mode === "commits" && value?.commit && h(
          "div",
          { className: "dtd-commit-bar" },
          h(
            "div",
            { className: "dtd-commit-bar-main" },
            h("strong", null, value.commit.subject || "（无标题）"),
            h("code", { className: "dtd-hash-code" }, value.commit.hash.slice(0, 10)),
            h("span", { className: "dtd-muted" }, `${value.commit.author} · ${new Date(value.commit.date).toLocaleTimeString()}`)
          ),
          value.commit.parents.length > 1 && h("select", {
            className: "dtd-mini-select",
            value: parent,
            onChange: (e) => {
              setParent(Number(e.target.value));
              setChoices((v) => ({ ...v, index: 0 }));
            }
          }, value.commit.parents.map((pHash, pIdx) => h("option", { key: pHash, value: pIdx }, `父 ${pIdx + 1}: ${pHash.slice(0, 7)}`)))
        ),
        // File List
        value && value.files.length > 0 && h(FileList, { value, selected: index, select: (idx) => setChoices((v) => ({ ...v, index: idx })) }),
        value?.files[index] && h("div", { className: "dtd-fullpath", title: value.files[index].path }, value.files[index].path),
        // Empty State
        value && value.files.length === 0 && !error && (mode !== "commits" || commit) && h("p", { className: "dtd-empty", role: "status" }, emptyStates[mode]),
        mode === "commits" && !commit && h("p", { className: "dtd-empty", role: "status" }, "点击上方「历史提交」选择要查看的 Commit 记录"),
        // Native Diff Viewer
        !value?.files.length || error ? null : original?.component ? h("div", { className: "dtd-native" }, h(NativeBoundary, null, h(original.component, {
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
          loadChangesDiff: () => setDiffRevision((v) => v + 1),
          reloadPresentedHost: noop,
          openChanged: noop,
          t: ctx.locale.bind(original.locale || "deliverables"),
          renderSlot: () => null
        }))) : h("p", { className: "dtd-message" }, error || "当前 DSH 未提供兼容的原生 Diff 组件。")
      );
    }
    return { Dock, Review };
  }

  // src/actions-view.js
  function createActionsPanel(React) {
    const { createElement: h, useState, useEffect, useRef, useCallback } = React;
    const { IconBranch, IconChevron, IconClose, IconSparkles } = createIcons(React);
    const request = async (kind, sessionId, data) => {
      const response = await fetch(kind === "status" ? `api/task-diff.git-status?${new URLSearchParams({ sessionId })}` : "api/task-diff.git-action", {
        method: kind === "status" ? "GET" : "POST",
        cache: "no-store",
        ...kind === "status" ? {} : { headers: { "content-type": "application/json", "x-dsh-git-action": "1" }, body: JSON.stringify({ ...data, sessionId }) }
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Git 请求失败 (${response.status})`);
      return result;
    };
    function Dialog({ title, close, busy, children }) {
      const ref = useRef();
      useEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
      }, []);
      return h(
        "dialog",
        { ref, className: "dtd-actions-dialog", "aria-label": title, onCancel: (event) => {
          event.preventDefault();
          if (!busy) close();
        } },
        h(
          "div",
          { className: "dtd-dialog-title" },
          h("strong", null, title),
          h("button", { type: "button", className: "dtd-dialog-close-btn", disabled: busy, onClick: close, "aria-label": "关闭窗口" }, h(IconClose, { size: 12 }))
        ),
        children
      );
    }
    function ActionsPanel({ sessionId }) {
      const [state, setState] = useState();
      const [error, setError] = useState("");
      const [statusError, setStatusError] = useState("");
      const [notice, setNotice] = useState("");
      const [expanded, setExpanded] = useState(false);
      const [selected, setSelected] = useState(/* @__PURE__ */ new Set());
      const [busy, setBusy] = useState(false);
      const [modal, setModal] = useState();
      const [message, setMessage] = useState("");
      const [remote, setRemote] = useState("");
      const [rightOffset, setRightOffset] = useState(0);
      const generation = useRef(0);
      const mounted = useRef(true);
      const dialogMessage = useRef("");
      const popoverRef = useRef(null);
      const acting = useRef(false);
      useEffect(() => {
        let sidebar, frame;
        const updateOffset = () => {
          frame = void 0;
          const next = document.querySelector("[data-sidebar-right-open]");
          if (next !== sidebar) {
            if (sidebar) ro.unobserve(sidebar);
            sidebar = next;
            if (sidebar) ro.observe(sidebar);
          }
          const rect = sidebar?.getBoundingClientRect();
          setRightOffset(rect && rect.width > 0 && rect.right >= window.innerWidth - 10 ? rect.width : 0);
        };
        const schedule = () => {
          if (frame === void 0) frame = requestAnimationFrame(updateOffset);
        };
        const ro = new ResizeObserver(schedule);
        const mo = new MutationObserver((records) => {
          if (records.some((record) => record.type === "attributes" || [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 && (node.matches("[data-sidebar-right-open]") || node.querySelector("[data-sidebar-right-open]"))))) schedule();
        });
        mo.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["data-sidebar-right-open"] });
        updateOffset();
        window.addEventListener("resize", schedule);
        return () => {
          ro.disconnect();
          mo.disconnect();
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", schedule);
        };
      }, []);
      useEffect(() => {
        if (!expanded) return;
        const onMouseDown = (event) => {
          if (popoverRef.current && !popoverRef.current.contains(event.target)) {
            setExpanded(false);
          }
        };
        const onKeyDown = (event) => {
          if (event.key === "Escape") {
            setExpanded(false);
          }
        };
        document.addEventListener("mousedown", onMouseDown);
        window.addEventListener("keydown", onKeyDown, true);
        return () => {
          document.removeEventListener("mousedown", onMouseDown);
          window.removeEventListener("keydown", onKeyDown, true);
        };
      }, [expanded]);
      const load = useCallback(async () => {
        const epoch = ++generation.current;
        try {
          const result = await request("status", sessionId);
          if (!mounted.current || epoch !== generation.current) return;
          setState(result);
          setStatusError("");
          setSelected((previous) => new Set([...previous].filter((path) => result.files?.some((file) => file.path === path))));
        } catch (error2) {
          if (mounted.current && epoch === generation.current) setStatusError(error2.message);
        }
      }, [sessionId]);
      useEffect(() => {
        mounted.current = true;
        let stopped = false, timer, polling = false;
        setState(void 0);
        setSelected(/* @__PURE__ */ new Set());
        setModal(void 0);
        setError("");
        setNotice("");
        const tick = async () => {
          if (stopped || polling) return;
          polling = true;
          try {
            await load();
          } finally {
            polling = false;
          }
          if (!stopped && !document.hidden) timer = setTimeout(tick, 5e3);
        };
        const visible = () => {
          if (!document.hidden) {
            clearTimeout(timer);
            void tick();
          }
        };
        const unsubscribe = subscribeGitRefresh(() => {
          void load();
        });
        document.addEventListener("visibilitychange", visible);
        void tick();
        return () => {
          stopped = true;
          mounted.current = false;
          generation.current++;
          clearTimeout(timer);
          unsubscribe();
          document.removeEventListener("visibilitychange", visible);
        };
      }, [sessionId, load]);
      const act = async (action, data = {}) => {
        if (acting.current || !mounted.current) return;
        acting.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        try {
          const result = await request("action", sessionId, { action, ...data });
          if (!mounted.current) return;
          if (["stage", "unstage", "commit", "push"].includes(action)) {
            setNotice(result.message);
            setSelected(/* @__PURE__ */ new Set());
            setModal(void 0);
            if (action === "commit") {
              setMessage("");
              dialogMessage.current = "";
              setExpanded(false);
            }
          }
          return result;
        } catch (error2) {
          if (mounted.current) setError(error2.message);
        } finally {
          acting.current = false;
          if (mounted.current) setBusy(false);
          if (["stage", "unstage", "commit", "push"].includes(action)) refreshGitViews();
        }
      };
      const openPush = () => {
        setRemote(remotes.some((item) => item.name === remote) ? remote : state?.defaultRemote || remotes[0]?.name || "");
        setModal({ kind: "push" });
        setError("");
        setNotice("");
      };
      const previewPush = async (name) => {
        setModal({ kind: "push" });
        const result = await act("preparePush", { remote: name });
        if (result) setModal({ kind: "push", ...result });
      };
      const changeRemote = (name) => {
        setRemote(name);
        setError("");
        setModal((previous) => previous?.kind === "push" ? { kind: "push" } : previous);
      };
      const select = (path) => setSelected((previous) => {
        const next = new Set(previous);
        next.has(path) ? next.delete(path) : next.add(path);
        return next;
      });
      const paths = [...selected];
      const enabled = state?.repository && !busy && !state.busy;
      const remotes = state?.remotes ?? [];
      const staged = state?.files?.filter((file) => file.staged) ?? [];
      const unstaged = state?.files?.filter((file) => file.unstaged) ?? [];
      const changeMessage = (value) => {
        setMessage(value);
        dialogMessage.current = value;
      };
      const generateAiMessage = async () => {
        if (!enabled || !staged.length) return;
        const prep = await act("prepareCommit");
        if (!prep?.ticket) return;
        const ticket = prep.ticket;
        const previous = dialogMessage.current;
        const result = await act("generate", { ticket });
        if (result && dialogMessage.current === previous) {
          changeMessage(result.message);
        }
      };
      const handleCommit = async () => {
        if (!enabled || !message.trim()) return;
        if (!staged.length) {
          if (unstaged.length) setModal({ kind: "stageCommit", version: state.version, files: unstaged.length });
          return;
        }
        const prep = await act("prepareCommit");
        if (prep) setModal({ kind: "commit", ...prep, message: message.trim() });
      };
      const confirmStageCommit = async () => {
        const result = await act("stage", { all: true, paths: [], version: modal.version });
        if (!result) return;
        const prep = await act("prepareCommit");
        if (prep) setModal({ kind: "commit", ...prep, message: message.trim() });
      };
      if (!state) return null;
      const renderFileInfo = (path) => {
        const idx = path.lastIndexOf("/");
        if (idx === -1) return { dir: "", file: path };
        return { dir: path.slice(0, idx + 1), file: path.slice(idx + 1) };
      };
      const errors = (error || statusError) && h("p", { className: "dtd-action-error", role: "alert" }, error || statusError);
      const stagedCount = staged.length;
      const totalChanges = state.files ? state.files.length : 0;
      let changesText = `${totalChanges} 项更改`;
      if (stagedCount > 0) {
        changesText = `已暂存 ${stagedCount}/${totalChanges}`;
      } else if (totalChanges === 0) {
        changesText = "干净";
      }
      return h(
        "div",
        {
          className: "dtd-actions-fixed-wrap",
          style: {
            position: "fixed",
            bottom: "14px",
            right: `calc(${rightOffset}px + 16px)`,
            zIndex: 90,
            pointerEvents: "none",
            transition: "right 0.2s ease-out"
          }
        },
        h(
          "div",
          { ref: popoverRef, className: "dtd-actions-container", style: { pointerEvents: "auto", position: "relative" } },
          // Floating pill status button (形态 B：高 32px，圆角 16px，使用 SVG 图标)
          h(
            "button",
            {
              type: "button",
              className: `dtd-status-pill ${expanded ? "dtd-status-pill-active" : ""}`,
              onClick: () => setExpanded(!expanded),
              title: "Git 状态 (点击打开操作面板)",
              "aria-expanded": expanded
            },
            h(IconBranch, { size: 14 }),
            h("span", { className: "dtd-pill-branch" }, state.repository ? state.branch || "Detached" : "非仓库"),
            h("span", { className: "dtd-pill-dot" }, "·"),
            state.repository ? totalChanges > 0 ? h("span", { className: "dtd-pill-changes" }, h("span", { className: "dtd-dot-orange" }, "●"), ` ${changesText}`) : h("span", { className: "dtd-pill-clean" }, "✓ 干净") : h("span", { className: "dtd-muted" }, "未关联"),
            // Only show ahead badge when ahead > 0 (zero-value hidden)
            state.ahead !== null && state.ahead > 0 ? h(
              React.Fragment,
              null,
              h("span", { className: "dtd-pill-dot" }, "·"),
              h("span", { className: "dtd-pill-ahead" }, `↑${state.ahead}`)
            ) : null,
            h(IconChevron, { size: 12, className: `dtd-pill-chevron ${expanded ? "is-expanded" : ""}` })
          ),
          // Upward Popover (向上生长的操作面板)
          expanded && h(
            "div",
            { className: "dtd-git-popover", role: "dialog", "aria-label": "Git 操作面板" },
            // Header (36px)
            h(
              "div",
              { className: "dtd-popover-header" },
              h(
                "div",
                { className: "dtd-popover-title" },
                h(IconBranch, { size: 14 }),
                h("strong", { className: "dtd-popover-branch-name" }, state.branch || "Detached HEAD")
              ),
              h(
                "div",
                { className: "dtd-popover-header-actions" },
                remotes.length > 1 && h("select", {
                  className: "dtd-popover-remote-select",
                  value: remote || state.defaultRemote,
                  disabled: busy,
                  onChange: (e) => changeRemote(e.target.value),
                  title: "选择远端"
                }, remotes.map((r) => h("option", { key: r.name, value: r.name }, r.name))),
                remotes.length > 0 && h("button", {
                  type: "button",
                  className: "dtd-btn-compact",
                  disabled: !enabled || !state.head || !state.branch,
                  onClick: openPush,
                  title: "推送至远端"
                }, `↑ 推送${state.ahead && state.ahead > 0 ? ` (${state.ahead})` : ""}`),
                h("button", {
                  type: "button",
                  className: "dtd-popover-close-btn",
                  onClick: () => setExpanded(false),
                  "aria-label": "关闭面板"
                }, h(IconClose, { size: 12 }))
              )
            ),
            notice && h("div", { className: "dtd-action-notice", role: "status" }, notice),
            errors,
            !state.repository ? h("div", { className: "dtd-empty-repo" }, state.message || "当前目录不是 Git 仓库") : h(
              React.Fragment,
              null,
              // File List Section (180px~220px, scrollable)
              h(
                "div",
                { className: "dtd-popover-files-section" },
                h(
                  "div",
                  { className: "dtd-files-subheader" },
                  h(
                    "label",
                    { className: "dtd-check-label" },
                    h("input", {
                      type: "checkbox",
                      className: "dtd-header-checkbox",
                      checked: state.files.length > 0 && selected.size === state.files.length,
                      disabled: busy,
                      onChange: (e) => setSelected(e.target.checked ? new Set(state.files.map((f) => f.path)) : /* @__PURE__ */ new Set())
                    }),
                    h("span", null, `全部变更 (${state.files.length})`)
                  ),
                  h(
                    "div",
                    { className: "dtd-files-sub-actions" },
                    h("button", {
                      type: "button",
                      className: "dtd-btn-sub",
                      disabled: !enabled || !unstaged.length,
                      onClick: () => act("stage", { all: !paths.length, paths, version: state.version })
                    }, paths.length ? `暂存所选 (${paths.length})` : `全部暂存 (${unstaged.length})`),
                    h("button", {
                      type: "button",
                      className: "dtd-btn-sub",
                      disabled: !enabled || !staged.length,
                      onClick: () => act("unstage", { all: !paths.length, paths, version: state.version })
                    }, paths.length ? `取消所选 (${paths.length})` : `全部取消 (${staged.length})`)
                  )
                ),
                h(
                  "div",
                  { className: "dtd-files-scroll-list" },
                  state.files.length === 0 ? h("div", { className: "dtd-empty-files" }, "工作区干净，无改动文件") : state.files.map((file) => {
                    const { dir, file: fileName } = renderFileInfo(file.path);
                    const statusChar = file.untracked ? "U" : (file.xy.trim() || "M")[0];
                    const statusClass = `dtd-badge-${statusChar}`;
                    return h(
                      "div",
                      { key: file.path, className: `dtd-file-row ${selected.has(file.path) ? "dtd-file-row-selected" : ""}` },
                      h("input", {
                        type: "checkbox",
                        className: "dtd-row-checkbox",
                        checked: selected.has(file.path),
                        disabled: busy,
                        onChange: () => select(file.path)
                      }),
                      h("span", { className: `dtd-file-badge ${statusClass}` }, statusChar),
                      h("span", { className: "dtd-file-name", title: file.path }, fileName),
                      dir && h("span", { className: "dtd-file-dir", title: dir }, dir),
                      h(
                        "div",
                        { className: "dtd-file-hover-actions" },
                        file.unstaged && h("button", {
                          type: "button",
                          className: "dtd-quick-stage-btn",
                          title: "暂存此文件",
                          disabled: busy,
                          onClick: (e) => {
                            e.stopPropagation();
                            void act("stage", { all: false, paths: [file.path], version: state.version });
                          }
                        }, "+"),
                        file.staged && h("button", {
                          type: "button",
                          className: "dtd-quick-unstage-btn",
                          title: "取消暂存此文件",
                          disabled: busy,
                          onClick: (e) => {
                            e.stopPropagation();
                            void act("unstage", { all: false, paths: [file.path], version: state.version });
                          }
                        }, "−")
                      )
                    );
                  })
                )
              ),
              // Commit Section (pinned at bottom)
              h(
                "div",
                { className: "dtd-commit-section" },
                h(
                  "div",
                  { className: "dtd-commit-input-wrapper" },
                  h("textarea", {
                    className: "dtd-commit-textarea",
                    value: message,
                    placeholder: "输入提交信息 (Commit message)...",
                    rows: 2,
                    disabled: busy,
                    onChange: (e) => changeMessage(e.target.value),
                    onKeyDown: (e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        void handleCommit();
                      }
                    }
                  }),
                  h("button", {
                    type: "button",
                    className: "dtd-ai-generate-btn",
                    title: "使用本会话 AI 根据暂存改动生成提交说明",
                    disabled: !enabled || !staged.length,
                    onClick: generateAiMessage
                  }, h(IconSparkles, { size: 12 }), h("span", null, "AI 生成"))
                ),
                h("button", {
                  type: "button",
                  className: "dtd-btn-primary dtd-btn-commit-main",
                  disabled: !enabled || !message.trim() || !staged.length && !unstaged.length,
                  onClick: handleCommit
                }, busy ? "处理中…" : staged.length > 0 ? `提交更改 (Commit ${staged.length} 个暂存文件)` : unstaged.length > 0 ? "暂存全部并提交" : "提交更改")
              )
            )
          ),
          modal?.kind === "stageCommit" && h(
            Dialog,
            { title: "暂存全部并提交", busy, close: () => setModal(void 0) },
            h("p", null, `将全部 ${modal.files} 个未暂存文件加入暂存区，然后预览并确认提交。`),
            errors,
            h("button", { type: "button", className: "dtd-btn-primary", disabled: busy, onClick: confirmStageCommit }, busy ? "正在暂存…" : "确认暂存全部")
          ),
          modal?.kind === "commit" && h(
            Dialog,
            { title: "确认 Git 提交", busy, close: () => setModal(void 0) },
            h("p", null, `分支：${modal.branch} · ${modal.files} 个暂存文件 · +${modal.added} / −${modal.deleted}`),
            h("p", { className: "dtd-commit-preview" }, modal.message),
            errors,
            h("button", { type: "button", className: "dtd-btn-primary", disabled: busy, onClick: () => act("commit", { ticket: modal.ticket, message: modal.message, confirmed: true }) }, busy ? "正在提交…" : "确认提交")
          ),
          // Push Dialog Modal
          modal && modal.kind === "push" && h(
            Dialog,
            { title: "确认 Git 推送", busy, close: () => setModal(void 0) },
            h("label", { className: "dtd-dialog-row" }, "推送 Remote ", remotes.length === 1 ? h("strong", null, remote) : h("select", { value: remote, disabled: busy, onChange: (event) => changeRemote(event.target.value) }, remotes.map((item) => h("option", { key: item.name, value: item.name }, `${item.name} · ${item.urls.join(" ; ")}`)))),
            h("div", { className: "dtd-push-urls" }, remotes.find((item) => item.name === remote)?.urls.map((url) => h("div", { key: url }, url))),
            errors,
            !modal.ticket ? h("button", { type: "button", className: "dtd-btn-primary", disabled: busy || !remotes.some((item) => item.name === remote), onClick: () => previewPush(remote) }, busy ? "正在核对…" : "检查推送目标") : h(
              React.Fragment,
              null,
              h("p", null, `目标：${modal.remote} / ${modal.branch} · ${modal.targets.length === 1 ? `待推送 ${modal.count} 个提交` : "各推送地址分别统计如下"}`),
              h("p", null, "提交：", h("code", null, modal.head)),
              modal.targets.map((target) => h("p", { key: target.url, className: "dtd-muted" }, `${target.url} · ${target.count} 个提交`)),
              modal.count === 0 && h("p", null, "没有需要推送的提交"),
              h("button", { type: "button", className: "dtd-btn-primary", disabled: busy || modal.count === 0 || remote !== modal.remote || state.head !== modal.head || state.branch !== modal.localBranch, onClick: () => act("push", { ticket: modal.ticket, remote, branch: modal.branch, head: modal.head, confirmed: true }) }, busy ? "正在推送…" : "确认推送")
            )
          )
        )
      );
    }
    return (props) => h(ActionsPanel, { ...props, key: props.sessionId });
  }

  // src/style.css
  var style_default = `.dtd-root,.dtd-actions-fixed-wrap,.dtd-actions-dialog{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei UI",sans-serif;color:inherit;min-width:0;font-size:12.5px;--dtd-green:#16a34a;--dtd-green-bg:rgba(22,163,74,0.12);--dtd-red:#dc2626;--dtd-red-bg:rgba(220,38,38,0.12);--dtd-amber:#d97706;--dtd-amber-bg:rgba(217,119,6,0.12);--dtd-blue:#2563eb;--dtd-blue-bg:rgba(37,99,235,0.12);--dtd-surface-overlay:var(--dsw-alias-bg-layer-2,#ffffff);--dtd-surface-subtle:var(--dsw-alias-bg-layer-3,#f4f4f5);--dtd-border:rgba(128,128,128,0.18);--dtd-border-hover:rgba(128,128,128,0.32);--dtd-shadow:0 8px 24px -4px rgba(0,0,0,0.14),0 2px 6px -1px rgba(0,0,0,0.08)}
body[data-ds-dark-theme] .dtd-root,body[data-ds-dark-theme] .dtd-actions-fixed-wrap,body[data-ds-dark-theme] .dtd-actions-dialog{--dtd-surface-overlay:var(--dsw-alias-bg-layer-2,#1e1e20);--dtd-surface-subtle:var(--dsw-alias-bg-layer-3,#27272a);--dtd-border:rgba(255,255,255,0.12);--dtd-border-hover:rgba(255,255,255,0.22);--dtd-shadow:0 12px 32px -4px rgba(0,0,0,0.45),0 4px 10px -2px rgba(0,0,0,0.3)}

.dtd-root button,.dtd-root select{font:inherit;color:inherit;border:1px solid transparent;border-radius:6px;background:transparent;cursor:pointer;padding:4px 8px;transition:all .15s ease}
.dtd-root button:hover{background:var(--dtd-surface-subtle)}
.dtd-root button:focus-visible,.dtd-root select:focus-visible,.dtd-root input:focus-visible{outline:2px solid #3b82f6;outline-offset:1px}
.dtd-root code,.dtd-hash-code,.dtd-counts,.dtd-status,.dtd-file-badge,.dtd-pill-branch,.dtd-popover-branch-name{font-family:'JetBrains Mono','Cascadia Code',Consolas,monospace!important}

/* SVG Helpers & Transitions */
.dtd-svg-icon{flex:none;vertical-align:middle;display:inline-block}
.dtd-chevron-rotate{transition:transform .18s ease;flex:none}
.dtd-chevron-rotate.is-expanded{transform:rotate(90deg)}
.dtd-pill-chevron{transition:transform .18s ease;flex:none}
.dtd-pill-chevron.is-expanded{transform:rotate(180deg)}

/* 形态 A：输入框上方改动摘要条 (高 32px 单层圆角横条，杜绝嵌套) */
.dtd-dock-seat{box-sizing:border-box;width:100%;min-width:0;flex:none;display:flex;justify-content:center;padding-inline:var(--dsh-composer-side-clearance,16px);margin-bottom:6px}
.dtd-dock-bar{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width,952px);min-width:0;flex:none;border:1px solid var(--dtd-border);border-radius:8px;margin:0;padding:0 10px;background:var(--dtd-surface-overlay);box-shadow:0 2px 8px rgba(0,0,0,0.06);display:flex;flex-direction:column}
.dtd-dock-bar-main{height:32px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.dtd-dock-trigger{display:inline-flex;align-items:center;gap:6px;line-height:1;border:0;background:transparent;color:inherit;cursor:pointer;padding:0;font-size:12px;font-weight:500}
.dtd-dock-files-label{color:var(--dsw-alias-label-primary)}
.dtd-dock-right{display:inline-flex;align-items:center;gap:10px}
.dtd-dock-status{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.dtd-pulse-dot{width:6px;height:6px;border-radius:50%;background:var(--dtd-green);animation:dtd-pulse 1.6s ease-in-out infinite}
@keyframes dtd-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(0.85)}}
.dtd-dock-open-btn{height:22px;padding:0 8px;border-radius:5px;background:var(--dtd-surface-subtle);border:1px solid var(--dtd-border);font-size:11.5px;cursor:pointer}
.dtd-dock-open-btn:hover{background:rgba(128,128,128,0.18);border-color:var(--dtd-border-hover)}
.dtd-dock-drawer{border-top:1px solid var(--dtd-border);padding:6px 0}
.dtd-dock-drawer-foot{display:flex;justify-content:flex-end;padding:4px 8px}

/* Single-line 38px Toolbar */
.dtd-toolbar-compact{height:38px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;border-bottom:1px solid var(--dtd-border);background:var(--dtd-surface-overlay);flex:none;position:relative;z-index:10}
.dtd-toolbar-left{display:inline-flex;align-items:center;gap:8px;min-width:0;flex:1}
.dtd-toolbar-right{display:inline-flex;align-items:center;gap:6px;flex:none}
.dtd-file-summary{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dtd-counts{display:inline-flex;align-items:center;gap:5px;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:11.5px;font-weight:500}
.dtd-added{color:var(--dtd-green)}.dtd-deleted{color:var(--dtd-red)}.dtd-muted{opacity:.65}

.dtd-icon-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:6px;color:var(--dsw-alias-label-secondary);padding:0;cursor:pointer}
.dtd-icon-btn:hover{background:var(--dtd-surface-subtle);color:var(--dsw-alias-label-primary)}

/* Mini dropdown */
.dtd-mini-select{height:26px;padding:0 6px;font-size:11.5px;border-radius:5px;background:var(--dtd-surface-subtle);border:1px solid var(--dtd-border);color:inherit;max-width:140px;text-overflow:ellipsis}

/* Scope Trigger */
.dtd-scope-picker-wrap{position:relative}
.dtd-scope-trigger{height:28px;padding:0 8px;border-radius:6px;background:var(--dtd-surface-subtle);border:1px solid transparent;display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap;transition:border-color .15s ease}
.dtd-scope-trigger:hover,.dtd-scope-trigger-active{border-color:var(--dtd-border-hover);background:var(--dtd-surface-subtle)}
.dtd-scope-trigger-active{box-shadow:0 0 0 2px rgba(59,130,246,0.18)}

/* Cascading Menu */
.dtd-cascade-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:200;display:flex;filter:drop-shadow(var(--dtd-shadow))}
.dtd-menu-primary{width:160px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);border-radius:8px;padding:4px;box-sizing:border-box;backdrop-filter:blur(12px)}
.dtd-menu-item{height:30px;box-sizing:border-box;display:flex;align-items:center;gap:6px;padding:0 8px;border-radius:5px;font-size:12.5px;cursor:pointer;user-select:none;color:var(--dsw-alias-label-primary)}
.dtd-menu-item:hover{background:var(--dtd-surface-subtle)}
.dtd-menu-item-active{font-weight:600;color:#3b82f6}
.dtd-menu-check{width:14px;display:inline-flex;align-items:center;justify-content:center;color:#3b82f6}
.dtd-menu-label{flex:1}
.dtd-menu-arrow{opacity:.5}

/* Commits Submenu */
.dtd-submenu-panel{position:absolute;top:0;width:340px;max-height:360px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);border-radius:8px;box-sizing:border-box;box-shadow:var(--dtd-shadow);display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(16px)}
.dtd-submenu-right{left:calc(100% + 4px)}
.dtd-submenu-left{right:calc(100% + 4px)}
.dtd-submenu-search{padding:8px;border-bottom:1px solid var(--dtd-border)}
.dtd-search-input{width:100%;height:28px;box-sizing:border-box;border-radius:5px;border:1px solid var(--dtd-border);background:var(--dtd-surface-subtle);color:inherit;padding:0 8px;font-size:12px}
.dtd-submenu-list{flex:1;overflow-y:auto;padding:4px}
.dtd-submenu-list::-webkit-scrollbar{width:4px}
.dtd-submenu-list::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.3);border-radius:2px}
.dtd-commit-item{padding:6px 8px;border-radius:5px;cursor:pointer;display:flex;flex-direction:column;gap:3px;text-align:left}
.dtd-commit-item:hover{background:var(--dtd-surface-subtle)}
.dtd-commit-item-selected{background:var(--dtd-blue-bg)!important}
.dtd-commit-subject{font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dtd-commit-meta-line{font-size:11px;display:flex;align-items:center;gap:4px}
.dtd-hash-code{background:rgba(128,128,128,0.12);padding:1px 4px;border-radius:3px;font-size:10.5px}
.dtd-submenu-empty{padding:24px;text-align:center;font-size:12px;opacity:.6}

/* Disclaimers Popover */
.dtd-info-popover-wrap{position:relative}
.dtd-info-popover{position:absolute;top:calc(100% + 6px);right:0;width:280px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);border-radius:8px;padding:10px 12px;box-shadow:var(--dtd-shadow);z-index:200;font-size:11.5px;line-height:1.5;backdrop-filter:blur(12px)}
.dtd-info-popover-title{font-weight:600;margin-bottom:6px;font-size:12px}
.dtd-info-list{padding-left:14px;margin:0}
.dtd-info-list li{margin:4px 0}

/* Slim warning bar */
.dtd-slim-warning-bar{height:26px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:var(--dtd-amber-bg);color:var(--dtd-amber);font-size:11.5px;font-weight:500;border-bottom:1px solid rgba(217,119,6,0.2)}
.dtd-btn-link{border:0;background:transparent;color:inherit;text-decoration:underline;cursor:pointer;padding:0;font-size:11.5px}

/* Commit Detail Bar */
.dtd-commit-bar{padding:6px 12px;border-bottom:1px solid var(--dtd-border);display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;background:var(--dtd-surface-subtle)}
.dtd-commit-bar-main{display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Review main area */
.dtd-review{height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base,transparent)}
.dtd-files{list-style:none;margin:0;padding:4px 8px;overflow-y:auto;max-height:160px;flex-shrink:0;border-bottom:1px solid var(--dtd-border)}
.dtd-file{width:100%;display:flex;gap:8px;align-items:center;text-align:left;padding:3px 6px;border-radius:4px}
.dtd-path{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.dtd-status{flex-shrink:0;width:24px;font-size:11px;font-weight:600}
.dtd-status-M{color:var(--dtd-amber)}.dtd-status-A{color:var(--dtd-green)}.dtd-status-D{color:var(--dtd-red)}.dtd-status-R{color:var(--dtd-blue)}
.dtd-selected{background:var(--dtd-surface-subtle)!important}
.dtd-fullpath{padding:5px 12px;font-size:11px;overflow-wrap:anywhere;opacity:.7;border-bottom:1px solid var(--dtd-border)}
.dtd-empty{margin:0;padding:32px 16px;text-align:center;opacity:.6;font-size:12.5px}
.dtd-native{flex:1;min-height:0;overflow:auto}
.dtd-native>div{height:100%;min-height:150px}
.dtd-message{padding:14px;font-size:12px;opacity:.7}

/* 形态 B：Git Action Panel (右下角常驻状态胶囊 + 向上展开抽屉) */
.dtd-actions-fixed-wrap{user-select:none}
.dtd-status-pill{height:32px;box-sizing:border-box;padding:0 12px;border-radius:16px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);box-shadow:var(--dtd-shadow);display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;cursor:pointer;backdrop-filter:blur(14px);transition:all .18s ease}
.dtd-status-pill:hover,.dtd-status-pill-active{border-color:#3b82f6;background:var(--dtd-surface-overlay)}
.dtd-status-pill-active{box-shadow:0 0 0 2px rgba(59,130,246,0.2),var(--dtd-shadow)}
.dtd-pill-branch{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dtd-pill-dot{opacity:.4}
.dtd-dot-orange{color:var(--dtd-amber);margin-right:2px}
.dtd-pill-clean{color:var(--dtd-green)}
.dtd-pill-ahead{color:var(--dtd-blue);font-weight:600}

/* Upward Popover */
.dtd-git-popover{position:absolute;bottom:calc(100% + 8px);right:0;width:380px;max-height:480px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);border-radius:10px;box-shadow:var(--dtd-shadow);backdrop-filter:blur(16px);display:flex;flex-direction:column;overflow:hidden;z-index:300}
.dtd-popover-header{height:36px;box-sizing:border-box;padding:0 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--dtd-border);background:var(--dtd-surface-subtle)}
.dtd-popover-title{display:inline-flex;align-items:center;gap:6px;font-size:12.5px}
.dtd-popover-branch-name{font-weight:600}
.dtd-popover-header-actions{display:inline-flex;align-items:center;gap:6px}
.dtd-popover-remote-select{height:24px;padding:0 4px;font-size:11px;border-radius:4px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border)}
.dtd-btn-compact{height:24px;padding:0 8px;font-size:11.5px;font-weight:500;border-radius:4px;border:1px solid var(--dtd-border);background:var(--dtd-surface-overlay);color:inherit;display:inline-flex;align-items:center;justify-content:center}
.dtd-btn-compact:hover{border-color:#3b82f6;color:#3b82f6}
.dtd-popover-close-btn{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;opacity:.6;padding:0}
.dtd-popover-close-btn:hover{opacity:1;background:rgba(128,128,128,0.15)}

/* File list section in popover */
.dtd-popover-files-section{flex:1;min-height:0;display:flex;flex-direction:column;border-bottom:1px solid var(--dtd-border)}
.dtd-files-subheader{height:28px;box-sizing:border-box;padding:0 10px;display:flex;align-items:center;justify-content:space-between;background:var(--dtd-surface-subtle);font-size:11.5px;border-bottom:1px solid var(--dtd-border)}
.dtd-check-label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dtd-header-checkbox{margin:0;width:13px;height:13px;accent-color:#3b82f6;cursor:pointer}
.dtd-files-sub-actions{display:inline-flex;align-items:center;gap:6px}
.dtd-btn-sub{border:0;background:transparent;padding:2px 4px;font-size:11px;color:#3b82f6;cursor:pointer}
.dtd-btn-sub:hover{text-decoration:underline}
.dtd-btn-sub:disabled{opacity:.4;cursor:not-allowed;text-decoration:none}

.dtd-files-scroll-list{max-height:190px;overflow-y:auto;padding:2px 0}
.dtd-files-scroll-list::-webkit-scrollbar{width:4px}
.dtd-files-scroll-list::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.3);border-radius:2px}
.dtd-file-row{height:26px;display:flex;align-items:center;gap:6px;padding:0 8px;font-size:11.5px;position:relative}
.dtd-file-row:hover{background:var(--dtd-surface-subtle)}
.dtd-file-row-selected{background:rgba(59,130,246,0.08)}
.dtd-row-checkbox{margin:0;width:13px;height:13px;accent-color:#3b82f6;cursor:pointer}
.dtd-file-badge{width:16px;height:16px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700}
.dtd-badge-M{background:var(--dtd-amber-bg);color:var(--dtd-amber)}
.dtd-badge-A{background:var(--dtd-green-bg);color:var(--dtd-green)}
.dtd-badge-D{background:var(--dtd-red-bg);color:var(--dtd-red)}
.dtd-badge-R{background:var(--dtd-blue-bg);color:var(--dtd-blue)}
.dtd-badge-U,.dtd-badge-\\?{background:rgba(128,128,128,0.15);color:var(--dsw-alias-label-secondary)}
.dtd-file-name{font-weight:500;color:var(--dsw-alias-label-primary)}
.dtd-file-dir{opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;font-size:11px;margin-left:auto}
.dtd-file-hover-actions{display:none;position:absolute;right:8px}
.dtd-file-row:hover .dtd-file-hover-actions{display:inline-flex;gap:4px}
.dtd-file-row:hover .dtd-file-dir{display:none}
.dtd-quick-stage-btn,.dtd-quick-unstage-btn{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;border-radius:3px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);font-size:12px;line-height:1;cursor:pointer;padding:0}
.dtd-quick-stage-btn:hover{background:var(--dtd-green-bg);color:var(--dtd-green);border-color:var(--dtd-green)}
.dtd-quick-unstage-btn:hover{background:var(--dtd-red-bg);color:var(--dtd-red);border-color:var(--dtd-red)}
.dtd-empty-files,.dtd-empty-repo{padding:24px;text-align:center;font-size:12px;opacity:.6}

/* Commit Section */
.dtd-commit-section{padding:10px;background:var(--dtd-surface-overlay);display:flex;flex-direction:column;gap:8px}
.dtd-commit-input-wrapper{position:relative}
.dtd-commit-textarea{width:100%;height:52px;box-sizing:border-box;border:1px solid var(--dtd-border);border-radius:6px;background:var(--dtd-surface-subtle);color:inherit;padding:6px 8px;font-family:inherit;font-size:12px;resize:none;line-height:1.4}
.dtd-commit-textarea:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 2px rgba(59,130,246,0.15)}
.dtd-ai-generate-btn{position:absolute;top:4px;right:6px;height:22px;padding:0 6px;border-radius:4px;background:var(--dtd-surface-overlay);border:1px solid var(--dtd-border);font-size:10.5px;font-weight:500;cursor:pointer;color:#3b82f6;display:inline-flex;align-items:center;gap:4px}
.dtd-ai-generate-btn:hover{background:var(--dtd-blue-bg);border-color:#3b82f6}
.dtd-ai-generate-btn:disabled{opacity:.4;cursor:not-allowed}
.dtd-btn-primary{height:30px;border-radius:6px;background:#3b82f6;color:#ffffff;border:none;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s ease}
.dtd-btn-primary:hover:not(:disabled){background:#2563eb}
.dtd-btn-primary:disabled{opacity:.45;cursor:not-allowed}
.dtd-btn-commit-main{width:100%}

/* Notice & Error */
.dtd-action-notice{padding:6px 10px;margin:4px 8px;border-radius:5px;background:var(--dtd-green-bg);color:var(--dtd-green);font-size:11.5px}
.dtd-action-error{padding:6px 10px;margin:4px 8px;border-radius:5px;background:var(--dtd-red-bg);color:var(--dtd-red);font-size:11.5px;max-height:80px;overflow-y:auto}

/* Dialog */
.dtd-actions-dialog{box-sizing:border-box;position:fixed;inset:0;margin:auto;font:inherit;line-height:1.5;background:#fff;background:linear-gradient(var(--dtd-surface-overlay,#fff),var(--dtd-surface-overlay,#fff)),#fff;color:var(--dsw-alias-label-primary,#18181b);border:1px solid var(--dtd-border,rgba(128,128,128,.18));border-radius:10px;width:min(420px,calc(100vw - 40px));max-height:calc(100dvh - 40px);overflow:auto;padding:20px;box-shadow:var(--dtd-shadow,0 12px 36px rgba(0,0,0,.25));user-select:text;pointer-events:auto;overflow-wrap:anywhere}
body[data-ds-dark-theme] .dtd-actions-dialog{background:#1e1e20;background:linear-gradient(var(--dtd-surface-overlay,#1e1e20),var(--dtd-surface-overlay,#1e1e20)),#1e1e20;color:var(--dsw-alias-label-primary,#fafafa)}
.dtd-actions-dialog::backdrop{background:rgba(0,0,0,0.4)}
.dtd-dialog-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;font-size:14px}
.dtd-actions-dialog .dtd-dialog-close-btn{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:inherit;border-radius:6px;cursor:pointer;padding:0}
.dtd-actions-dialog .dtd-dialog-close-btn:hover:not(:disabled){background:var(--dtd-surface-subtle)}
.dtd-actions-dialog button:disabled{opacity:.45;cursor:not-allowed}
.dtd-actions-dialog button:focus-visible,.dtd-actions-dialog select:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
.dtd-dialog-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;margin:8px 0}
.dtd-dialog-row select{min-width:0;max-width:70%;padding:6px 8px;font:inherit;color:inherit;background:var(--dtd-surface-subtle);border:1px solid var(--dtd-border);border-radius:6px}
.dtd-push-urls{font-size:12px;color:var(--dsw-alias-label-secondary,inherit);padding:10px 12px;margin:12px 0 16px;border-radius:6px;background:var(--dtd-surface-subtle);overflow-wrap:anywhere}
.dtd-actions-dialog .dtd-btn-primary{min-height:32px;height:auto;padding:6px 12px;background:#3b82f6;color:#fff;border:0}
.dtd-actions-dialog .dtd-btn-primary:hover:not(:disabled){background:#2563eb}

/* Guide Entry */
.dtd-guide-entry{box-sizing:border-box;width:380px;max-width:100%;min-height:56px;display:flex;align-items:center;gap:14px;padding:14px 20px;text-align:left;font:inherit;background:var(--dtd-surface-overlay);color:inherit;border:.5px solid var(--dtd-border);border-radius:14px;cursor:pointer}
.dtd-guide-entry:hover{background:var(--dtd-surface-subtle)}
.dtd-guide-icon{width:26px;height:26px;display:flex;align-items:center;justify-content:center;flex:none;color:#3b82f6}
.dtd-guide-copy{display:flex;flex-direction:column;gap:2px}
.dtd-guide-title{font-size:13.5px;font-weight:500}
.dtd-guide-description{font-size:11px;opacity:.65}

.dtd-commit-preview{white-space:pre-wrap}
`;

  // locale/zh.json
  var zh_default = {
    meta: {
      title: "代码审查与 Git 操作",
      description: "本轮及子代理改动概览、六种 Diff Review，支持暂存、取消暂存、AI 辅助提交信息、确认提交与选择 Remote 推送。"
    }
  };

  // locale/en.json
  var en_default = {
    meta: {
      title: "Git Review & Actions",
      description: "Task and Git Diff review, staging, unstaging, AI-assisted commit messages, confirmed commits and ordinary pushes."
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
          const ReviewIcon = ({ size = 24 }) => React.createElement(
            "svg",
            { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true },
            React.createElement("path", { d: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6M8 13h4m-2-2v4m4 2h3", strokeLinecap: "round", strokeLinejoin: "round" })
          );
          function ReviewGuide({ sessionId, useTabInfo, title, description }) {
            const { tab } = useTabInfo();
            return React.createElement(
              "button",
              {
                type: "button",
                className: "dtd-guide-entry",
                "data-sidebar-right-guide-entry": "task-diff-review",
                onClick: () => tab.actions.openResource(`dsh-resource://task-diff-review/session/${encodeURIComponent(sessionId)}`, {
                  replaceTab: true,
                  preferNewPane: false,
                  revealIfOpened: true,
                  params: { index: 0, mode: "task", taskId: "" }
                })
              },
              React.createElement("span", { className: "dtd-guide-icon" }, React.createElement(ReviewIcon, {})),
              React.createElement(
                "span",
                { className: "dtd-guide-copy" },
                React.createElement("span", { className: "dtd-guide-title" }, title),
                description && React.createElement("span", { className: "dtd-guide-description" }, description)
              )
            );
          }
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: "dsh-task-diff-review",
            kind: "task-diff-review",
            patterns: ["dsh-resource://task-diff-review/session/**"],
            canOpen: (value) => /^dsh-resource:\/\/task-diff-review\/session\/[^/?#]+$/.test(value),
            title: () => "代码改动审查",
            guide: [{ id: "review", title: () => "代码改动审查", description: () => "查看本轮、工作区和历史提交的代码差异", icon: ReviewIcon, order: 40 }]
          }));
          ctx.slots.inject("sidebar.right.tab.guide.entry", () => ctx.slots.register({ name: "sidebar.right.tab.guide.entry", key: "dsh-task-diff-review" }, ReviewGuide));
          ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "dsh-task-diff-review", order: 10 }, views.Dock));
          ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({ name: "conversation.composer.dock", id: "dsh-task-diff-review-actions" }, createActionsPanel(React)));
          ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: "dsh-task-diff-review" }, views.Review));
        }
      };
    }
  });
})();
