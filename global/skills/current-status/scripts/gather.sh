#!/bin/sh
# Prints the raw facts for a project status report: git state, open plans and
# handoffs, each docs area's "Where it stands", the newest history entries and
# the open questions. Read-only: it never fetches, edits or commits.
# Usage: sh gather.sh [project-folder]

cd "${1:-.}" || exit 1
root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -n "$root" ] && cd "$root"

say() { printf '\n== %s ==\n' "$1"; }

if [ -z "$root" ]; then
  echo "Not a git repo: $(pwd)"
else
  say "Repo"
  echo "folder: $root"
  def=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
  if [ -z "$def" ]; then
    for b in main master; do
      git show-ref --verify --quiet "refs/heads/$b" && def=$b && break
    done
  fi
  echo "default branch: ${def:-unknown}"
  fetch="$(git rev-parse --git-common-dir)/FETCH_HEAD"
  if [ -f "$fetch" ]; then
    # GNU stat first (Linux, Git Bash): its -f means file system and still prints, so it can't be
    # the fallback. macOS stat has no -c, so it fails and the BSD form runs.
    last=$(stat -c %y "$fetch" 2>/dev/null || stat -f %Sm "$fetch" 2>/dev/null)
    echo "last fetch: ${last%.*}"
  fi
  git status --short --branch | head -40
  n=$(git status --short | wc -l | tr -d ' ')
  echo "changed files: $n"
  [ "$n" -gt 0 ] && git diff --stat HEAD | tail -1

  say "Recent commits on ${def:-HEAD}"
  git log --oneline -8 ${def:+"$def"} 2>/dev/null || git log --oneline -8

  say "Worktrees"
  git worktree list

  if [ -n "$def" ]; then
    say "Local branches not merged into $def"
    out=$(git for-each-ref --no-merged "$def" --format='%(refname:short)  %(committerdate:short)  %(subject)' refs/heads)
    echo "${out:-none}"
  fi

  say "Open PRs"
  if command -v gh >/dev/null 2>&1; then
    out=$(gh pr list --state open --limit 15 2>&1 | head -20)
    echo "${out:-none}"
  else
    echo "gh not installed"
  fi
fi

say "Open plans and handoffs (not in done/)"
found=0
for f in .claude/plans/*.md .claude/handoff/*.md; do
  [ -f "$f" ] || continue
  found=1
  echo "-- $f"
  grep -m1 '^# ' "$f"
  grep -m1 -i '^> \*\*status' "$f"
  echo "last headings:"
  grep '^## ' "$f" | tail -2
done
[ $found = 1 ] || echo "none"

if [ ! -d .claude/docs ]; then
  say "No .claude/docs here. Files that may hold status"
  ls -1d README* TODO* ROADMAP* CHANGELOG* docs CLAUDE.md 2>/dev/null
  exit 0
fi

say "Where it stands, per docs area"
find .claude/docs -name README.md | sort | while read -r f; do
  grep -q '^## Where it stands' "$f" || continue
  echo "-- $f"
  awk '/^## Where it stands/ {f=1; next} f && /^## / {exit} f' "$f"
done

say "Newest history entries"
find .claude/docs -name history.md | sort | while read -r f; do
  echo "-- $f"
  grep '^## ' "$f" | head -3
done

# Every top-level item of each "Open questions" section, joined to one line.
# A nested item shows only when it names the owner.
say "Open questions"
find .claude/docs -name '*.md' ! -name history.md | sort | while read -r f; do
  grep -q '^## Open questions' "$f" || continue
  echo "-- $f"
  awk '
    function flush() {
      if (item != "" && (lvl == 0 || tolower(item) ~ /owner/))
        print (lvl ? "  - " : "- ") substr(item, 1, 300)
      item = ""
    }
    /^## Open questions/ { f = 1; next }
    !f { next }
    /^## / { flush(); f = 0; next }
    /^- / { flush(); lvl = 0; item = substr($0, 3); next }
    /^ +- / { flush(); lvl = 1; sub(/^ +- /, ""); item = $0; next }
    /^ +[^ ]/ { sub(/^ +/, ""); item = item " " $0; next }
    /^$/ { flush() }
    END { flush() }
  ' "$f"
done
