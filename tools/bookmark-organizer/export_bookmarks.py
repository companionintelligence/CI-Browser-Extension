#!/usr/bin/env python3
"""Export every bookmark from Chrome-family JSON, Safari plist and Firefox places.sqlite into one CSV.

Usage: python3 -I export_bookmarks.py <input-dir> <output.csv>

<input-dir> holds copies of the browsers' bookmark files (never point this at live profiles):
  chrome-*.json   Chrome/Brave/Edge "Bookmarks" files (any name matching chrome-*.json)
  safari.plist    ~/Library/Safari/Bookmarks.plist
  places.sqlite   Firefox profile database (copy the -wal/-shm files beside it too)
Output columns: browser, folder, title, url
"""
import csv, glob, json, os, plistlib, sqlite3, sys

rows = []


def chrome(path, label):
    roots = json.load(open(path))["roots"]

    def walk(n, trail):
        if n.get("type") == "url":
            rows.append(dict(browser=label, folder="/".join(trail), title=n.get("name", ""), url=n.get("url", "")))
        for c in n.get("children", []):
            walk(c, trail + ([n["name"]] if n.get("type") == "folder" else []))

    for k, r in roots.items():
        if isinstance(r, dict):
            walk(r, [r.get("name", k)])


def safari(path):
    def walk(n, trail):
        t = n.get("WebBookmarkType")
        if t == "WebBookmarkTypeLeaf":
            rows.append(dict(browser="Safari", folder="/".join(trail), title=n.get("URIDictionary", {}).get("title", ""), url=n.get("URLString", "")))
        for c in n.get("Children", []):
            walk(c, trail + ([n.get("Title", "")] if t == "WebBookmarkTypeList" else []))

    walk(plistlib.load(open(path, "rb")), [])


def firefox(path):
    db = sqlite3.connect("file:" + path + "?mode=ro", uri=True)
    allb = {r[0]: r for r in db.execute("select b.id,b.parent,b.title,p.url,b.type from moz_bookmarks b left join moz_places p on b.fk=p.id")}

    def trail(i):
        t = []
        while i in allb:
            if allb[i][2]:
                t.append(allb[i][2])
            i = allb[i][1]
        return "/".join(reversed(t))

    for _, par, title, url, typ in allb.values():
        if typ == 1 and url and not url.startswith("place:"):
            rows.append(dict(browser="Firefox", folder=trail(par), title=title or "", url=url))


def main(src, out):
    for p in sorted(glob.glob(os.path.join(src, "chrome-*.json"))):
        chrome(p, "Chrome:" + os.path.basename(p)[7:-5])
    if os.path.exists(os.path.join(src, "safari.plist")):
        safari(os.path.join(src, "safari.plist"))
    if os.path.exists(os.path.join(src, "places.sqlite")):
        firefox(os.path.join(src, "places.sqlite"))
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, ["browser", "folder", "title", "url"])
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} bookmarks -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
