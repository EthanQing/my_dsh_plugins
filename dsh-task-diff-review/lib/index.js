// Generated; edit src/ and run scripts/build.mjs.

// src/index.js
import path3 from "node:path";
import os from "node:os";

// src/snapshots.js
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

// src/git.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execute = promisify(execFile);
async function git(cwd, args, { input, maxBuffer = 72 * 1024 * 1024, signal } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" });
  const diffConfig = args[0] === "diff" ? ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false"] : [];
  const child = execute("git", [...diffConfig, "-c", "core.quotePath=false", ...args], { cwd, env, encoding: "buffer", maxBuffer, timeout: 2e4, windowsHide: true, signal });
  child.child.stdin.on("error", () => {
  });
  if (input !== void 0) child.child.stdin.end(input);
  else child.child.stdin.end();
  try {
    return (await child).stdout;
  } catch (error) {
    if (error.code === 1 && args[0] === "diff" && Buffer.isBuffer(error.stdout)) return error.stdout;
    throw new Error(`Git read failed (${error.code ?? "aborted"})`);
  }
}
function parseNames(output) {
  const parts = output.toString("utf8").split("\0"), files = [];
  for (let i = 0; i < parts.length && parts[i]; ) {
    const status = parts[i++], old = parts[i++], renamed = status[0] === "R" || status[0] === "C";
    const next = renamed ? parts[i++] : old;
    const clean = (value) => value?.replace(/^(?:before|after)\//, "");
    files.push({ status: status[0], oldPath: clean(old), relative: clean(next) });
  }
  return files;
}
function parseHunks(output) {
  const hunks = [];
  let hunk;
  for (const line of output.toString("utf8").split("\n")) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      hunk = { oldStart: +match[1], oldLines: +(match[2] ?? 1), newStart: +match[3], newLines: +(match[4] ?? 1), lines: [] };
      hunks.push(hunk);
    } else if (hunk && /^[+ -]/.test(line)) hunk.lines.push(line.replace(/\r$/, ""));
  }
  return hunks;
}
function parseStats(output) {
  const parts = output.toString("utf8").split("\0"), result = /* @__PURE__ */ new Map();
  for (let at = 0; at < parts.length && parts[at]; ) {
    const match = /^([\d-]+)\t([\d-]+)\t([\s\S]*)$/.exec(parts[at++]);
    if (!match) throw new Error("Git numstat output was incomplete");
    let name2 = match[3];
    if (name2 === "") {
      const before = parts[at++], after = parts[at++];
      name2 = after === "/dev/null" ? before : after;
    }
    result.set(name2.replace(/^(?:before|after)\//, ""), match[1] === "-" || match[2] === "-" ? { binary: true, added: 0, deleted: 0 } : { added: +match[1], deleted: +match[2] });
  }
  return result;
}

// src/snapshots.js
var MAX_FILES = 3e3;
var MAX_FILE = 2 * 1024 * 1024;
var MAX_HASH = 16 * 1024 * 1024;
var MAX_CAPTURE = 64 * 1024 * 1024;
var MAX_STORE = 512 * 1024 * 1024;
var hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
var safeRelative = (name2) => typeof name2 === "string" && name2 !== "" && !name2.includes("\\") && !path.isAbsolute(name2) && name2.split("/").every((part) => part && part !== "." && part !== ".." && part.toLowerCase() !== ".git" && !part.includes(":"));
var Snapshots = class {
  constructor(root, signal) {
    this.root = root;
    this.signal = signal;
    this.bytes = 0;
    this.known = /* @__PURE__ */ new Set();
  }
  async init() {
    await fs.mkdir(path.join(this.root, "blobs"), { recursive: true, mode: 448 });
    for (const name2 of await fs.readdir(path.join(this.root, "blobs"))) {
      if (!/^[a-f0-9]{64}$/.test(name2)) continue;
      this.known.add(name2);
      this.bytes += (await fs.stat(path.join(this.root, "blobs", name2))).size;
    }
  }
  async blob(bytes) {
    const id = hash(bytes);
    if (bytes.length > MAX_FILE) return { fingerprint: id, oversized: true, size: bytes.length };
    if (!this.known.has(id)) {
      if (this.bytes + bytes.length > MAX_STORE) throw new Error("快照存储已达 512 MiB 上限");
      await fs.writeFile(this.blobPath(id), bytes, { flag: "wx", mode: 384 }).catch((error) => {
        if (error.code !== "EEXIST") throw error;
      });
      this.known.add(id);
      this.bytes += bytes.length;
    }
    let binary = bytes.includes(0);
    if (!binary) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        binary = true;
      }
    }
    return { hash: id, binary, size: bytes.length };
  }
  blobPath(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid blob");
    return path.join(this.root, "blobs", id);
  }
  async repository(cwd) {
    return (await git(cwd, ["rev-parse", "--show-toplevel"], { signal: this.signal })).toString().trim();
  }
  async conversion(root, names) {
    const [config, eol, attributes] = await Promise.all([
      git(root, ["config", "--get", "core.autocrlf"], { signal: this.signal }).catch(() => Buffer.from("false")),
      git(root, ["ls-files", "--eol", "-z", "--cached", "--others", "--exclude-standard"], { signal: this.signal }),
      git(root, ["check-attr", "-z", "--stdin", "text", "eol", "filter", "working-tree-encoding", "ident"], { input: names.join("\0") + "\0", signal: this.signal })
    ]);
    const auto = ["true", "input"].includes(config.toString().trim()), stats = /* @__PURE__ */ new Map(), attrs = /* @__PURE__ */ new Map();
    for (const record of eol.toString().split("\0").filter(Boolean)) {
      const at = record.indexOf("	");
      if (at < 0) continue;
      const meta = record.slice(0, at);
      stats.set(record.slice(at + 1), { index: /i\/(\S+)/.exec(meta)?.[1], work: /w\/(\S+)/.exec(meta)?.[1] });
    }
    const parts = attributes.toString().split("\0");
    for (let at = 0; at + 2 < parts.length; at += 3) {
      const name2 = parts[at];
      if (!attrs.has(name2)) attrs.set(name2, {});
      attrs.get(name2)[parts[at + 1]] = parts[at + 2];
    }
    return (name2, bytes) => {
      const attr = attrs.get(name2) ?? {}, active = (value) => value && !["unspecified", "unset"].includes(value);
      if (active(attr.filter) || active(attr["working-tree-encoding"]) || active(attr.ident)) throw new Error("Git 过滤器/编码/ident 转换未覆盖；为保持只读不执行过滤命令");
      if (attr.text === "unset") return bytes;
      const forced = attr.text === "set" || ["lf", "crlf"].includes(attr.eol) && attr.text !== "auto";
      const automatic = attr.text === "auto" || (!attr.text || attr.text === "unspecified") && auto;
      const info = stats.get(name2);
      const normalize = forced || automatic && info && info.work !== "-text" && !["crlf", "mixed"].includes(info.index);
      if (!normalize || !bytes.includes(13)) return bytes;
      return Buffer.from(bytes.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
    };
  }
  async working(root, { normalizeForGit = false } = {}) {
    const names = [...new Set((await git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { signal: this.signal })).toString("utf8").split("\0").filter(Boolean))].sort();
    const files = /* @__PURE__ */ Object.create(null), warnings = [];
    let total = 0;
    const convert = normalizeForGit && names.length ? await this.conversion(root, names.slice(0, MAX_FILES)) : (_name, bytes) => bytes;
    if (names.length > MAX_FILES) warnings.push(`仓库超过 ${MAX_FILES} 个文件，未覆盖超限路径`);
    for (const name2 of names.slice(0, MAX_FILES)) {
      this.signal.throwIfAborted();
      if (!safeRelative(name2)) {
        warnings.push(`未覆盖特殊路径：${name2}`);
        continue;
      }
      try {
        let target = root;
        for (const part of name2.split("/")) {
          target = path.join(target, part);
          if ((await fs.lstat(target)).isSymbolicLink()) throw new Error("符号链接/联接未覆盖");
        }
        const before = await fs.lstat(target);
        if (!before.isFile()) {
          warnings.push(`子模块或非普通文件未覆盖：${name2}`);
          continue;
        }
        if (before.size > MAX_HASH || total + before.size > MAX_CAPTURE) {
          files[name2] = { unavailable: true, size: before.size };
          warnings.push(`文件内容未捕获（大小/总量限制）：${name2}`);
          continue;
        }
        const bytes = await fs.readFile(target), after = await fs.lstat(target);
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw new Error("捕获时文件正在变化");
        total += bytes.length;
        files[name2] = { ...await this.blob(convert(name2, bytes)), executable: Boolean(before.mode & 73) };
      } catch (error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") continue;
        files[name2] = { unavailable: true };
        warnings.push(`${name2}：${error.message}`);
      }
    }
    return { root, files, warnings, captured: Date.now() };
  }
  async committed(root, revision) {
    const oid = (await git(root, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], { signal: this.signal })).toString().trim();
    const records = (await git(root, ["ls-tree", "-r", "-l", "-z", oid], { signal: this.signal })).toString().split("\0").filter(Boolean);
    const files = /* @__PURE__ */ Object.create(null), warnings = [], selected = [];
    let total = 0;
    if (records.length > MAX_FILES) warnings.push(`提交超过 ${MAX_FILES} 个文件，未覆盖超限路径`);
    for (const record of records.slice(0, MAX_FILES)) {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\s+([\d-]+)\t([\s\S]+)$/.exec(record);
      if (!match) continue;
      const [, mode, type, object, size, name2] = match;
      if (!safeRelative(name2) || type !== "blob" || mode === "120000") {
        warnings.push(`特殊路径/链接/子模块未覆盖：${name2}`);
        continue;
      }
      if (+size > MAX_HASH || total + +size > MAX_CAPTURE) {
        files[name2] = { unavailable: true, size: +size };
        warnings.push(`文件内容未捕获：${name2}`);
        continue;
      }
      total += +size;
      selected.push({ name: name2, object, executable: mode === "100755" });
    }
    if (selected.length) {
      const data = await git(root, ["cat-file", "--batch"], { input: selected.map((entry) => entry.object).join("\n") + "\n", signal: this.signal });
      let offset = 0;
      for (const entry of selected) {
        const end = data.indexOf(10, offset), header = data.subarray(offset, end).toString(), size = Number(header.split(" ")[2]);
        if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= data.length) throw new Error("Git blob stream incomplete");
        files[entry.name] = { ...await this.blob(data.subarray(end + 1, end + 1 + size)), executable: entry.executable };
        offset = end + 2 + size;
      }
    }
    return { root, files, warnings, captured: Date.now(), oid };
  }
  async index(root) {
    const records = (await git(root, ["ls-files", "--stage", "-z"], { signal: this.signal })).toString().split("\0").filter(Boolean);
    const files = /* @__PURE__ */ Object.create(null), warnings = [], selected = [];
    if (records.length > MAX_FILES) warnings.push(`暂存区超过 ${MAX_FILES} 条记录，未覆盖超限路径`);
    for (const record of records.slice(0, MAX_FILES)) {
      const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error("无法解析暂存区记录");
      const [, mode, object, stage, name2] = match;
      if (stage !== "0" || !safeRelative(name2) || !["100644", "100755"].includes(mode)) {
        files[name2] = { unavailable: true };
        warnings.push(`冲突、链接、子模块或特殊路径未覆盖：${name2}`);
        continue;
      }
      selected.push({ name: name2, object, executable: mode === "100755" });
    }
    if (selected.length) {
      const sizes = (await git(root, ["cat-file", "--batch-check"], { input: selected.map((entry) => entry.object).join("\n") + "\n", signal: this.signal })).toString().trim().split("\n");
      const bounded = [];
      let total = 0;
      for (let at = 0; at < selected.length; at++) {
        const entry = selected[at], match = /^[a-f0-9]+ blob (\d+)$/.exec(sizes[at] ?? "");
        if (!match) throw new Error("暂存区对象缺失或读取不完整");
        const size = Number(match[1]);
        if (size > MAX_HASH || total + size > MAX_CAPTURE) {
          files[entry.name] = { unavailable: true };
          warnings.push(`暂存区文件内容超限：${entry.name}`);
          continue;
        }
        total += size;
        bounded.push(entry);
      }
      if (bounded.length) {
        const data = await git(root, ["cat-file", "--batch"], { input: bounded.map((entry) => entry.object).join("\n") + "\n", signal: this.signal });
        let offset = 0;
        for (const entry of bounded) {
          const end = data.indexOf(10, offset), size = Number(data.subarray(offset, end).toString().split(" ")[2]);
          if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= data.length) throw new Error("暂存区内容读取不完整");
          files[entry.name] = { ...await this.blob(data.subarray(end + 1, end + 1 + size)), executable: entry.executable };
          offset = end + 2 + size;
        }
      }
    }
    return { root, files, warnings, captured: Date.now(), oid: "index" };
  }
  async materialize(snapshot, destination) {
    await fs.mkdir(destination, { recursive: true });
    for (const [name2, entry] of Object.entries(snapshot.files)) {
      if (!entry.hash || !safeRelative(name2)) continue;
      const target = path.join(destination, ...name2.split("/"));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(this.blobPath(entry.hash), target);
      if (process.platform !== "win32") await fs.chmod(target, entry.executable ? 448 : 384);
    }
  }
  async compare(before, after) {
    const temp = path.join(this.root, "compare", randomUUID());
    await fs.mkdir(temp, { recursive: true });
    try {
      await this.materialize(before, path.join(temp, "before"));
      await this.materialize(after, path.join(temp, "after"));
      const files = parseNames(await git(temp, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "-M", "--name-status", "-z", "--", "before", "after"], { signal: this.signal }));
      const stats = parseStats(await git(temp, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "-M", "--numstat", "-z", "--", "before", "after"], { signal: this.signal }));
      const result = [];
      for (const file of files) {
        const left = before.files[file.oldPath], right = after.files[file.relative];
        if (left?.unavailable || right?.unavailable || before.files[file.relative]?.unavailable || after.files[file.oldPath]?.unavailable || left?.oversized || right?.oversized || before.files[file.relative]?.oversized || after.files[file.oldPath]?.oversized) continue;
        const descriptor = { ...file, path: path.join(after.root, ...file.relative.split("/")), display: file.status === "R" ? `${file.oldPath} → ${file.relative}` : file.relative, added: 0, deleted: 0 };
        if (left?.binary || right?.binary) descriptor.binary = true;
        else {
          const stat = stats.get(file.relative);
          if (!stat) throw new Error("文件状态和行数统计不一致，未发布不完整统计");
          Object.assign(descriptor, stat);
        }
        result.push(descriptor);
      }
      const remaining = [];
      for (const name2 of /* @__PURE__ */ new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
        const left = before.files[name2], right = after.files[name2];
        if (!left?.oversized && !right?.oversized || left?.unavailable || right?.unavailable) continue;
        if ((left?.fingerprint ?? left?.hash) === (right?.fingerprint ?? right?.hash)) continue;
        remaining.push({
          status: !left ? "A" : !right ? "D" : "M",
          oldPath: name2,
          relative: name2,
          path: path.join(after.root, ...name2.split("/")),
          display: name2,
          added: 0,
          deleted: 0,
          oversized: true,
          fingerprint: left?.fingerprint ?? right?.fingerprint
        });
      }
      for (const file of remaining) {
        if (file.status !== "D") continue;
        const renamed = remaining.find((entry) => entry.status === "A" && !entry.merged && entry.fingerprint === file.fingerprint);
        if (renamed) {
          file.status = "R";
          file.relative = renamed.relative;
          file.path = renamed.path;
          file.display = `${file.oldPath} → ${file.relative}`;
          renamed.merged = true;
        }
      }
      result.push(...remaining.filter((file) => !file.merged).map(({ fingerprint, ...file }) => file));
      if (before.oid && after.oid) for (const [name2, left] of Object.entries(before.files)) {
        const right = after.files[name2];
        if (left.hash && left.hash === right?.hash && left.executable !== right.executable && !result.some((file) => file.relative === name2)) {
          result.push({
            status: "M",
            oldPath: name2,
            relative: name2,
            path: path.join(after.root, ...name2.split("/")),
            display: name2,
            added: 0,
            deleted: 0,
            ...left.binary ? { binary: true } : {}
          });
        }
      }
      return {
        root: after.root,
        files: result,
        before,
        after,
        warnings: [.../* @__PURE__ */ new Set([...before.warnings, ...after.warnings])],
        total: result.length,
        added: result.reduce((sum, file) => sum + file.added, 0),
        deleted: result.reduce((sum, file) => sum + file.deleted, 0)
      };
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
  async diff(comparison, index) {
    const file = comparison.files[index];
    if (!file) throw new Error("文件不在当前快照中");
    const base = { path: file.path, display: file.display };
    if (file.binary) return { ...base, kind: "binary" };
    if (file.oversized) return { ...base, kind: "oversized" };
    const left = comparison.before.files[file.oldPath], right = comparison.after.files[file.relative];
    if (left?.unavailable || right?.unavailable) return { ...base, kind: "oversized" };
    const temp = path.join(this.root, "compare", randomUUID());
    await fs.mkdir(temp, { recursive: true });
    try {
      for (const [name2, item] of [["before", left], ["after", right]]) {
        if (item?.hash) await fs.copyFile(this.blobPath(item.hash), path.join(temp, name2));
        else await fs.writeFile(path.join(temp, name2), "");
      }
      const output = await git(temp, ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--unified=3", "--", "before", "after"], { signal: this.signal });
      return { ...base, kind: "text", before: Boolean(left?.hash), after: Boolean(right?.hash), coarse: false, hunks: parseHunks(output) };
    } finally {
      await fs.rm(temp, { recursive: true, force: true });
    }
  }
};

// src/recorder.js
import { promises as fs2, watch } from "node:fs";
import path2 from "node:path";
import { randomUUID as randomUUID2 } from "node:crypto";

// src/git-review.js
var PAGE_SIZE = 50;
var oidPattern = /^[a-f0-9]{4,64}$/i;
var emptyTree = (root) => ({ root, files: /* @__PURE__ */ Object.create(null), warnings: [], captured: Date.now(), oid: "empty" });
async function branches(root, signal) {
  return (await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"], { signal })).toString().trim().split("\n").filter(Boolean);
}
async function resolve(root, revision, signal) {
  return (await git(root, ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], { signal })).toString().trim();
}
async function headOrEmpty(snapshots, root) {
  try {
    return await snapshots.committed(root, "HEAD");
  } catch (error) {
    const branch = (await git(root, ["symbolic-ref", "--quiet", "HEAD"], { signal: snapshots.signal })).toString().trim();
    const exists = (await git(root, ["for-each-ref", "--format=%(refname)", branch], { signal: snapshots.signal })).toString().trim();
    if (exists) throw error;
    return emptyTree(root);
  }
}
async function commitDetails(root, hash2, signal) {
  if (!oidPattern.test(hash2 ?? "")) throw new Error("请选择有效的 Commit Hash");
  const oid = await resolve(root, hash2, signal);
  if (!oid.startsWith(hash2.toLowerCase())) throw new Error("Hash 前缀未对应有效提交");
  const fields = (await git(root, ["show", "--no-patch", "--no-show-signature", "--no-notes", "--format=%H%x00%P%x00%s%x00%an%x00%aI%x00%B", oid, "--"], { signal, maxBuffer: 2 * 1024 * 1024 })).toString().split("\0");
  if (fields.length !== 6 || fields[0] !== oid) throw new Error("提交信息格式无法可靠解析");
  return { hash: oid, parents: fields[1] ? fields[1].split(" ") : [], subject: fields[2], author: fields[3], date: fields[4], body: fields[5].trimEnd() };
}
async function reviewGitRange(snapshots, cwd, mode, options) {
  const root = await snapshots.repository(cwd);
  if (mode === "staged") return { comparison: await snapshots.compare(await headOrEmpty(snapshots, root), await snapshots.index(root)) };
  if (mode === "unstaged") {
    const before2 = await snapshots.index(root), after = await snapshots.working(root, { normalizeForGit: true });
    const comparison = await snapshots.compare(before2, after);
    for (const file of comparison.files) if (!Object.hasOwn(before2.files, file.relative) && Object.hasOwn(after.files, file.relative)) {
      file.untracked = true;
      file.display = `[未跟踪] ${file.display}`;
    }
    return { comparison };
  }
  const commit = await commitDetails(root, options.commit, snapshots.signal);
  const selectedParent = Number(options.parent ?? 0);
  if (!Number.isSafeInteger(selectedParent) || selectedParent < 0 || selectedParent >= Math.max(1, commit.parents.length)) throw new Error("父提交选择无效");
  const before = commit.parents.length ? await snapshots.committed(root, commit.parents[selectedParent]) : emptyTree(root);
  return { comparison: await snapshots.compare(before, await snapshots.committed(root, commit.hash)), commit: { ...commit, selectedParent } };
}
async function commitHistory(snapshots, cwd, { branch = "HEAD", query = "", offset = 0, tip = "" } = {}) {
  const root = await snapshots.repository(cwd), signal = snapshots.signal, names = await branches(root, signal);
  branch ||= "HEAD";
  if (branch !== "HEAD" && !names.includes(branch)) throw new Error("请选择有效的历史分支");
  if (query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1e5) throw new Error("历史查询范围无效");
  if (tip && !oidPattern.test(tip)) throw new Error("历史分页锚点无效");
  let anchor;
  try {
    anchor = await resolve(root, tip || branch, signal);
  } catch (error) {
    if (branch !== "HEAD" || tip) throw error;
    if ((await headOrEmpty(snapshots, root)).oid !== "empty") throw error;
    return { branches: names, branch, tip: "", commits: [], hasMore: false, nextOffset: 0 };
  }
  const output = await git(root, [
    "log",
    "--no-show-signature",
    "--no-notes",
    "-z",
    "--format=%H%x00%s%x00%an%x00%aI%x00%ct",
    `--max-count=${PAGE_SIZE + 1}`,
    `--skip=${offset}`,
    ...query ? ["--fixed-strings", "--regexp-ignore-case", `--grep=${query}`] : [],
    anchor,
    "--"
  ], { signal, maxBuffer: 2 * 1024 * 1024 });
  const parts = output.toString().split("\0");
  if (parts.at(-1) === "") parts.pop();
  if (parts.length % 5 !== 0) throw new Error("提交历史格式无法可靠解析");
  const records = [];
  for (let at = 0; at < parts.length; at += 5) records.push({ hash: parts[at], subject: parts[at + 1], author: parts[at + 2], date: parts[at + 3], time: Number(parts[at + 4]) });
  const commits = records.slice(0, PAGE_SIZE);
  if (offset === 0 && oidPattern.test(query)) {
    try {
      const hash2 = await resolve(root, query, signal);
      if (!hash2.startsWith(query.toLowerCase())) throw new Error("Not a hash prefix");
      await git(root, ["merge-base", "--is-ancestor", hash2, anchor], { signal });
      if (!commits.some((commit) => commit.hash === hash2)) {
        const detail = await commitDetails(root, hash2, signal);
        const time = Number((await git(root, ["show", "--no-patch", "--no-show-signature", "--no-notes", "--format=%ct", hash2, "--"], { signal })).toString().trim());
        commits.push({ hash: hash2, subject: detail.subject, author: detail.author, date: detail.date, time });
      }
    } catch {
    }
  }
  commits.sort((left, right) => right.time - left.time);
  return { branches: names, branch, tip: anchor, commits, hasMore: records.length > PAGE_SIZE, nextOffset: offset + Math.min(PAGE_SIZE, records.length) };
}

// src/recorder.js
var note = "本轮为时间窗口内的工作区净变化；用户或其他任务并发写入无法可靠归属。忽略文件、链接、子模块、工作区外路径及未关联到 DSH 子代理的外部工作树不在覆盖范围内。目录捕获不是原子文件系统快照。";
var Recorder = class {
  constructor(ctx, snapshots, signal) {
    this.ctx = ctx;
    this.snapshots = snapshots;
    this.signal = signal;
    this.tasks = /* @__PURE__ */ new Map();
    this.current = /* @__PURE__ */ new Map();
    this.assigned = /* @__PURE__ */ new Map();
    this.headers = /* @__PURE__ */ new Map();
    this.running = /* @__PURE__ */ new Set();
    this.views = /* @__PURE__ */ new Map();
    this.watches = /* @__PURE__ */ new Map();
    this.timers = /* @__PURE__ */ new Map();
    this.jobs = /* @__PURE__ */ new Map();
    this.comparisons = /* @__PURE__ */ new Map();
    this.pendingCaptures = /* @__PURE__ */ new Map();
    this.dirty = /* @__PURE__ */ new Set();
  }
  async init() {
    await this.snapshots.init();
    const directory = path2.join(this.snapshots.root, "tasks");
    await fs2.mkdir(directory, { recursive: true });
    for (const name2 of (await fs2.readdir(directory)).filter((name3) => /^[a-f0-9-]+\.json$/.test(name3))) {
      try {
        const task = JSON.parse(await fs2.readFile(path2.join(directory, name2), "utf8"));
        if (task.version !== 1 || !task.id || !task.sessionId || !Array.isArray(task.repositories)) continue;
        if (task.status === "tracking") {
          task.status = "interrupted";
          task.warnings.push("Host 已重启：保留最后快照，重启期间及之后的变化未追溯");
        }
        this.tasks.set(task.id, task);
      } catch {
      }
    }
  }
  header(session) {
    this.headers.set(session.id, session.header);
    return session.header;
  }
  rootId(session) {
    this.header(session);
    let id = session.id;
    const seen = /* @__PURE__ */ new Set();
    while (!seen.has(id)) {
      seen.add(id);
      const header = this.headers.get(id) ?? this.ctx.agents.get(id)?.session?.header;
      if (!header?.parentSession) break;
      id = header.parentSession;
    }
    return id;
  }
  taskFor(session) {
    const assigned = this.assigned.get(session.id);
    return this.tasks.get(assigned ?? this.current.get(this.rootId(session)));
  }
  async save(task) {
    const destination = path2.join(this.snapshots.root, "tasks", `${task.id}.json`);
    const temporary = `${destination}.${randomUUID2()}.tmp`;
    try {
      await fs2.writeFile(temporary, JSON.stringify(task), { mode: 384 });
      await fs2.rename(temporary, destination);
    } finally {
      await fs2.rm(temporary, { force: true }).catch(() => {
      });
    }
  }
  queue(task, work) {
    const previous = this.jobs.get(task.id) ?? Promise.resolve();
    const next = previous.catch(() => {
    }).then(() => {
      this.signal.throwIfAborted();
      return work();
    }).catch((error) => {
      if (!this.signal.aborted) {
        task.warnings = [.../* @__PURE__ */ new Set([...task.warnings, error.code ? `快照捕获/保存失败（${error.code}）` : error.message])];
        task.status = "incomplete";
      }
    });
    this.jobs.set(task.id, next);
    return next;
  }
  start(session, event) {
    const sessionId = this.rootId(session);
    const previous = this.taskFor(session);
    const task = {
      version: 1,
      id: randomUUID2(),
      sessionId,
      turn: this.turns?.get(session.id) ?? 1,
      eventSeq: event.seq,
      started: Date.now(),
      updated: Date.now(),
      status: "tracking",
      warnings: [note],
      repositories: [],
      members: [session.id]
    };
    if ([...this.running].some((id) => this.rootId({ id, header: this.headers.get(id) ?? {} }) === sessionId && id !== session.id)) task.warnings.push("新用户消息到达时旧子代理仍在运行，两个任务时间窗口可能重叠");
    this.tasks.set(task.id, task);
    this.current.set(sessionId, task.id);
    this.assigned.set(session.id, task.id);
    if (previous && !this.active(previous)) {
      this.stopWatching(previous);
      clearTimeout(this.timers.get(previous.id));
      this.timers.delete(previous.id);
    }
    const previousJob = previous ? this.jobs.get(previous.id) : void 0;
    this.queue(task, async () => {
      await previousJob;
      await this.addRepository(task, session.header.cwd, false);
      await this.save(task);
    });
    return task;
  }
  async addRepository(task, cwd, secondary) {
    if (!cwd) {
      task.warnings.push("会话没有本地工作目录，无法建立文件基线");
      return;
    }
    let root;
    try {
      root = await this.snapshots.repository(cwd);
    } catch {
      task.warnings.push("未找到可读取的本地 Git 仓库；无法完整记录本轮改动");
      return;
    }
    if (task.repositories.some((repo) => repo.root.toLowerCase() === root.toLowerCase())) return;
    if (secondary) task.warnings.push(`额外仓库/工作树 ${root}：基线从首次观察到该子代理时建立，创建前改动无法追溯`);
    const before = await this.snapshots.working(root);
    task.repositories.push({ root, before, after: before });
    this.watch(task, root);
  }
  watch(task, root) {
    const key = `${task.id}:${root}`;
    if (this.watches.has(key) || this.signal.aborted) return;
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        const parts = String(filename ?? "").replace(/\\/g, "/").split("/");
        if (parts.some((part) => [".git", "node_modules", ".dsh"].includes(part))) return;
        this.schedule(task);
      });
      watcher.on("error", () => {
        task.warnings.push("目录监听中断；工具完成和手动刷新仍会重新读取工作区");
        watcher.close();
        this.watches.delete(key);
      });
      this.watches.set(key, watcher);
    } catch {
      task.warnings.push("无法递归监听目录；长命令运行中请使用手动刷新");
    }
  }
  schedule(task) {
    if (this.timers.has(task.id) || this.signal.aborted) return;
    const timer = setTimeout(() => {
      this.timers.delete(task.id);
      void this.capture(task);
    }, 1800);
    timer.unref?.();
    this.timers.set(task.id, timer);
  }
  active(task) {
    return task.members.some((id) => this.running.has(id) && this.assigned.get(id) === task.id);
  }
  stopWatching(task) {
    for (const [key, watcher] of this.watches) if (key.startsWith(`${task.id}:`)) {
      watcher.close();
      this.watches.delete(key);
    }
  }
  capture(task, force = false) {
    if (!force && this.pendingCaptures.has(task.id)) {
      this.dirty.add(task.id);
      return this.pendingCaptures.get(task.id);
    }
    const pending = this.queue(task, async () => {
      for (const repository of task.repositories) repository.after = await this.snapshots.working(repository.root);
      task.updated = Date.now();
      const active = this.active(task);
      task.status = active ? "tracking" : "settled";
      if (!active) this.stopWatching(task);
      await this.save(task);
    });
    this.pendingCaptures.set(task.id, pending);
    void pending.finally(() => {
      if (this.pendingCaptures.get(task.id) !== pending) return;
      this.pendingCaptures.delete(task.id);
      if (this.dirty.delete(task.id) && this.active(task)) this.schedule(task);
    });
    return pending;
  }
  created(agent) {
    const session = agent.session;
    this.header(session);
    if (!session.header.parentSession) return;
    const task = this.taskFor(session);
    if (!task) return;
    this.assigned.set(session.id, task.id);
    if (!task.members.includes(session.id)) task.members.push(session.id);
    this.running.add(session.id);
    this.queue(task, () => this.addRepository(task, session.header.cwd, true));
  }
  event(session, event) {
    this.header(session);
    if (event.type === "turn/start") {
      this.turns ??= /* @__PURE__ */ new Map();
      this.turns.set(session.id, event.data.turn);
      this.running.add(session.id);
      if (session.header.parentSession) {
        const parent = this.ctx.agents.get(session.header.parentSession)?.session;
        const task2 = parent ? this.taskFor(parent) : this.taskFor(session);
        if (task2) {
          this.assigned.set(session.id, task2.id);
          if (!task2.members.includes(session.id)) task2.members.push(session.id);
          this.queue(task2, async () => {
            await this.addRepository(task2, session.header.cwd, true);
            for (const repo of task2.repositories) this.watch(task2, repo.root);
          });
        }
      }
    }
    if (event.type === "user/message" && event.data?.source?.kind === "user" && !session.header.parentSession) this.start(session, event);
    const task = this.taskFor(session);
    if (event.type === "tool/result" && task) this.schedule(task);
    if (event.type === "turn/end") {
      this.running.delete(session.id);
      if (task) this.queue(task, async () => {
        if (!this.active(task)) {
          this.stopWatching(task);
          clearTimeout(this.timers.get(task.id));
          this.timers.delete(task.id);
          task.status = "settled";
          task.updated = Date.now();
          await this.save(task);
        }
      });
    }
  }
  async beforeTools(session) {
    const task = this.taskFor(session);
    if (!task) return;
    await this.queue(task, async () => {
      await this.addRepository(task, session.header.cwd, Boolean(session.header.parentSession));
      for (const repo of task.repositories) this.watch(task, repo.root);
    });
  }
  disposed(agent) {
    const wasRunning = this.running.delete(agent.session.id);
    const task = this.taskFor(agent.session);
    if (task && wasRunning) this.schedule(task);
  }
  async view(sessionId, mode, base, taskId, cwd, options = {}) {
    const histories = [...this.tasks.values()].filter((task2) => task2.sessionId === sessionId).sort((a, b) => b.started - a.started);
    const task = taskId ? histories.find((task2) => task2.id === taskId) : histories[0];
    const comparisons = [];
    let warnings = [], branches2 = [], selectedBase = base, status = "ready", commit;
    if (mode === "task") {
      if (!task) return { files: [], total: 0, added: 0, deleted: 0, warnings: ["尚无可信的本轮基线。请启用后开始一条新任务；不会用已有工作区修改冒充本轮改动。"], histories: [], status: "missing", turn: 1 };
      await this.jobs.get(task.id);
      warnings = [...task.warnings];
      status = task.status;
      let cached = this.comparisons.get(task.id);
      if (!cached || cached.updated !== task.updated) {
        cached = { updated: task.updated, promise: Promise.all(task.repositories.map((repository) => this.snapshots.compare(repository.before, repository.after))) };
        this.comparisons.set(task.id, cached);
        while (this.comparisons.size > 30) this.comparisons.delete(this.comparisons.keys().next().value);
      }
      comparisons.push(...await cached.promise);
    } else if (["staged", "unstaged", "commits"].includes(mode)) {
      const result = await reviewGitRange(this.snapshots, cwd, mode, options);
      comparisons.push(result.comparison);
      commit = result.commit;
    } else {
      const root = await this.snapshots.repository(cwd);
      if (mode === "uncommitted") {
        let before;
        try {
          before = await this.snapshots.committed(root, "HEAD");
        } catch {
          throw new Error("当前仓库没有可读取的 HEAD；未提交模式暂不支持未出生分支");
        }
        comparisons.push(await this.snapshots.compare(before, await this.snapshots.working(root, { normalizeForGit: true })));
      } else {
        branches2 = (await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes"], { signal: this.signal })).toString().trim().split("\n").filter(Boolean);
        if (!selectedBase) {
          try {
            selectedBase = (await git(root, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], { signal: this.signal })).toString().trim();
          } catch {
          }
          selectedBase ||= ["main", "master", "origin/main", "origin/master"].find((name2) => branches2.includes(name2));
          if (!selectedBase) {
            try {
              selectedBase = (await git(root, ["rev-parse", "--abbrev-ref", "@{upstream}"], { signal: this.signal })).toString().trim();
            } catch {
            }
          }
          selectedBase ||= branches2[0];
        }
        if (!selectedBase || !branches2.includes(selectedBase)) throw new Error("请选择仓库中存在的基准分支");
        const baseOid = (await git(root, ["rev-parse", "--verify", "--end-of-options", `${selectedBase}^{commit}`], { signal: this.signal })).toString().trim();
        const mergeBase = (await git(root, ["merge-base", baseOid, "HEAD"], { signal: this.signal })).toString().trim();
        comparisons.push(await this.snapshots.compare(await this.snapshots.committed(root, mergeBase), await this.snapshots.committed(root, "HEAD")));
      }
    }
    const files = [];
    for (let at = 0; at < comparisons.length; at++) for (let index = 0; index < comparisons[at].files.length; index++) files.push({ ...comparisons[at].files[index], repository: comparisons[at].root, comparison: at, entry: index });
    warnings.push(...comparisons.flatMap((comparison) => comparison.warnings));
    const token = randomUUID2();
    this.views.set(token, { sessionId, comparisons, files, time: Date.now() });
    while (this.views.size > 24) this.views.delete(this.views.keys().next().value);
    return {
      token,
      files,
      total: files.length,
      added: files.reduce((sum, file) => sum + file.added, 0),
      deleted: files.reduce((sum, file) => sum + file.deleted, 0),
      warnings: [...new Set(warnings)],
      status,
      branches: branches2,
      base: selectedBase,
      commit,
      turn: task?.turn ?? 1,
      taskId: task?.id,
      updated: task?.updated,
      histories: histories.slice(0, 30).map((entry) => ({ id: entry.id, started: entry.started, status: entry.status }))
    };
  }
  async diff(sessionId, token, index) {
    const view = this.views.get(token), file = view?.files[index];
    if (!view || view.sessionId !== sessionId || !file) throw new Error("审查快照已过期，请刷新");
    return this.snapshots.diff(view.comparisons[file.comparison], file.entry);
  }
  async close() {
    for (const watcher of this.watches.values()) watcher.close();
    for (const timer of this.timers.values()) clearTimeout(timer);
    await Promise.allSettled(this.jobs.values());
  }
};

// src/index.js
var name = "dsh-task-diff-review";
var inject = ["connection", "agents", "sessionQuery"];
function apply(ctx) {
  const lifetime = new AbortController();
  const root = path3.join(process.env.DSH_HOME || path3.join(os.homedir(), ".dsh"), "plugin-data", name);
  const recorder = new Recorder(ctx, new Snapshots(root, lifetime.signal), lifetime.signal);
  const ready = recorder.init();
  void ready.catch((error) => ctx.logger.warn(`${name}: storage unavailable: ${error.code || error.message}`));
  const headers = /* @__PURE__ */ new Map();
  const headerFor = async (sessionId) => {
    const live = ctx.agents.get(sessionId)?.session;
    if (live) return live.header;
    if (!headers.has(sessionId)) {
      if (headers.size >= 100) headers.delete(headers.keys().next().value);
      headers.set(sessionId, ctx.sessionQuery.readSession(sessionId).then((result) => result.session).catch((error) => {
        headers.delete(sessionId);
        throw error;
      }));
    }
    return headers.get(sessionId);
  };
  const ownerFor = async (sessionId) => {
    const seen = /* @__PURE__ */ new Set();
    while (!seen.has(sessionId) && seen.size < 32) {
      seen.add(sessionId);
      const header = await headerFor(sessionId);
      if (!header.parentSession) return sessionId;
      sessionId = header.parentSession;
    }
    throw new Error("无法可靠解析父子会话关系");
  };
  const run = (work) => {
    void ready.then(work).catch((error) => ctx.logger.warn(`${name}: ${error.message}`));
  };
  ctx.on("session/event", (session, event) => run(() => recorder.event(session, event)));
  ctx.on("agent/created", ({ agent }) => run(() => recorder.created(agent)));
  ctx.on("agent/disposed", ({ agent }) => run(() => recorder.disposed(agent)));
  ctx.on("agent/turn-stopping", async ({ agent }) => {
    try {
      await ready;
      const task = recorder.taskFor(agent.session);
      if (task) await recorder.capture(task, true);
    } catch (error) {
      ctx.logger.warn(`${name}: final capture unavailable: ${error.message}`);
    }
  });
  ctx.on("tools/pre-execute", async (exec, next) => {
    try {
      await ready;
      if (exec.agent?.session) await recorder.beforeTools(exec.agent.session);
    } catch (error) {
      ctx.logger.warn(`${name}: baseline unavailable: ${error.message}`);
    }
    return next();
  });
  ctx.effect(() => async () => {
    lifetime.abort();
    await ready.catch(() => {
    });
    await recorder.close();
  });
  for (const kind of ["summary", "diff", "refresh", "history"]) ctx.connection.fetch.register({
    path: `/api/task-diff.${kind}`,
    methods: ["GET"],
    requestBody: "buffered",
    async fetch(request) {
      try {
        await ready;
        const query = new URL(request.url).searchParams, sessionId = query.get("sessionId");
        if (!sessionId || sessionId.length > 256) return new Response("Invalid session", { status: 400 });
        let result;
        if (kind === "diff") {
          const index = Number(query.get("index"));
          if (!Number.isSafeInteger(index) || index < 0) return new Response("Invalid index", { status: 400 });
          result = await recorder.diff(await ownerFor(sessionId), query.get("token"), index);
        } else if (kind === "history") {
          const header = await headerFor(sessionId);
          result = await commitHistory(recorder.snapshots, header.cwd, { branch: query.get("branch") || "HEAD", query: query.get("query") || "", offset: Number(query.get("offset") || 0), tip: query.get("tip") || "" });
        } else {
          const mode = query.get("mode") || "task";
          if (!["task", "uncommitted", "staged", "unstaged", "branch", "commits"].includes(mode)) return new Response("Invalid mode", { status: 400 });
          const header = await headerFor(sessionId), owner = await ownerFor(sessionId);
          if (kind === "refresh" && mode === "task") {
            const task = recorder.tasks.get(recorder.current.get(owner));
            if (task && recorder.active(task)) await recorder.capture(task, true);
          }
          result = await recorder.view(owner, mode, query.get("base"), query.get("taskId"), header.cwd, { commit: query.get("commit"), parent: query.get("parent") });
        }
        return Response.json(result, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
      } catch (error) {
        return Response.json({ error: error.message }, { status: 422, headers: { "cache-control": "no-store" } });
      }
    }
  });
}
export {
  apply,
  inject,
  name
};
