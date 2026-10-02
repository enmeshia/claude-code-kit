#!/bin/sh
# Checks the agent guide at session start. Prints nothing when the guide is healthy.
#
# Runs as a SessionStart hook (.claude/settings.json). Whatever it prints goes into Claude's
# context, at most MAX_LINES problems. The guide files are CLAUDE.md and the .md files in
# .claude/rules, .claude/skills and .claude/docs. Current docs are those files except each
# history.md. It checks:
# - Paths: repo paths in backticks in the guide files exist. A token counts as a repo path when it
#   has a slash and starts with .claude/ or with a folder or file that exists at the repo root.
# - Globs: the folder part of every `paths:` glob in the guide files exists.
#   Neither check tests a path through .git or a skipped folder (SKIP_PREFIXES, SKIP_FOLDERS), and
#   a missing path that git ignores is fine: a fresh clone or worktree lacks it.
# - Areas: docs sit inside an area folder, not loose in .claude/docs.
# - Docs lists: every folder in .claude/docs has a README.md whose "## Docs" list names each doc
#   and subfolder next to it, and names nothing that is gone.
# - History: every record (each .md in .claude/research, .claude/plans, .claude/handoff, done/
#   included) is named, by file name, in at least one history.md under .claude/docs.
# - Lines: CLAUDE.md is at most LINE_BUDGET lines, not counting HTML comments.
# - Skill size: each .claude/skills/<name>/SKILL.md is at most SKILL_LIMIT bytes, about 5,000
#   tokens. After a context compaction only about the first 5,000 tokens of a skill come back.
# - Run records: no current doc has a "Test records" heading or a heading ending in ", DD-MM-YYYY".
# - Done links: no current doc names a path inside a done/ folder. history.md points there instead.
# - History entries: each "## " entry of a history.md is at most ENTRY_LIMIT bytes. An entry only
#   points to its log, so nothing is lost.
# - Repeats: no sentence of REPEAT_MIN or more characters (markup removed, case ignored) is in two
#   current docs. Each fact has one home.
# - Code links: paths to .md files under .claude/ named in code (CODE_FILES outside .claude/)
#   exist. In a git repo it reads tracked and untracked files and skips what .gitignore ignores.
# Lines, skill size and history entries are the only three size limits. No decision, design, tech
# or topic doc has one: a cap there would force real decisions out. A track README's "Where it
# stands" is at most 12 lines, a writing rule this check does not test. The run-record, done-link
# and repeat checks keep docs from turning into logs.
# Bytes are counted with CRLF turned into LF, as git stores the text, so the result does not depend
# on the checkout's line endings. It reads no record's text (plans, logs, handoffs, research): a
# plan names files its later phases make.
#
# Plain POSIX sh and awk, so it runs on macOS, Linux and Windows (Git Bash) with nothing to
# install. It starts few processes, because each one is slow to start in Git Bash. It always exits
# 0: a hook must not block a session.
# To check another repo's guide by hand: sh check-guide.sh <repo root>

LINE_BUDGET=200
SKILL_LIMIT=20000
ENTRY_LIMIT=1500
REPEAT_MIN=120
MAX_LINES=15
# Made on first use or generated, so they can be missing in a fresh clone or worktree. Not an
# error. Paths under these prefixes, or through a folder with one of these names, are not checked.
# In a git repo, a missing path that git ignores is never reported, so add a folder here only when
# git does not ignore it, or the project is not in git.
SKIP_PREFIXES=""
SKIP_FOLDERS="node_modules .venv venv __pycache__ dist build out target .next"
# Code files whose paths to .md files under .claude/ are checked.
CODE_FILES="*.sh *.py *.js *.mjs *.cjs *.jsx *.ts *.tsx *.mts *.cts *.cs *.go *.rs *.java *.kt
*.kts *.swift *.rb *.php *.c *.h *.cc *.cpp *.hpp *.m *.mm *.lua *.dart *.scala *.ex *.exs *.ps1
*.gd *.vue *.svelte *.astro"

NAME=".claude/hooks/check-guide.sh"
if [ -n "$1" ]; then ROOT=$1; else ROOT=$(dirname "$0")/../..; fi
if ! cd "$ROOT" 2>/dev/null; then
  echo "Guide check ($NAME) failed to run: no folder $ROOT"
  exit 0
fi
TAB=$(printf '\t')
NL='
'

# Lines of code files that contain ".claude/", as "path:line:text".
code_hits() {
  set -f
  # shellcheck disable=SC2086 # split the list into patterns, globbing is off
  set -- $CODE_FILES
  set +f
  git -c core.quotepath=off grep -n -I --untracked -F -e .claude/ -- "$@" 2>/dev/null
  [ $? -le 1 ] && return 0
  # Not a git repo (or no git): plain grep, without the skipped folders.
  set -f
  set --
  for pattern in $CODE_FILES; do set -- "$@" "--include=$pattern"; done
  for folder in $SKIP_FOLDERS .git .claude; do set -- "$@" "--exclude-dir=$folder"; done
  set +f
  grep -rnIF "$@" -e .claude/ . 2>/dev/null
  return 0
}

# One awk pass reads the file lists and the code lines from stdin, then the guide files, and
# prints one line per finding: "X<TAB>.<TAB>.<TAB>message" for a problem, or a path for the shell
# loop below to test: "P<TAB>file<TAB>line<TAB>path", "G<TAB>file<TAB>glob<TAB>folder" and
# "C<TAB>file<TAB>line<TAB>path". It runs in the C locale, so length() counts bytes.
CHECKS='
function X(msg) { print "X\t.\t.\t" msg }
function trim(s) { sub(/^[ \t\n\r\f\v]+/, "", s); sub(/[ \t\n\r\f\v]+$/, "", s); return s }
function base(p) { sub(/.*\//, "", p); return p }
function parent(p) { if (!index(p, "/")) return ""; sub(/\/[^\/]*$/, "", p); return p }
# A word character, as \w in Python: bytes of non-ASCII characters count as letters.
function isword(c) { return c != "" && (c ~ /[A-Za-z0-9_]/ || c >= HIGH) }
function commas(n,   s, out) {
  s = n ""; out = ""
  while (length(s) > 3) { out = "," substr(s, length(s) - 2) out; s = substr(s, 1, length(s) - 3) }
  return s out
}
# Characters, not bytes, of UTF-8 text.
function clen(s,   c) { if (s !~ HIGHRE) return length(s); c = s; gsub(CONTRE, "", c); return length(c) }
function cut(s, n,   i, c, k) {
  if (length(s) <= n) return s
  for (i = 1; i <= length(s); i++) {
    c = substr(s, i, 1)
    if (!(c >= HIGH && c < LEAD) && ++k > n) return substr(s, 1, i - 1)
  }
  return s
}
function skipped(t,   n, m, i, j, p, f, parts) {
  if (t !~ /\/$/) t = t "/"
  n = split(skip_prefixes, p, " ")
  for (i = 1; i <= n; i++) if (index(t, p[i]) == 1) return 1
  n = split(t, parts, "/")
  m = split(skip_folders, f, " ")
  for (i = 1; i < n; i++) {
    if (parts[i] == ".git") return 1
    for (j = 1; j <= m; j++) if (parts[i] == f[j]) return 1
  }
  return 0
}
# Sorts a[1..n]. With bypart, by path parts, as Python sorts paths.
function sortlist(a, n, bypart,   i, j, v, k, K) {
  for (i = 1; i <= n; i++) { k = a[i] ""; if (bypart) gsub(/\//, SOH, k); K[i] = k }
  for (i = 2; i <= n; i++) {
    v = a[i]; k = K[i]
    for (j = i - 1; j > 0 && K[j] > k; j--) { a[j + 1] = a[j]; K[j + 1] = K[j] }
    a[j + 1] = v; K[j + 1] = k
  }
}
function slurp(f,   rs, t, chunk) {
  rs = RS; RS = SOH; t = ""
  while ((getline chunk < f) > 0) t = t chunk
  close(f); RS = rs
  gsub(/\r\n/, "\n", t)
  return t
}
function splitlines(t, L,   n) {
  n = split(t, L, "\n")
  if (n > 0 && L[n] == "") { delete L[n]; n-- }
  return n
}
# The text without HTML comments. With keep, each comment leaves its newlines, so line numbers stay.
function decomment(t, keep,   out, i, j, rest, c) {
  out = ""
  while ((i = index(t, "<!--")) > 0) {
    rest = substr(t, i + 4)
    if (!(j = index(rest, "-->"))) break
    out = out substr(t, 1, i - 1)
    if (keep) { c = substr(rest, 1, j - 1); c = gsub(/\n/, "", c); while (c-- > 0) out = out "\n" }
    t = substr(rest, j + 3)
  }
  return out t
}
# The lines outside fenced code blocks into PL, their line numbers into PN. Returns the count.
function prose(t, PL, PN,   L, n, i, k, fence, mark) {
  split("", PL); split("", PN)
  n = splitlines(t, L); fence = ""; k = 0
  for (i = 1; i <= n; i++) {
    if (match(L[i], /^[ \t\r\f\v]*(```|~~~)/)) {
      mark = substr(L[i], RSTART + RLENGTH - 3, 3)
      if (fence == "") fence = mark; else if (mark == fence) fence = ""
      continue
    }
    if (fence == "") { PL[++k] = L[i]; PN[k] = i }
  }
  return k
}
# Repo doc paths in a line into LK, returns the count. Mode "md": paths to .md files under .claude/.
# Mode "done": paths to something inside a done/ folder (the bare folder does not count). A path
# inside a longer path, like ~/.claude/CLAUDE.md, does not count.
function scan(line, mode, LK,   n, s, off, p, at, prev, R, k, q, a, nx) {
  split("", LK); n = 0; off = 0; s = line
  while ((p = index(s, ".claude/")) > 0) {
    at = off + p; off = at; s = substr(line, at + 1)
    prev = (at > 1) ? substr(line, at - 1, 1) : ""
    if (isword(prev) || prev == "~" || prev == "/" || prev == "." || prev == "-") continue
    match(substr(line, at), /^[A-Za-z0-9_.\/-]+/)
    R = substr(line, at, RLENGTH)
    for (k = 9; (q = index(substr(R, k), mode == "md" ? ".md" : "/done/")) > 0; k = a + 1) {
      a = k + q - 1
      if (mode == "md") {
        if (!isword(substr(line, at + a + 2, 1))) { LK[++n] = substr(R, 1, a + 2); break }
      } else if (substr(R, a + 6, 1) ~ /[A-Za-z0-9_.-]/) { LK[++n] = R; break }
    }
  }
  return n
}
function pick(prefix, arr, n,   i) {
  for (i = 1; i <= nf; i++) if (index(files[i], prefix) == 1 && files[i] ~ /\.md$/) arr[++n] = files[i]
  return n
}

function doc_lists(   i, j, d, e, ne, ents, readme, t, p, rest, name, nl, names, listed, target, nm) {
  ne = 0
  for (i = 1; i <= nd; i++) ents[++ne] = dirs[i]
  for (i = 1; i <= nf; i++) if (index(files[i], ".claude/docs/") == 1) ents[++ne] = files[i]
  sortlist(ents, ne, 1)
  for (i = 1; i <= ne; i++)
    if (!(ents[i] in isdir) && parent(ents[i]) == ".claude/docs")
      X("`" ents[i] "` is outside the docs areas: move it into an area folder such as `product/`, `tech/` or a track")
  for (i = 1; i <= nd; i++) {
    d = dirs[i]; readme = d "/README.md"
    if (!(readme in isfile)) { X("`" d "/` has no README.md listing its docs"); continue }
    t = txt[readme]
    if (!(p = index(t, "\n## Docs"))) { X(readme " has no \"## Docs\" list"); continue }
    rest = substr(t, p + 8); split("", listed); nl = 0
    while (match(rest, /`[A-Za-z0-9_.-]+(\.md|\/)`/)) {
      name = substr(rest, RSTART + 1, RLENGTH - 2); rest = substr(rest, RSTART + RLENGTH)
      if (!(name in listed)) { listed[name] = 1; names[++nl] = name }
    }
    sortlist(names, nl, 0)
    for (j = 1; j <= nl; j++) {
      target = d "/" names[j]; sub(/\/$/, "", target)
      if (!(target in isfile) && !(target in isdir)) X(readme " lists `" names[j] "`, which does not exist")
    }
    for (j = 1; j <= ne; j++) {
      e = ents[j]
      if (parent(e) != d) continue
      if (e in isdir) nm = base(e) "/"; else if (e ~ /\.md$/ && base(e) != "README.md") nm = base(e); else continue
      if (!(nm in listed)) X("`" e "` is missing from the list in " readme)
    }
  }
}

# The whole file name: `x-plan.md` must not count for `fit-x-plan.md` or `x-plan.md.bak`.
function named(name, text,   s, off, p, at, b, a, a2) {
  s = text; off = 0
  while ((p = index(s, name)) > 0) {
    at = off + p
    b = (at > 1) ? substr(text, at - 1, 1) : ""
    a = substr(text, at + length(name), 1); a2 = substr(text, at + length(name) + 1, 1)
    if (!isword(b) && b != "." && b != "-" && !isword(a) && a != "-" && !(a == "." && isword(a2))) return 1
    off = at; s = substr(text, at + 1)
  }
  return 0
}
function history(   i, ht, recs, nr) {
  ht = ""
  for (i = 1; i <= ng; i++)
    if (index(guide[i], ".claude/docs/") == 1 && base(guide[i]) == "history.md") ht = ht (ht == "" ? "" : "\n") txt[guide[i]]
  nr = pick(".claude/research/", recs, 0)
  nr = pick(".claude/plans/", recs, nr)
  nr = pick(".claude/handoff/", recs, nr)
  for (i = 1; i <= nr; i++) if (!named(base(recs[i]), ht)) X("`" recs[i] "` is missing from every history.md")
}

function glob(f, g,   n, parts, i, folder) {
  g = trim(g); gsub("^[\"" q "]+|[\"" q "]+$", "", g)
  if (g == "") return
  n = split(g, parts, "/"); folder = ""
  for (i = 1; i <= n; i++) {
    if (parts[i] ~ /[*?{]/ || index(parts[i], "[")) break
    folder = (i == 1) ? parts[i] : folder "/" parts[i]
  }
  if (folder != "" && !skipped(folder)) print "G\t" f "\t" g "\t" folder
}
# The `paths:` globs of the front matter: from a first line "---" to the next "\n---".
function globs(f, t,   e, n, L, i, line, rest, items, m, j, inpaths, g) {
  if (substr(t, 1, 4) != "---\n" || !(e = index(substr(t, 5), "\n---"))) return
  n = split(substr(t, 5, e - 1), L, "\n"); inpaths = 0
  for (i = 1; i <= n; i++) {
    line = L[i]
    if (substr(line, 1, 6) == "paths:") {
      rest = trim(substr(line, 7)); inpaths = (rest == "")
      if (!inpaths) { gsub(/^\[|\]$/, "", rest); m = split(rest, items, ","); for (j = 1; j <= m; j++) glob(f, items[j]) }
    } else if (inpaths && line ~ /^[ \t\r\f\v]*- /) { g = line; sub(/^[ \t\r\f\v]*- /, "", g); glob(f, g) }
    else inpaths = 0
  }
}
function run_heading(line,   l) {
  if (line !~ /^##?#?#?#?#?[ \t\r\f\v]/) return 0
  l = tolower(line)
  return index(l, "test records") > 0 || l ~ /,[ \t\r\f\v]*[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9][ \t\r\f\v]*#*[ \t\r\f\v]*$/
}
function per_file(f,   t, n, L, i, s, tok, first, c, lines, k, PL, PN, m, j, LK) {
  t = txt[f]
  n = splitlines(t, L)
  for (i = 1; i <= n; i++) {
    s = L[i]
    while (match(s, /`[^`]+`/)) {
      tok = substr(s, RSTART + 1, RLENGTH - 2)
      s = substr(s, RSTART + RLENGTH)
      if (tok !~ /\// || tok ~ /[<>*?{} $\t]/) continue
      first = tok
      sub(/\/.*/, "", first)
      if (first == "" || first == "." || first == ".." || first == "~" || skipped(tok)) continue
      print "P\t" f "\t" i "\t" tok
    }
  }
  globs(f, t)
  if (f ~ /^\.claude\/skills\/[^\/]+\/SKILL\.md$/ && length(t) > skill_limit + 0)
    X(f " is " commas(length(t)) " bytes, over the " commas(skill_limit) "-byte limit for a SKILL.md. " MOVE)
  if (f == "CLAUDE.md") {
    c = trim(decomment(t, 0))
    lines = gsub(/\n/, "\n", c) + 1
    if (lines > budget + 0) X("CLAUDE.md is " lines " lines without comments, over its " budget "-line limit. " MOVE)
  }
  if (base(f) == "history.md") return
  k = prose(decomment(t, 1), PL, PN)
  for (i = 1; i <= k; i++)
    if (run_heading(PL[i]))
      X(f ":" PN[i] " has a run-record heading. Current docs hold what is true now; the run belongs in the log")
  for (i = 1; i <= n; i++) {
    if (!index(L[i], "/done/")) continue
    m = scan(L[i], "done", LK)
    for (j = 1; j <= m; j++) X(f ":" i " points into done/ (" LK[j] "). Point to the history.md entry instead")
  }
}

# Each "## " entry of a history.md, from its heading to the next one, fits the entry limit.
function entry(f, e,   n, title) {
  sub(/[ \t\n\r\f\v]+$/, "", e)
  n = length(e) + 1
  if (n <= entry_limit + 0) return
  title = e; sub(/\n.*/, "", title); title = trim(substr(title, 4))
  X(f ": entry \"" title "\" is " commas(n) " bytes, over " commas(entry_limit))
}
function entries(   i, f, k, PL, PN, j, cur, has) {
  for (i = 1; i <= ng; i++) {
    f = guide[i]
    if (index(f, ".claude/docs/") != 1 || base(f) != "history.md") continue
    k = prose(txt[f], PL, PN); has = 0
    for (j = 1; j <= k; j++) {
      if (substr(PL[j], 1, 3) == "## ") { if (has) entry(f, cur); cur = PL[j]; has = 1 }
      else if (has) cur = cur "\n" PL[j]
    }
    if (has) entry(f, cur)
  }
}

# Repeats. A sentence without markdown: link text kept, marks and leading list or heading marks gone.
function delink(s,   out, p, q, r, rest, k) {
  out = ""
  while ((p = index(s, "[")) > 0) {
    rest = substr(s, p + 1); q = index(rest, "]")
    if (q && substr(rest, q + 1, 1) == "(" && (r = index(substr(rest, q + 2), ")")) > 0) {
      k = (p > 1 && substr(s, p - 1, 1) == "!") ? p - 1 : p
      out = out substr(s, 1, k - 1) substr(rest, 1, q - 1)
      s = substr(rest, q + 2 + r)
    } else { out = out substr(s, 1, p); s = rest }
  }
  return out s
}
# Drops each run of underscores that does not sit inside a word.
function unders(s,   out, rest, off, a, b) {
  out = ""; rest = s; off = 0
  while (match(rest, /_+/)) {
    a = off + RSTART; b = a + RLENGTH - 1
    out = out substr(rest, 1, RSTART - 1)
    if (a > 1 && isword(substr(s, a - 1, 1)) && isword(substr(s, b + 1, 1))) out = out substr(rest, RSTART, RLENGTH)
    off = b; rest = substr(s, b + 1)
  }
  return out rest
}
function plain(s) {
  if (index(s, "](")) s = delink(s)
  if (index(s, "_")) s = unders(s)
  gsub(/\*+|`/, "", s)
  s = trim(s)
  sub(/^(#+|[-+]|[0-9]+[.)])[ \t\r\f\v]+/, "", s)
  gsub(/[ \t\r\f\v]+/, " ", s)
  return trim(s)
}
function sentence(f, s,   key) {
  if (length(s) < repeat_min + 0) return
  s = plain(s); key = tolower(s)
  if (length(key) < repeat_min + 0 || clen(key) < repeat_min + 0) return
  if (!(key in kfirst)) { kfirst[key] = s; korder[++nk] = key; wn[key] = 0 }
  if (wn[key] == 0 || wf[key, wn[key]] != f) wf[key, ++wn[key]] = f
}
function sentences(f, u,   s, e) {
  while (match(u, SENT)) {
    s = RSTART; e = RSTART + RLENGTH - 1
    sentence(f, substr(u, 1, s))
    u = substr(u, e)
  }
  sentence(f, u)
}
# Paragraphs, list items and table cells of each current doc, each as one line of prose.
function repeats(   i, f, t, e, k, PL, PN, j, st, c, unit, cells, m, x) {
  for (i = 1; i <= ng; i++) {
    f = guide[i]
    if (base(f) == "history.md") continue
    t = decomment(txt[f], 0)
    if (substr(t, 1, 4) == "---\n" && (e = index(substr(t, 5), "\n---\n"))) t = substr(t, e + 9)
    k = prose(t, PL, PN); unit = ""
    for (j = 1; j <= k; j++) {
      st = trim(PL[j]); c = substr(st, 1, 1)
      if (st == "" || c == "|" || c == "#" || PL[j] ~ /^[ \t\r\f\v]*([-*+]|[0-9]+[.)])[ \t\r\f\v]/) {
        if (unit != "") sentences(f, unit)
        unit = ""
      }
      if (c == "|") { gsub(/^\|+|\|+$/, "", st); m = split(st, cells, "|"); for (x = 1; x <= m; x++) sentences(f, cells[x]) }
      else if (c == "#") sentences(f, st)
      else if (st != "") unit = (unit == "") ? st : unit " " st
    }
    if (unit != "") sentences(f, unit)
  }
  for (i = 1; i <= nk; i++)
    for (j = 2; j <= wn[korder[i]]; j++)
      X("\"" cut(kfirst[korder[i]], 80) "...\" is in both " wf[korder[i], 1] " and " wf[korder[i], j] ". Keep it in one home")
}

function code_links(   i, line, p, path, num, m, LK, j) {
  for (i = 1; i <= nc; i++) {
    line = code[i]; sub(/\r$/, "", line)
    if (substr(line, 1, 2) == "./") line = substr(line, 3)
    if (!(p = index(line, ":"))) continue
    path = substr(line, 1, p - 1); line = substr(line, p + 1)
    if (!(p = index(line, ":"))) continue
    num = substr(line, 1, p - 1); line = substr(line, p + 1)
    if (index(path, ".claude/") == 1 || skipped(path)) continue
    m = scan(line, "md", LK)
    for (j = 1; j <= m; j++) print "C\t" path "\t" num "\t" LK[j]
  }
}

BEGIN {
  SOH = sprintf("%c", 1); HIGH = sprintf("%c", 128); LEAD = sprintf("%c", 192)
  HIGHRE = "[" HIGH "-" sprintf("%c", 255) "]"
  CONTRE = "[" HIGH "-" sprintf("%c", 191) "]"
  SENT = "[.!?][ \t\r\f\v]+[A-Z`*(\"" q "]"
  MOVE = "Move a part that only some tasks need into a rule file, a skill reference file or a topic doc. Never delete it"
}
$0 == "@dirs" { mode = 1; next }
$0 == "@files" { mode = 2; next }
$0 == "@code" { mode = 3; next }
mode == 1 { if (!($0 in isdir)) { isdir[$0] = 1; dirs[++nd] = $0 }; next }
mode == 2 { if (!($0 in isfile)) { isfile[$0] = 1; files[++nf] = $0 }; next }
mode == 3 { code[++nc] = $0 }
END {
  sortlist(files, nf, 1); sortlist(dirs, nd, 1)
  ng = 0
  if ("CLAUDE.md" in isfile) guide[++ng] = "CLAUDE.md"
  ng = pick(".claude/rules/", guide, ng)
  ng = pick(".claude/skills/", guide, ng)
  ng = pick(".claude/docs/", guide, ng)
  for (i = 1; i <= ng; i++) txt[guide[i]] = slurp(guide[i])
  doc_lists()
  history()
  for (i = 1; i <= ng; i++) per_file(guide[i])
  entries()
  repeats()
  code_links()
}
'

problems=$(
  {
    echo @dirs
    find .claude/docs -mindepth 1 -type d 2>/dev/null
    echo @files
    [ -f CLAUDE.md ] && echo CLAUDE.md
    find .claude/rules .claude/skills .claude/docs .claude/research .claude/plans .claude/handoff \
      -type f 2>/dev/null
    echo @code
    code_hits
  } | LC_ALL=C awk -v q="'" -v skip_prefixes="$SKIP_PREFIXES" -v skip_folders="$SKIP_FOLDERS" \
    -v budget="$LINE_BUDGET" -v skill_limit="$SKILL_LIMIT" -v entry_limit="$ENTRY_LIMIT" \
    -v repeat_min="$REPEAT_MIN" "$CHECKS" | {
    # Each problem waits in $held as "path<TAB>problem" ("." when it names no path), so that one
    # git call can drop the missing paths git ignores: a fresh clone or worktree lacks them.
    held=
    missing=
    while IFS="$TAB" read -r kind file a b; do
      case $kind in
        P)
          case $b in
            .claude/*) ;;
            *) [ -e "${b%%/*}" ] || continue ;;
          esac
          [ -e "$b" ] && continue
          problem="$file:$a names \`$b\`, which does not exist"
          ;;
        G)
          [ -e "$b" ] && continue
          problem="$file: glob \"$a\" points into \`$b\`, which does not exist"
          b=${b%/}/ # a folder, so git matches ignore patterns like "out/"
          ;;
        C)
          [ -e "$b" ] && continue
          problem="$file:$a names \`$b\`, which does not exist"
          ;;
        *) problem=$b; b=. ;;
      esac
      held="$held$b$TAB$problem$NL"
      [ "$b" != . ] && missing="$missing$b$NL"
    done
    ignored=
    if [ -n "$missing" ]; then
      ignored=$(printf '%s' "$missing" | git -c core.quotepath=off check-ignore --stdin 2>/dev/null)
    fi
    count=0
    while IFS="$TAB" read -r path problem; do
      [ -z "$problem" ] && continue
      case "$NL$ignored$NL" in *"$NL$path$NL"*) continue ;; esac
      count=$((count + 1))
      [ "$count" -le "$MAX_LINES" ] && echo "- $problem"
    done <<EOF
$held
EOF
    [ "$count" -gt "$MAX_LINES" ] && echo "- ... and $((count - MAX_LINES)) more"
  }
)
if [ -n "$problems" ]; then
  echo "Guide check ($NAME) found problems in the agent guide:"
  echo "$problems"
  echo "Fix them if your change caused them. Otherwise tell the owner."
fi
exit 0
