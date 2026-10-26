# Bookmark organizer

Dev-time tooling for merging every browser's bookmarks into one work-oriented folder tree, rating each link for
Companion Intelligence relevance, and writing the result back. It is **not** part of the extension build.
Python 3 standard library only, no install step.

Pipeline (each step reads the previous step's files):

```bash
W=~/bookmark-work          # working folder; keep it out of git, it holds your data

# 0. Copy the browsers' bookmark files into $W/in (never point the scripts at live profiles)
#    Chrome  -> chrome-<profile>.json   (…/Google/Chrome/<profile>/Bookmarks)
#    Safari  -> safari.plist            (~/Library/Safari/Bookmarks.plist)
#    Firefox -> places.sqlite (+ -wal/-shm)

# 1. Export all browsers to one CSV
python3 -I export_bookmarks.py $W/in $W/all_bookmarks.csv

# 2. De-duplicate, drop junk (javascript:, chrome://, file:), keyword first-guess, write AI chunks
python3 -I classify.py $W/all_bookmarks.csv $W --personal-rules $W/personal-rules.json

# 3. AI relevance pass (see below), writes $W/ai/out_<k>.jsonl

# 4. Merge ratings, build outputs
python3 -I build_outputs.py $W

# 5. Apply. Synced browsers: delete old bookmarks in the UI, then "Import bookmarks" with WORK-bookmarks-import.html.
#    apply_chrome.py (Chrome quit) is only for profiles with bookmark sync OFF.
python3 -I apply_chrome.py $W/renamed_titles_preview.csv
```

## Outputs (step 4, in the working folder)

| File | Purpose |
| --- | --- |
| `WORK-bookmarks-import.html` | Netscape bookmark file; import into any browser |
| `renamed_titles_preview.csv` | old title → new title per link, review before applying |
| `bookmarks_work_final.csv` | every link with its folder, 0–3 rating and one-line reason |
| `PERSONAL-bookmarks.csv/.html` | links kept out of the browsers |

New tree: `CI/*` (11 subfolders), `Jobs/*`, `Learning/*`, `Reference/*` (including `Reference/Maybe useful` for
rating-1 links). Titles are shortened to 58 characters: site-name suffixes and `(9)` counters are dropped and
GitHub links become `repo – description`.

## The AI pass (step 3)

`classify.py` splits the work candidates into `ai/in_<k>.jsonl` (id, title, domain, old folder) next to
`ai/brief.md` (copied from `relevance-brief.md`, which describes what CI builds). Give each chunk to an LLM
agent with this contract and have it write `ai/out_<k>.jsonl` with one object per input line:

```json
{"id": 12, "rel": 0, "cat": "03 Agents, MCP & Bots", "why": "MCP CLI client"}
```

`rel` is 0 (unrelated) to 3 (core); `cat` is one of the `CATS` names in `classify.py`, `Reference/Dev Tools & Design`,
`Reference/General`, `Inbox - Triage` or `Personal`. Skipping this step is fine: `build_outputs.py` then uses the
keyword guess, which is noisy (it over-rates anything that sat in a CIntel-like folder).

## Personal rules

`--personal-rules` is a JSON file `{"domains": "<regex>", "folders": "<regex>"}`. Matching links are written to
`PERSONAL-bookmarks.*` instead of the work tree. Keep this file with your data, not in the repo.

## Safety notes for `apply_chrome.py`

- **Only for profiles with bookmark sync off.** With sync on, Chrome pulls the old tree back from the server on
  the next start and merges it with the new one (seen in practice: 3,442 old + 1,416 new = 4,858 bookmarks,
  even with `sync_metadata` preserved). For a synced profile, delete the old bookmarks in the Bookmark Manager
  and use Import bookmarks with `WORK-bookmarks-import.html`; those edits sync correctly.
- Destructive: it empties the bookmark bar, Other bookmarks and Mobile bookmarks of that profile.
- Aborts if Chrome is running, and writes `Bookmarks.pre-cleanup-<timestamp>` before changing anything.
- The checksum is `md5(id, UTF-16 title, "url"/"folder", url)` over the roots, depth-first. The script proves
  the formula on the existing file and aborts if it does not match.
- Edit only copies you could lose: take your own backup of the browser files first.
- Safari (iCloud-synced, protected plist) and Firefox are intentionally not edited in place; import the HTML.
