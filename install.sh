#!/bin/sh
# Installs the kit. Copies files and never overwrites: a file that already exists and differs is
# listed under "merge", so Claude (or you) can merge it by hand. SETUP.md says how.
#
#   sh install.sh global                ~/.claude/: CLAUDE.md and skills
#   sh install.sh project [path]        the project (default: this folder): CLAUDE.md and .claude/
#   sh install.sh all [path]            both
#   add --dry-run to print what would happen and change nothing
#
# ~/.claude means $CLAUDE_CONFIG_DIR when that is set. Plain POSIX sh, so it runs on macOS, Linux
# and Windows (Git Bash) with nothing to install.

usage() {
  [ -n "$1" ] && echo "$1" >&2
  echo "Usage: sh install.sh <global|project|all> [project path] [--dry-run]" >&2
  exit 1
}

KIT=$(cd "$(dirname "$0")" && pwd)
DRY=0
SCOPE=
PROJECT=
for arg in "$@"; do
  case $arg in
    --dry-run) DRY=1 ;;
    *)
      if [ -z "$SCOPE" ]; then SCOPE=$arg
      elif [ -z "$PROJECT" ]; then PROJECT=$arg
      else usage "Too many arguments."
      fi
      ;;
  esac
done
case $SCOPE in
  global | project | all) ;;
  "") usage ;;
  *) usage "Unknown scope: $SCOPE" ;;
esac

TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT
COPIED=0
SAME=0
MERGE=0

# install_part <label> <kit folder> <target folder> <where>
install_part() {
  echo "$1: $3"
  (cd "$2" && find . -type f ! -name .DS_Store ! -name Thumbs.db | sed 's|^\./||' | sort) > "$TMP/list"
  while IFS= read -r rel; do
    # The template has its own name in the kit so that Claude Code does not load it as
    # instructions while someone works on the kit itself.
    case $rel in
      CLAUDE.template.md) dest=CLAUDE.md ;;
      *) dest=$rel ;;
    esac
    src="$2/$rel"
    target="$3/$dest"
    if [ ! -e "$target" ]; then
      status=copied
      COPIED=$((COPIED + 1))
      if [ "$DRY" = 0 ]; then
        mkdir -p "$(dirname "$target")" && cp "$src" "$target" || exit 1
      fi
    elif cmp -s "$src" "$target"; then
      status=same
      SAME=$((SAME + 1))
    else
      status=merge
      MERGE=$((MERGE + 1))
      echo "$dest" >> "$TMP/merge-$4"
    fi
    case $status in
      copied) [ "$DRY" = 1 ] && shown="would copy" || shown=copied ;;
      same) shown=same ;;
      merge) shown=MERGE ;;
    esac
    if [ "$status" = merge ]; then
      printf '  %-10s %s   (exists and differs, left as is)\n' "$shown" "$dest"
    else
      printf '  %-10s %s\n' "$shown" "$dest"
      count=$(grep -o -F '{{' "$src" | wc -l | tr -d ' ')
      [ "$count" -gt 0 ] && echo "$dest ($count)" >> "$TMP/placeholders-$4"
    fi
  done < "$TMP/list"
}

# Prints the lines of a file joined with ", ".
joined() {
  awk 'NR > 1 { printf ", " } { printf "%s", $0 } END { print "" }' "$1"
}

if [ "$SCOPE" != project ]; then
  if [ -n "$CLAUDE_CONFIG_DIR" ]; then
    GLOBAL=$CLAUDE_CONFIG_DIR
  elif [ -n "$USERPROFILE" ] && command -v cygpath >/dev/null 2>&1; then
    # Windows (Git Bash): Claude Code uses the user profile folder, which $HOME may not be.
    GLOBAL=$(cygpath -u "$USERPROFILE")/.claude
  else
    GLOBAL=$HOME/.claude
  fi
  install_part Global "$KIT/global" "$GLOBAL" global
fi
if [ "$SCOPE" != global ]; then
  PROJECT_DIR=$(cd "${PROJECT:-.}" 2>/dev/null && pwd) || usage "Not a folder: ${PROJECT:-.}"
  [ "$PROJECT_DIR" = "$KIT" ] && usage "That is the kit itself. Give the project's path."
  install_part Project "$KIT/project" "$PROJECT_DIR" project
  if [ ! -e "$PROJECT_DIR/.git" ]; then
    echo "  note: this folder is not a git repo root. The project files belong at the repo root."
  fi
fi

echo
[ "$DRY" = 1 ] && printf 'Dry run, nothing changed. %s to copy' "$COPIED" || printf '%s copied' "$COPIED"
echo ", $SAME already the same, $MERGE to merge by hand."
for where in global project; do
  [ -f "$TMP/merge-$where" ] && echo "To merge ($where): $(joined "$TMP/merge-$where")"
done
for where in global project; do
  [ -f "$TMP/placeholders-$where" ] && echo "Placeholders {{...}} to fill ($where): $(joined "$TMP/placeholders-$where")"
done
[ "$DRY" = 0 ] && echo "Next: SETUP.md, step 4."
exit 0
