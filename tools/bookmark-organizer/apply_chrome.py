#!/usr/bin/env python3
"""Replace a Chrome profile's bookmarks with the tree from renamed_titles_preview.csv. DESTRUCTIVE.

Usage: python3 -I apply_chrome.py <renamed_titles_preview.csv> [profile-dir]

ONLY FOR PROFILES WITH BOOKMARK SYNC OFF (or signed out). With sync on, Chrome re-downloads the old tree from
the server on next start and merges it with the new one, leaving old + new side by side (observed: 3,442 old +
1,416 new = 4,858). For a synced profile use the browser UI instead: delete the old bookmarks in the Bookmark
Manager, then Import WORK-bookmarks-import.html, so the deletes sync properly.

Quit Chrome first (the script aborts if it is running). Default profile dir:
  ~/Library/Application Support/Google/Chrome/Default

What it does
  * copies the current "Bookmarks" file to "Bookmarks.pre-cleanup-<timestamp>" (never overwritten)
  * proves the checksum formula reproduces the checksum of the current file, and refuses to continue if not
  * empties bookmark bar / other / mobile and writes the new folders onto the bookmark bar
Top-level folders of the CSV (CI, Jobs, Learning, Reference) land directly on the bookmark bar.
"""
import csv, hashlib, json, os, shutil, subprocess, sys, time, uuid


def checksum(roots):
    """Chrome's BookmarkCodec checksum: md5 over id, UTF-16 title, "url"/"folder" (+ url), depth-first."""
    m = hashlib.md5()

    def node(n):
        m.update(n["id"].encode())
        m.update(n["name"].encode("utf-16-le"))
        if n["type"] == "url":
            m.update(b"url")
            m.update(n["url"].encode())
        else:
            m.update(b"folder")
            for c in n.get("children", []):
                node(c)

    for k in ("bookmark_bar", "other", "synced"):
        node(roots[k])
    return m.hexdigest()


def count(n):
    return (n.get("type") == "url") + sum(count(c) for c in n.get("children", []))


def main(src, profile):
    if subprocess.run(["pgrep", "-x", "Google Chrome"], capture_output=True).stdout.strip():
        sys.exit("ABORT: Chrome is running. Quit it first.")
    path = os.path.join(profile, "Bookmarks")
    j = json.load(open(path))
    if checksum(j["roots"]) != j.get("checksum"):
        sys.exit("ABORT: checksum formula does not reproduce this file's checksum; not touching it")
    print("old urls:", sum(count(j["roots"][k]) for k in ("bookmark_bar", "other", "synced")), "| sync_metadata kept:", "sync_metadata" in j)
    backup = f"{path}.pre-cleanup-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, backup)
    print("backup:", backup)

    now = str(int((time.time() + 11644473600) * 1000000))  # Chrome epoch, microseconds
    nid = [3]  # ids 0-3 are the root folders

    def newid():
        nid[0] += 1
        return str(nid[0])

    def folder(name):
        return dict(children=[], date_added=now, date_last_used="0", date_modified=now, guid=str(uuid.uuid4()), id=newid(), name=name, type="folder")

    bar = j["roots"]["bookmark_bar"]
    for k in ("bookmark_bar", "other", "synced"):
        j["roots"][k]["children"] = []
        j["roots"][k]["date_modified"] = now
    cache = {}

    def get(p):
        if p not in cache:
            parts = p.split("/")
            parent = bar if len(parts) == 1 else get("/".join(parts[:-1]))
            cache[p] = folder(parts[-1])
            parent["children"].append(cache[p])
        return cache[p]

    n = 0
    for r in csv.DictReader(open(src)):
        get(r["folder"])["children"].append(dict(date_added=now, date_last_used="0", guid=str(uuid.uuid4()), id=newid(), name=r["new_title"], type="url", url=r["url"]))
        n += 1
    j["checksum"] = checksum(j["roots"])
    json.dump(j, open(path + ".new", "w"), ensure_ascii=False, indent=3)
    os.replace(path + ".new", path)

    k = json.load(open(path))
    got = sum(count(k["roots"][x]) for x in ("bookmark_bar", "other", "synced"))
    print(f"written: {got} urls (expected {n}); checksum ok: {checksum(k['roots']) == k['checksum']}")
    print("bookmark bar:", [c["name"] for c in k["roots"]["bookmark_bar"]["children"]])


if __name__ == "__main__":
    a = sys.argv[1:]
    if not 1 <= len(a) <= 2:
        sys.exit(__doc__)
    main(a[0], os.path.expanduser(a[1]) if len(a) == 2 else os.path.expanduser("~/Library/Application Support/Google/Chrome/Default"))
