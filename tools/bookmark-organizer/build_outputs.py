#!/usr/bin/env python3
"""Merge AI relevance ratings and write the final outputs.

Usage: python3 -I build_outputs.py <workdir>

Reads <workdir>/proposed.json (from classify.py) and, if present, <workdir>/ai/out_*.jsonl, one JSON object
per line {"id", "rel": 0-3, "cat", "why"}. Without ratings the keyword first-guess is used as-is.

Writes into <workdir>:
  WORK-bookmarks-import.html   Netscape bookmark file (Chrome/Safari/Firefox "Import bookmarks")
  renamed_titles_preview.csv   folder, old_title, new_title, url (what the import file will contain)
  PERSONAL-bookmarks.csv/.html everything kept out of the browsers
  bookmarks_work_final.csv     new_folder, rating, why, title, url, old_location
"""
import csv, glob, html, json, os, re, sys
from collections import OrderedDict
from urllib.parse import urlparse

CI = tuple(f"{i:02d}" for i in range(1, 12))
RENAME = {
    "Companion Intelligence/01 Company & Product": "CI/Company & Product",
    "Companion Intelligence/02 Local-First AI & Memory": "CI/Local AI & Memory",
    "Companion Intelligence/03 Agents, MCP & Bots": "CI/Agents & MCP",
    "Companion Intelligence/04 Voice, Wearables & Devices": "CI/Voice & Wearables",
    "Companion Intelligence/05 Spatial, XR & 3D": "CI/Spatial & XR",
    "Companion Intelligence/06 Active Inference & Research": "CI/Research",
    "Companion Intelligence/07 OS & Infrastructure": "CI/OS & Infra",
    "Companion Intelligence/08 App Stores & Distribution": "CI/App Stores",
    "Companion Intelligence/09 Security & Safety": "CI/Security & Identity",
    "Companion Intelligence/10 Marketing, GTM & Social": "CI/Marketing & GTM",
    "Companion Intelligence/11 Funding & Investors": "CI/Funding",
    "Reference/Maybe useful (tangential)": "Reference/Maybe useful",
}
ORDER = list(RENAME.values())[:11]
SEP = re.compile(r"\s+[|–—·:]\s+|\s+-\s+")
MAX_TITLE = 58


def host(u):
    return urlparse(u).netloc.lower().removeprefix("www.")


def clean(title, url):
    """Shorter, scannable titles: drop counters and site-name suffixes, `repo – description` for GitHub."""
    t = re.sub(r"\s+", " ", title or "").strip()
    t = re.sub(r"^\(\d+\)\s*", "", t)
    h = host(url)
    base = re.sub(r"[^a-z0-9]", "", h.split(".")[-2] if h.count(".") else h)
    if "github.com" in h:
        m = re.match(r"^([\w.\-]+)/([\w.\-]+)(?::\s*(.*))?$", t)
        if m:
            desc = re.split(r"\s+·\s+", m.group(3) or "")[0].strip()
            desc = re.sub(r"^[^\w]+", "", desc)
            t = m.group(2) + (" – " + desc if desc else "")
    else:
        parts = SEP.split(t)
        if len(parts) > 1:
            last = re.sub(r"[^a-z0-9]", "", parts[-1].lower())
            if last and (last in base or base in last or (len(parts[-1]) <= 14 and last in re.sub(r"[^a-z0-9]", "", h))):
                t = t[: t.rfind(parts[-1])].rstrip(" |–—·:-").strip()
        t = re.sub(r"\s*-\s*(Google (Docs|Slides|Sheets|Drive))$", "", t)
    if not t or t.startswith("http") or t == h:
        seg = [s for s in urlparse(url).path.split("/") if s]
        t = h + (" / " + seg[-1] if seg else "")
    return t if len(t) <= MAX_TITLE else t[: MAX_TITLE - 3].rstrip() + "..."


def final_folder(o, a):
    f = o["new_folder"]
    if f.startswith(("Personal", "Career", "Learning")):  # decided by classify.py, never re-rated
        return f
    if a is None:  # no AI rating: keyword guess
        if f.startswith("Archive"):
            return f
        if f.startswith("00 Inbox"):
            return "Reference/Unsorted"
        return f
    c, rel = a["cat"].removeprefix("Companion Intelligence/"), a["rel"]
    if c == "Personal":
        return "Personal (move out of work tree)"
    if rel >= 2 and c[:2] in CI:
        return "Companion Intelligence/" + c
    if rel >= 2:
        return c if c.startswith("Reference") else "Reference/General"
    return "Reference/Maybe useful (tangential)" if rel == 1 else "Archive/Not work-relevant"


def main(work):
    O = json.load(open(os.path.join(work, "proposed.json")))
    ratings = {}
    for fn in glob.glob(os.path.join(work, "ai", "out_*.jsonl")):
        for line in open(fn):
            if line.strip():
                j = json.loads(line)
                ratings[j["id"]] = j
    print(f"{len(O)} bookmarks, {len(ratings)} AI ratings")

    work_items, personal = OrderedDict(), []
    final_rows = []
    for o in O:
        a = ratings.get(o["id"])
        f = final_folder(o, a)
        final_rows.append((f, a["rel"] if a else "", a["why"] if a else "", o))
        if f.startswith(("Personal", "Archive")):
            personal.append((f, o))
            continue
        if f.startswith("Career & Jobs/"):
            f = "Jobs/" + f.split("/", 1)[1]
        f = RENAME.get(f, f)
        work_items.setdefault(f, []).append(dict(title=clean(o["title"], o["url"]), old=o["title"], url=o["url"], rel=a["rel"] if a else 0))

    def rank(k):
        return (0, ORDER.index(k)) if k in ORDER else (1 if k.startswith("Jobs") else 2 if k.startswith("Learning") else 3, k)

    keys = sorted(work_items, key=rank)
    for k in keys:
        work_items[k].sort(key=lambda i: (-i["rel"], i["title"].lower()))

    tree = OrderedDict()
    for k in keys:
        node = tree
        for p in k.split("/"):
            node = node.setdefault(p, OrderedDict())
        node["__items__"] = work_items[k]
    out = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">', "<TITLE>Bookmarks</TITLE>", "<H1>Bookmarks</H1>", "<DL><p>"]

    def emit(node, depth):
        pad = "    " * depth
        for name, sub in node.items():
            if name == "__items__":
                out.extend(f'{pad}<DT><A HREF="{html.escape(i["url"], quote=True)}">{html.escape(i["title"])}</A>' for i in sub)
            else:
                out.extend([f"{pad}<DT><H3>{html.escape(name)}</H3>", f"{pad}<DL><p>"])
                emit(sub, depth + 1)
                out.append(f"{pad}</DL><p>")

    emit(tree, 1)
    out.append("</DL><p>")
    open(os.path.join(work, "WORK-bookmarks-import.html"), "w").write("\n".join(out))

    with open(os.path.join(work, "renamed_titles_preview.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["folder", "old_title", "new_title", "url"])
        for k in keys:
            w.writerows([k, i["old"], i["title"], i["url"]] for i in work_items[k])
    with open(os.path.join(work, "bookmarks_work_final.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["new_folder", "ci_rating_0to3", "why", "title", "url", "old_location"])
        for fo, rel, why, o in sorted(final_rows, key=lambda r: r[0]):
            w.writerow([fo, rel, why, o["title"], o["url"], o["old_location"]])
    with open(os.path.join(work, "PERSONAL-bookmarks.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["folder", "title", "url", "old_location"])
        w.writerows([fo, o["title"], o["url"], o["old_location"]] for fo, o in personal)
    ph = ['<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Personal Bookmarks</title><style>:root{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px}input{width:100%;padding:10px;font-size:16px;box-sizing:border-box}li{margin:2px 0;word-break:break-word}.u{color:gray;font-size:12px}</style>'
          f"<h1>Personal bookmarks ({len(personal)})</h1><input id=q placeholder='Search...' oninput=f()><ul id=t>"]
    ph += [f'<li><a href="{html.escape(o["url"], quote=True)}" rel=noreferrer>{html.escape(o["title"] or o["url"])}</a> <span class=u>{html.escape(host(o["url"]))}</span></li>' for _, o in personal]
    ph.append("</ul><script>function f(){var q=document.getElementById('q').value.toLowerCase();document.querySelectorAll('#t li').forEach(function(l){l.style.display=!q||l.textContent.toLowerCase().indexOf(q)>-1?'':'none'})}</script></html>")
    open(os.path.join(work, "PERSONAL-bookmarks.html"), "w").write("\n".join(ph))

    print(f"work: {sum(len(v) for v in work_items.values())} | personal/archived: {len(personal)}")
    for k in keys:
        print(f"{len(work_items[k]):5} {k}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
