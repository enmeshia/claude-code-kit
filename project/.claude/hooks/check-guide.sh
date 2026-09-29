#!/bin/sh
# Checks the agent guide at session start. Prints nothing when the guide is healthy.
#
# Runs as a SessionStart hook (.claude/settings.json). Whatever it prints goes into Claude's
# context. It checks that:
# - repo paths written in backticks in CLAUDE.md, .claude/rules, .claude/skills and .claude/docs
#   exist. A token counts as a repo path when it has a slash and starts with .claude/ or with a
#   folder or file that exists at the repo root,
# - the folder part of every `paths:` glob in those files exists,
# - docs sit inside an area folder, not loose in .claude/docs,
# - every folder in .claude/docs has a README.md whose "## Docs" list names each doc and subfolder
#   next to it, and names nothing that is gone,
# - every research doc, plan and handoff named after a track (DD-MM-YYYY-<track>-...) is in that
#   track's README,
# - CLAUDE.md stays within its line budget, not counting HTML comments.
#
# Plain POSIX sh and awk, so it runs on macOS, Linux and Windows (Git Bash) with nothing to
# install. It starts few processes, because each one is slow to start in Git Bash.
# To check another repo's guide by hand: sh check-guide.sh <repo root>

LINE_BUDGET=150
# Made on first use or generated, so they can be missing in a fresh clone or worktree. Not an
# error. Paths under these prefixes, or through a folder with one of these names, are not checked.
# Add your project's generated folders here if the guide names paths inside them.
SKIP_PREFIXES=".claude/plans/ .claude/handoff/"
SKIP_FOLDERS="node_modules .venv venv __pycache__ dist build out target .next"

NAME=".claude/hooks/check-guide.sh"
if [ -n "$1" ]; then ROOT=$1; else ROOT=$(dirname "$0")/../..; fi
if ! cd "$ROOT" 2>/dev/null; then
  echo "Guide check ($NAME) failed to run: no folder $ROOT"
  exit 0
fi
TAB=$(printf '\t')

# Paths named in backticks, and the folders of `paths:` globs. One awk pass over all guide files
# prints "P<TAB>file<TAB>line<TAB>path" and "G<TAB>file<TAB>glob<TAB>folder" lines, and this shell
# loop checks that each one exists.
check_paths_and_globs() {
  set --
  [ -f CLAUDE.md ] && set -- CLAUDE.md
  old_ifs=$IFS
  IFS='
'
  set -f
  for file in $(find .claude/rules .claude/skills .claude/docs -type f -name '*.md' 2>/dev/null | sort); do
    set -- "$@" "$file"
  done
  set +f
  IFS=$old_ifs
  [ $# -gt 0 ] || return 0
  awk -v q="'" -v skip_prefixes="$SKIP_PREFIXES" -v skip_folders="$SKIP_FOLDERS" '
    function skipped(t,   n, m, i, j, p, f, parts) {
      if (t !~ /\/$/) t = t "/"
      n = split(skip_prefixes, p, " ")
      for (i = 1; i <= n; i++) if (index(t, p[i]) == 1) return 1
      n = split(t, parts, "/")
      m = split(skip_folders, f, " ")
      for (i = 1; i < n; i++) for (j = 1; j <= m; j++) if (parts[i] == f[j]) return 1
      return 0
    }
    function glob(g,   n, i, parts, folder) {
      gsub(/^[ \t]+|[ \t]+$/, "", g)
      gsub("^[\"" q "]|[\"" q "]$", "", g)
      if (g == "") return
      n = split(g, parts, "/")
      folder = ""
      for (i = 1; i <= n; i++) {
        if (parts[i] ~ /[*?{]/ || index(parts[i], "[") > 0) break
        folder = (i == 1) ? parts[i] : (folder "/" parts[i])
      }
      if (folder != "" && !skipped(folder)) print "G\t" FILENAME "\t" g "\t" folder
    }
    { sub(/\r$/, "") }
    # Frontmatter: from a "---" first line to the next "---".
    FNR == 1 { front = ($0 == "---"); inpaths = 0 }
    front && FNR > 1 && $0 == "---" { front = 0 }
    front && /^paths:/ {
      rest = substr($0, 7)
      gsub(/^[ \t]+|[ \t]+$/, "", rest)
      inpaths = (rest == "")
      if (!inpaths) {
        gsub(/^\[|\]$/, "", rest)
        n = split(rest, items, ",")
        for (i = 1; i <= n; i++) glob(items[i])
      }
    }
    front && inpaths && /^[ \t]*- / { g = $0; sub(/^[ \t]*- /, "", g); glob(g) }
    front && inpaths && !/^[ \t]*- / && !/^paths:/ { inpaths = 0 }
    {
      s = $0
      while (match(s, /`[^`]+`/)) {
        tok = substr(s, RSTART + 1, RLENGTH - 2)
        s = substr(s, RSTART + RLENGTH)
        if (tok !~ /\// || tok ~ /[<>*?{} $]/) continue
        first = tok
        sub(/\/.*/, "", first)
        if (first == "" || first == "." || first == ".." || first == "~" || skipped(tok)) continue
        print "P\t" FILENAME "\t" FNR "\t" tok
      }
    }
  ' "$@" | while IFS="$TAB" read -r kind file a b; do
    if [ "$kind" = G ]; then
      [ -e "$b" ] || echo "- $file: glob \"$a\" points into \`$b\`, which does not exist"
      continue
    fi
    case $b in
      .claude/*) ;;
      *) [ -e "${b%%/*}" ] || continue ;;
    esac
    [ -e "$b" ] || echo "- $file:$a names \`$b\`, which does not exist"
  done
}

# Docs lists. Reads every folder and file under .claude/docs from find, then each README.
check_doc_lists() {
  [ -d .claude/docs ] || return 0
  {
    find .claude/docs -mindepth 1 -type d
    echo "--files--"
    find .claude/docs -mindepth 1 -type f
  } | awk '
    function parent(p) { sub(/\/[^\/]*$/, "", p); return p }
    function base(p) { sub(/.*\//, "", p); return p }
    $0 == "--files--" { infiles = 1; next }
    !infiles { dirs[$0] = 1; next }
    { files[$0] = 1 }
    END {
      for (f in files) if (parent(f) == ".claude/docs")
        print "- `" f "` is outside the docs areas: move it into an area folder such as `product/`, `tech/` or a track"
      for (d in dirs) {
        readme = d "/README.md"
        if (!(readme in files)) { print "- `" d "/` has no README.md listing its docs"; continue }
        found = 0; lineno = 0
        split("", listed)
        while ((getline line < readme) > 0) {
          lineno++
          sub(/\r$/, "", line)
          if (found) {
            s = line
            while (match(s, /`[A-Za-z0-9_.-]+(\.md|\/)`/)) {
              listed[substr(s, RSTART + 1, RLENGTH - 2)] = 1
              s = substr(s, RSTART + RLENGTH)
            }
          } else if (lineno > 1 && line ~ /^## Docs/) found = 1
        }
        close(readme)
        if (!found) { print "- " readme " has no \"## Docs\" list"; continue }
        for (name in listed) {
          target = d "/" name
          if (name ~ /\/$/) { if (!(substr(target, 1, length(target) - 1) in dirs)) gone = 1; else gone = 0 }
          else gone = !(target in files) && !(target in dirs)
          if (gone) print "- " readme " lists `" name "`, which does not exist"
        }
        for (e in dirs) if (parent(e) == d && !((base(e) "/") in listed))
          print "- `" e "` is missing from the list in " readme
        for (e in files) if (parent(e) == d && e ~ /\.md$/ && base(e) != "README.md" && !(base(e) in listed))
          print "- `" e "` is missing from the list in " readme
      }
    }
  '
}

# Track work lists: a research doc, plan or handoff named DD-MM-YYYY-<track>-... must be named in
# the track's README.
check_track_work() {
  [ -d .claude/docs/tracks ] || return 0
  {
    find .claude/docs/tracks -mindepth 1 -maxdepth 1 -type d
    echo "--work--"
    find .claude/research .claude/plans .claude/handoff -type f \
      -name '[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]-*.md' 2>/dev/null
  } | awk '
    $0 == "--work--" { inwork = 1; next }
    !inwork { tracks[$0] = 1; next }
    { work[$0] = 1 }
    END {
      for (t in tracks) {
        name = t
        sub(/.*\//, "", name)
        readme = t "/README.md"
        text = ""
        while ((getline line < readme) > 0) text = text line "\n"
        close(readme)
        if (text == "") continue # no README: the docs list check reports it
        for (w in work) {
          b = w
          sub(/.*\//, "", b)
          if (index(substr(b, 12), name "-") == 1 && index(text, b) == 0)
            print "- `" w "` is missing from the work list in " readme
        }
      }
    }
  '
}

check_budget() {
  [ -f CLAUDE.md ] || return 0
  awk -v budget="$LINE_BUDGET" '
    { sub(/\r$/, ""); text = text $0 "\n" }
    END {
      out = ""
      while ((i = index(text, "<!--")) > 0) {
        rest = substr(text, i + 4)
        j = index(rest, "-->")
        if (j == 0) break
        out = out substr(text, 1, i - 1)
        text = substr(rest, j + 3)
      }
      out = out text
      sub(/^[ \t\n]+/, "", out)
      sub(/[ \t\n]+$/, "", out)
      lines = (out == "") ? 1 : split(out, parts, "\n")
      if (lines > budget + 0)
        print "- CLAUDE.md is " lines " lines without comments, over its " budget "-line budget. Move area rules to .claude/rules/ and procedures to a skill"
    }
  ' CLAUDE.md
}

problems=$( { check_doc_lists; check_track_work; } | sort; check_paths_and_globs; check_budget)
if [ -n "$problems" ]; then
  echo "Guide check ($NAME) found problems in the agent guide:"
  echo "$problems"
  echo "Fix them if your change caused them. Otherwise tell the owner."
fi
exit 0
