#!/bin/sh
# Lists facts that text leaving a current doc would leave without a home.
#
# Usage: sh .claude/tools/lost_facts.sh --since <git rev> [--path <file>...]... [--strict]
#
# 1. Docs: the --path files, or every current doc changed between <rev> and the working tree
#    (CLAUDE.md, .claude/docs, .claude/rules, .claude/skills). A deleted file counts as all lines
#    removed. A relative --path is read from the folder the script runs in.
# 2. It takes the lines removed since <rev> (git diff -U0).
# 3. Facts in them: numbers with 3 or more digits or a decimal point (unit ignored), dates
#    DD-MM-YYYY, backticked text of 3 or more characters, quoted text of 12 or more characters.
# 4. It looks for each fact in the working tree, in the files git tracks or does not ignore,
#    outside SKIP_FOLDERS:
#    - every .md file, and the DATA_FILES outside .claude/: all facts. Numbers match with
#      thousands separators removed (12,201 = 12201).
#    - the CODE_FILES outside .claude/: backticked and quoted text only.
# 5. It prints each fact not found, then "lost_facts: <n> of <m> facts not found". Exit 0, or 1
#    with --strict when a fact is missing. Exit 1 when git fails, 2 on a usage error or a --path
#    that is neither in the working tree nor in <rev>.
#
# Known limits: short counts ("22 checks") and facts with no number, name or quote are not
# checked. A number or date that is only in code is reported as lost: nearly every number of 3 or
# more digits is somewhere in a real codebase, so counting code would hide lost numbers. Read the
# removed text for those yourself.
# Plain POSIX sh, awk and git, like the guide check, so there is nothing to install.

# Data files, where every kind of fact may live. Lock files (*-lock.json, *-lock.yaml) are left
# out: they are full of version numbers.
DATA_FILES="*.json *.yaml *.yml *.toml *.ini *.csv"
# Code files, where backticked and quoted text may live.
CODE_FILES="*.sh *.py *.js *.mjs *.cjs *.jsx *.ts *.tsx *.mts *.cts *.cs *.go *.rs *.java *.kt *.kts
*.swift *.rb *.php *.c *.h *.cc *.cpp *.hpp *.lua *.dart *.gd"
# Folders that hold no files of ours, as in the guide check. Add your project's generated folders.
SKIP_FOLDERS="node_modules .venv venv __pycache__ dist build out target .next"
DOCS="CLAUDE.md .claude/docs .claude/rules .claude/skills"
USAGE="Usage: sh .claude/tools/lost_facts.sh --since <git rev> [--path <file>...]... [--strict]"

usage() {
  echo "$USAGE" >&2
  echo "lost_facts: $1" >&2
  exit 2
}

SINCE=
STRICT=0
PATHS=
NL='
'
while [ $# -gt 0 ]; do
  case $1 in
    --since)
      [ $# -ge 2 ] || usage "--since needs a git rev"
      SINCE=$2
      shift 2
      ;;
    --since=*) SINCE=${1#--since=}; shift ;;
    --path)
      shift
      count=0
      while [ $# -gt 0 ]; do
        case $1 in --*) break ;; esac
        PATHS="$PATHS$1$NL"
        count=$((count + 1))
        shift
      done
      [ "$count" -gt 0 ] || usage "--path needs at least one file"
      ;;
    --path=*) PATHS="$PATHS${1#--path=}$NL"; shift ;;
    --strict) STRICT=1; shift ;;
    -h | --help)
      echo "$USAGE"
      exit 0
      ;;
    *) usage "unknown argument: $1" ;;
  esac
done
[ -n "$SINCE" ] || usage "--since is required"

# The repo root, and the folder the script runs in as a path from the root ("" at the root).
TOP=$(git rev-parse --show-toplevel --show-prefix 2>/dev/null) || {
  echo "lost_facts: not inside a git work tree" >&2
  exit 1
}
ROOT=${TOP%%"$NL"*}
case $TOP in *"$NL"*) HERE=${TOP#*"$NL"} ;; *) HERE= ;; esac

# A --path file as a path from the repo root, into $file. Returns 1 when it is outside the repo.
resolve() {
  file=$1
  while :; do case $file in *\\*) file=${file%%\\*}/${file#*\\} ;; *) break ;; esac; done
  case $file in
    "$ROOT") file=. ;;
    "$ROOT"/*) file=${file#"$ROOT"/} ;;
    /* | [A-Za-z]:/*)
      # Let git name it from the repo root: this also handles short names and symlinks. A deleted
      # file's folder may be gone too, so start from the nearest folder that exists.
      dir=${file%/*}
      rest=${file##*/}
      while [ -n "$dir" ] && [ ! -d "$dir/" ]; do
        case $dir in
          */*) rest=${dir##*/}/$rest; dir=${dir%/*} ;;
          *) dir= ;;
        esac
      done
      top=$(cd "$dir/" 2>/dev/null && git rev-parse --show-toplevel --show-prefix 2>/dev/null) ||
        return 1
      [ "${top%%"$NL"*}" = "$ROOT" ] || return 1
      case $top in *"$NL"*) file=${top#*"$NL"}$rest ;; *) file=$rest ;; esac
      ;;
    *) file=$HERE$file ;;
  esac
  # Drop empty and "." parts, and resolve "..".
  rest=$file
  file=
  while [ -n "$rest" ]; do
    case $rest in
      */*) part=${rest%%/*}; rest=${rest#*/} ;;
      *) part=$rest; rest= ;;
    esac
    case $part in
      '' | .) ;;
      ..)
        [ -n "$file" ] || return 1
        case $file in */*) file=${file%/*} ;; *) file= ;; esac
        ;;
      *) file=${file:+$file/}$part ;;
    esac
  done
  [ -n "$file" ] || file=.
}

cd "$ROOT" || exit 1

# The --path files as paths from the root, one per line. Each must be in the working tree or in
# <rev>: a typo would otherwise pass with "0 of 0".
FILES=
if [ -n "$PATHS" ]; then
  IFS_WAS=$IFS
  set -f
  IFS=$NL
  for arg in $PATHS; do
    IFS=$IFS_WAS
    resolve "$arg" || usage "--path $arg is outside the repo"
    [ -e "$file" ] || git cat-file -e "$SINCE:$file" 2>/dev/null ||
      usage "--path $arg: no such file in the working tree or in $SINCE"
    FILES="$FILES$file$NL"
  done
  IFS=$IFS_WAS
  set +f
fi

# The removed lines: "@auto" then the diff of every changed current doc, or "@path <file>" then
# that file's diff for each --path. "@fail" when git fails. Then "@corpus" and the files to search.
removed_and_corpus() {
  if [ -z "$FILES" ]; then
    echo "@auto"
    # shellcheck disable=SC2086 # DOCS is a list of paths without spaces
    git -c core.quotepath=off diff --no-renames -U0 "$SINCE" -- $DOCS 2>/dev/null || echo "@fail"
  else
    printf %s "$FILES" | while IFS= read -r file; do
      echo "@path $file"
      git -c core.quotepath=off diff --no-renames -U0 "$SINCE" -- "$file" 2>/dev/null || echo "@fail"
    done
  fi
  echo "@corpus"
  set -f
  # shellcheck disable=SC2086 # split the lists into patterns, globbing is off
  git -c core.quotepath=off ls-files -co --exclude-standard -- '*.md' $DATA_FILES $CODE_FILES \
    2>/dev/null
  set +f
}

# Runs in the C locale, so the text is bytes. Exit 3 means git failed.
FACTS='
function trim(s) { sub(/^[ \t\n\r\f\v]+/, "", s); sub(/[ \t\n\r\f\v]+$/, "", s); return s }
function isdigit(c) { return c != "" && index("0123456789", c) > 0 }
# Characters, not bytes, of UTF-8 text, and the first n characters.
function clen(s,   c) { if (s !~ HIGHRE) return length(s); c = s; gsub(CONTRE, "", c); return length(c) }
function cut(s, n,   i, c, k) {
  if (length(s) <= n) return s
  for (i = 1; i <= length(s); i++) {
    c = ORD[substr(s, i, 1)]
    if ((c < 128 || c >= 192) && ++k > n) return substr(s, 1, i - 1)
  }
  return s
}
# Curly quotes made straight and runs of whitespace made one space.
function flat(s) {
  gsub(LSQ "|" RSQ, "\047", s); gsub(LDQ "|" RDQ, "\"", s)
  gsub(/[ \t\r\f\v]+/, " ", s)
  return trim(s)
}
# Whether a Unicode code point is a word character, as \w in Python: letters, digits and marks of
# numbers count; punctuation, symbols and combining marks do not. Close enough for the common cases.
function wordcp(cp) {
  if (cp < 192) return cp == 170 || cp == 178 || cp == 179 || cp == 181 || cp == 185 || cp == 186 || (cp >= 188 && cp <= 190)
  if (cp <= 255) return cp != 215 && cp != 247
  if (cp < 768) return 1
  if (cp < 880) return 0
  if (cp >= 8192 && cp < 11264) return (cp >= 8304 && cp < 8352) || (cp >= 8528 && cp < 8592)
  if (cp >= 12288 && cp < 12352) return 0
  if (cp >= 57344 && cp < 63744) return 0
  if (cp >= 65024 && cp < 65136) return 0
  if (cp >= 65280 && cp < 65296) return 0
  if (cp >= 126976) return 0
  return 1
}
# Whether the character that ends just before byte p of t is a word character.
function word_before(t, p,   b, k, c, cp, i) {
  b = substr(t, p - 1, 1)
  if (b ~ /[A-Za-z0-9_]/) return 1
  if (ORD[b] < 128) return 0
  for (k = p - 1; k > 1 && ORD[substr(t, k, 1)] >= 128 && ORD[substr(t, k, 1)] < 192; k--) {}
  c = ORD[substr(t, k, 1)]
  if (c >= 240) cp = c - 240; else if (c >= 224) cp = c - 224; else if (c >= 192) cp = c - 192; else return 0
  for (i = k + 1; i < p; i++) cp = cp * 64 + ORD[substr(t, i, 1)] - 128
  return wordcp(cp)
}
function digits(t, p) { return match(substr(t, p), /^[0-9]+/) ? RLENGTH : 0 }
# A number may not end before a digit, or before "." or "," and a digit.
function bad(t, e,   c) { c = substr(t, e, 1); return isdigit(c) || ((c == "." || c == ",") && isdigit(substr(t, e + 1, 1))) }
# The length of the number that starts at p, or 0. Facts (any 0): 1,234(.5), 1.2(.3...), or 3 or
# more digits. Search text (any 1): 1,234(.5), or digits with any number of ".digits" parts.
function number_at(t, p, any,   L, after, q, g, e) {
  L = digits(t, p); after = p + L
  if (L <= 3 && substr(t, after, 1) == ",") {
    for (q = after; substr(t, q, 1) == "," && substr(t, q + 1, 3) ~ /^[0-9][0-9][0-9]$/; q += 4) g++
    if (g > 0) {
      if (substr(t, q, 1) == "." && isdigit(substr(t, q + 1, 1))) {
        e = q + 1 + digits(t, q + 1)
        if (!bad(t, e)) return e - p
      }
      if (!bad(t, q)) return q - p
    }
  }
  q = after
  while (substr(t, q, 1) == "." && isdigit(substr(t, q + 1, 1))) q = q + 1 + digits(t, q + 1)
  if ((q > after || any) && !bad(t, q)) return q - p
  if (!any && L >= 3 && !bad(t, after)) return L
  return 0
}
# Where an optional unit after a number ends: " ms", "%", "°" and the like.
function unit_end(t, e,   k) {
  if (substr(t, e, 1) ~ /[ \t\r\f\v]/ && (k = unit_at(t, e + 1))) return k
  if ((k = unit_at(t, e))) return k
  return e
}
function unit_at(t, e,   i, u) {
  for (i = 1; i <= NUNITS; i++) {
    u = UNITS[i]
    if (substr(t, e, length(u)) == u && substr(t, e + length(u), 1) !~ /[A-Za-z]/) return e + length(u)
  }
  return 0
}

# A date is a text fact that, like a number, is not looked for in code.
function add(kind, shown, key, line, date) {
  if ((kind SUBSEP key) in seen) return
  seen[kind SUBSEP key] = 1
  nfacts++
  fkind[nfacts] = kind; fshown[nfacts] = shown; fkey[nfacts] = key; fline[nfacts] = line; flabel[nfacts] = label
  fdate[nfacts] = date
}
function facts(text, line,   s, off, copied, p, q, at, m, e, tok, masked, plain, out, c, a, rest, key) {
  # Dates, then the text with each date made a space.
  plain = ""; s = text; off = 0; copied = 0
  while (match(s, /[0-9]+/)) {
    at = off + RSTART
    if (substr(text, at, 10) ~ /^[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]$/ && !isdigit(substr(text, at + 10, 1))) {
      add("text", substr(text, at, 10), substr(text, at, 10), line, 1)
      plain = plain substr(text, copied + 1, at - copied - 1) " "
      off = copied = at + 9
    } else off = at + RLENGTH - 1
    s = substr(text, off + 1)
  }
  plain = plain substr(text, copied + 1)
  # Backticked text. Quote marks inside backticks are code, not a quote.
  masked = ""; s = text
  while (match(s, /`[^`]+`/)) {
    tok = substr(s, RSTART + 1, RLENGTH - 2)
    if (clen(trim(tok)) >= 3) add("text", tok, flat(tok), line)
    out = substr(s, RSTART, RLENGTH); gsub(/"/, "\047", out)
    masked = masked substr(s, 1, RSTART - 1) out
    s = substr(s, RSTART + RLENGTH)
  }
  masked = masked s
  # Quoted text, "..." or curly.
  s = masked
  while (1) {
    p = index(s, "\""); q = index(s, LDQ)
    if (!p && !q) break
    if (p && (!q || p < q)) {
      rest = substr(s, p + 1); c = index(rest, "\"")
      if (c > 1) { tok = substr(rest, 1, c - 1); s = substr(rest, c + 1) } else { tok = ""; s = rest }
    } else {
      rest = substr(s, q + 3); c = index(rest, RDQ)
      if (c > 1) { tok = substr(rest, 1, c - 1); s = substr(rest, c + 3) } else { tok = ""; s = substr(s, q + 1) }
    }
    if (tok != "" && clen(trim(tok)) >= 12) add("text", tok, flat(tok), line)
  }
  # Numbers, in the text without its dates. Not right after a word character, "." or ",".
  s = plain; off = 0
  while (match(s, /[0-9]+/)) {
    at = off + RSTART; off = at + RLENGTH - 1
    a = substr(plain, at - 1, 1)
    if (at == 1 || (a != "." && a != "," && !word_before(plain, at))) {
      if ((m = number_at(plain, at, 0))) {
        e = unit_end(plain, at + m)
        key = substr(plain, at, m); gsub(/,/, "", key)
        add("number", substr(plain, at, e - at), key, line)
        off = e - 1
      }
    }
    s = substr(plain, off + 1)
  }
}
# A hunk: a line with an open quote is joined with the next lines (at most 4).
function hunk_done(   i, j, text) {
  for (i = 1; i <= nh; i++) {
    text = H[i]
    for (j = i; quotes(text) % 2 && j < nh && j - i < 4; ) { j++; text = text " " trim(H[j]) }
    facts(text, H[i])
    i = j
  }
  nh = 0; inhunk = 0
}
function quotes(t) { return gsub(/"/, "\"", t) }
function new_label(l) {
  if (inhunk) hunk_done()
  gsub(/\\/, "/", l); while (sub(/^\.\//, "", l)) ; gsub(/\/\/+/, "/", l); sub(/\/$/, "", l)
  label = l; split("", seen); skip = 0
}

# The search text, read once: the files joined, and the set of numbers in them.
function slurp(f,   rs, t, chunk) {
  rs = RS; RS = SOH; t = ""
  while ((getline chunk < f) > 0) t = t chunk
  close(f); RS = rs
  return t
}
function skipped(f,   n, parts, i, j, m, sk) {
  n = split(f, parts, "/"); m = split(skip_folders, sk, " ")
  for (i = 1; i < n; i++) for (j = 1; j <= m; j++) if (parts[i] == sk[j]) return 1
  return 0
}
# "doc" for a .md or data file, which may hold any fact. "code" for a code file, which holds only
# backticked and quoted text. "" for a file not searched.
function where(f) {
  if (skipped(f)) return ""
  if (f ~ /\.md$/) return "doc"
  if (index(f, ".claude/") == 1 || f ~ /-lock\.(json|yaml)$/) return ""
  return (match(f, /\.[^.\/]*$/) && (substr(f, RSTART) in DATA)) ? "doc" : "code"
}
# The text is made flat line by line: gsub on one long string is slow in some awks. The text of
# docs and data files goes into dtext, the text of code files into ctext.
function load(   i, f, k, t, n, runs, j, r, m, key, L, l) {
  dtext = ""; ctext = ""
  for (i = 1; i <= ncf; i++) {
    f = cfiles[i]
    if ((k = where(f)) == "") continue
    t = slurp(f)
    if (k == "doc") {
      n = split(t, runs, /[^0-9.,]+/)
      for (j = 1; j <= n; j++) {
        r = runs[j]
        if (!isdigit(substr(r, 1, 1)) || !(m = number_at(r, 1, 1))) continue
        key = substr(r, 1, m); gsub(/,/, "", key)
        nums[key] = 1
      }
    }
    gsub(LSQ "|" RSQ, "\047", t); gsub(LDQ "|" RDQ, "\"", t)
    n = split(t, L, "\n")
    for (j = 1; j <= n; j++) {
      l = L[j]
      if (l ~ /[ \t\r\f\v]/) { gsub(/[ \t\r\f\v]+/, " ", l); sub(/^ /, "", l); sub(/ $/, "", l) }
      if (l == "") continue
      if (k == "doc") dtext = dtext " " l; else ctext = ctext " " l
    }
  }
}

BEGIN {
  for (i = 1; i < 256; i++) ORD[sprintf("%c", i)] = i
  SOH = sprintf("%c", 1)
  HIGHRE = "[" sprintf("%c", 128) "-" sprintf("%c", 255) "]"
  CONTRE = "[" sprintf("%c", 128) "-" sprintf("%c", 191) "]"
  LSQ = "\342\200\230"; RSQ = "\342\200\231"; LDQ = "\342\200\234"; RDQ = "\342\200\235"
  NUNITS = split("% KB ms mm px \302\260 s", UNITS, " ")
  n = split(data_files, D, " ")
  for (i = 1; i <= n; i++) { sub(/^\*/, "", D[i]); DATA[D[i]] = 1 }
}
$0 == "@auto" { auto = 1; next }
/^@path / { new_label(substr($0, 7)); next }
$0 == "@fail" { failed = 1; next }
$0 == "@corpus" { if (inhunk) hunk_done(); incorpus = 1; next }
incorpus { cfiles[++ncf] = $0; next }
/^diff --git / {
  if (inhunk) hunk_done()
  if (auto) {
    rest = substr($0, 14)
    new_label(substr(rest, 1, (length(rest) - 3) / 2))
    skip = (label !~ /\.md$/)
  }
  next
}
/^@@/ { if (inhunk) hunk_done(); inhunk = !skip; next }
inhunk && /^-/ { line = substr($0, 2); sub(/\r+$/, "", line); H[++nh] = line }
END {
  if (failed) exit 3
  if (nfacts) load()
  for (i = 1; i <= nfacts; i++) {
    if (fkind[i] == "number") { if (fkey[i] in nums) continue }
    else if (index(dtext, fkey[i]) > 0 || (!fdate[i] && index(ctext, fkey[i]) > 0)) continue
    missing++
    print flabel[i] ": \"" fshown[i] "\" in: " cut(trim(fline[i]), 160)
  }
  print "lost_facts: " (missing + 0) " of " (nfacts + 0) " facts not found"
  exit (strict && missing) ? 1 : 0
}
'

removed_and_corpus | LC_ALL=C awk -v strict="$STRICT" -v skip_folders="$SKIP_FOLDERS" \
  -v data_files="$DATA_FILES" "$FACTS"
status=$?
if [ "$status" = 3 ]; then
  # shellcheck disable=SC2086 # DOCS is a list of paths without spaces
  error=$(git diff --no-renames --name-only "$SINCE" -- $DOCS 2>&1 >/dev/null)
  echo "lost_facts: git diff $SINCE failed: ${error:-no details}" >&2
  exit 1
fi
exit "$status"
