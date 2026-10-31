#!/usr/bin/env python3
"""Merge, de-duplicate and pre-sort exported bookmarks, and prepare chunks for an AI relevance pass.

Usage: python3 -I classify.py <all_bookmarks.csv> <workdir> [--personal-rules rules.json] [--chunks N]

Writes into <workdir>:
  proposed.json      every unique bookmark with an id and a keyword-based first-guess folder
  ai/in_<k>.jsonl    work-candidate bookmarks split into N chunks (default 7) for an LLM to rate
  ai/brief.md        the relevance brief that goes with each chunk (copied from relevance-brief.md)

--personal-rules is a JSON file {"domains": "<regex>", "folders": "<regex>"}. Matches are
treated as personal (kept out of the work tree). It is deliberately not in the repo: keep it with your data.
"""
import csv, json, os, re, shutil, sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))

# (new folder, keyword regex); every hit counts toward the score, the first hit names the category
CATS = [
    ("Companion Intelligence/01 Company & Product", r"companionintel|lifescope|ærth|aerth|magic maps|singularity univ"),
    ("Companion Intelligence/04 Voice, Wearables & Devices", r"even ?realities|mentra|\bomi\b|pebble|maixcam|home ?assistant|nabucasa|nabu casa|esp32|wearable|smart ?glasses|voice|whisper|\btts\b|speech|wake ?word|gimbal|osmo|dji|robot|raspberry|arduino|\bble\b|bluetooth|lidar"),
    ("Companion Intelligence/05 Spatial, XR & 3D", r"\bxr\b|\bvr\b|\bar\b|webxr|unity|quest|oculus|meta ?human|xreal|nreal|splat|gaussian|three\.?js|threetiles|3d|sketchfab|magic leap|mapbox|geospatial|photogramm|openxr|steamvr|hologram|spatial|aframe|babylon|blender|nerf"),
    ("Companion Intelligence/03 Agents, MCP & Bots", r"\bagent|\bmcp\b|model context|claude|anthropic|openclaw|hermes|botpress|wit\.ai|botonic|chatbot|\bbots?\b|langchain|llamaindex|autogen|crewai|swarm|skills?\b|copilot|cursor|prompt|function calling|openai|gpt"),
    ("Companion Intelligence/02 Local-First AI & Memory", r"ollama|llama|\bllm|local ?ai|self-?host|local-first|\brag\b|vector|embedding|huggingface|knowledge ?graph|memory|\bgguf|vllm|lm studio|open ?source ai|\bmlx\b|transformers|diffusion|comfy|neural|machine learning|deep learning|\bai\b"),
    ("Companion Intelligence/06 Active Inference & Research", r"active.?inference|free.?energy|arxiv|\bpaper|bayesian|predictive coding|cognitive|neuroscience|aclanthology|research"),
    ("Companion Intelligence/07 OS & Infrastructure", r"ubuntu|cachyos|\blinux|docker|kubernetes|cloudflare|netlify|gandi|\bdns\b|github actions|ci/cd|temporal\.io|\baws\b|terraform|nginx|tailscale|homelab|proxmox|coolify|systemd|self-?hosted|1password|vpn"),
    ("Companion Intelligence/08 App Stores & Distribution", r"appstore|app ?store|casaos|runtipi|play store|itunes|marketplace|awesome-selfhost|testflight|homebrew|scoop"),
    ("Companion Intelligence/09 Security & Safety", r"security|vulnerab|\bcve\b|exploit|alignment|unalign|cisa|pentest|privacy|threat"),
    ("Companion Intelligence/10 Marketing, GTM & Social", r"mailchimp|metricool|linkedin|\bseo\b|\bbrand|social media|feedly|outreach|\bgtm\b|go-to-market|newsletter|analytics|\bads?\b|hubspot|canva"),
    ("Companion Intelligence/11 Funding & Investors", r"\bvc\b|venture|capital|\bgrants?\b|invest|accelerator|partner network|startup funding|angel|futo|aaif|glasswing|portfolio"),
]
# old folder names that decide the category outright (adjust to your own folder habits)
FOLDER_MAP = [
    (r"CIntel/AppStores", "Companion Intelligence/08 App Stores & Distribution"),
    (r"CIntel/Investment", "Companion Intelligence/11 Funding & Investors"),
    (r"CIntel/Gimbal|CIntel/LITA", "Companion Intelligence/04 Voice, Wearables & Devices"),
    (r"/XR|XREAL", "Companion Intelligence/05 Spatial, XR & 3D"),
    (r"AI/Bots|AI/Skills|BOT ROOT", "Companion Intelligence/03 Agents, MCP & Bots"),
    (r"/OSS", "Companion Intelligence/06 Active Inference & Research"),
]
CI_FOLDER = re.compile(r"CIntel|/XR|XREAL|Bookmarks Bar/AI|BOT ROOT|/OSS|REPO-WORKSPACE|Gimbal|AppStores|Investment|LITA")
CAREER = re.compile(r"Jobs/")
LEARN = re.compile(r"Education")
DEVREF = re.compile(r"Developer")
JUNK_SCHEMES = {"javascript", "chrome", "chrome-extension", "file"}


def classify(r, personal_dom, personal_folder):
    f = r["folder"]
    txt = (r["title"] + " " + r["url"] + " " + f).lower()
    host = urlparse(r["url"]).netloc.lower()
    if CAREER.search(f):
        return "Career & Jobs/" + f.split("Jobs/")[1].split("/")[0], 0
    if LEARN.search(f):
        return "Learning/College", 0
    if personal_dom.search(r["url"]) or (personal_folder.search(f) and not CI_FOLDER.search(f)):
        return "Personal (move out of work tree)", 0
    score = 3 if CI_FOLDER.search(f) else 0
    hits = [name for name, rx in CATS if re.search(rx, txt)]
    score += len(hits)
    cat = next((name for rx, name in FOLDER_MAP if re.search(rx, f)), None) or (hits[0] if hits else None)
    if not cat:
        if DEVREF.search(f):
            return "Reference/Dev Tools & Design", 0
        return ("Reference/GitHub (uncategorized)" if "github.com" in host else "00 Inbox - Triage"), 0
    return (cat, score) if score >= 2 else ("00 Inbox - Triage", score)


def main(src, work, rules_path, chunks):
    never = re.compile(r"(?!x)x")
    rules = json.load(open(rules_path)) if rules_path else {}
    pdom = re.compile(rules["domains"], re.I) if rules.get("domains") else never
    pfol = re.compile(rules["folders"], re.I) if rules.get("folders") else never

    seen, junk = {}, 0
    for r in csv.DictReader(open(src)):
        if urlparse(r["url"]).scheme in JUNK_SCHEMES:
            junk += 1
            continue
        key = r["url"].split("#")[0].rstrip("/").replace("http://", "https://", 1)
        seen.setdefault(key, r)
    out = []
    for i, r in enumerate(seen.values()):
        cat, score = classify(r, pdom, pfol)
        out.append(dict(id=i, new_folder=cat, ci_score=score, title=r["title"], url=r["url"], old_location=r["browser"] + ":" + r["folder"]))
    os.makedirs(os.path.join(work, "ai"), exist_ok=True)
    json.dump(out, open(os.path.join(work, "proposed.json"), "w"))

    cand = [o for o in out if not o["new_folder"].startswith(("Personal", "Career", "Learning"))]
    size = -(-len(cand) // chunks) or 1
    for k in range(chunks):
        with open(os.path.join(work, "ai", f"in_{k}.jsonl"), "w") as f:
            for o in cand[k * size:(k + 1) * size]:
                p = urlparse(o["url"])
                f.write(json.dumps(dict(id=o["id"], t=o["title"][:90], d=p.netloc.removeprefix("www.")[:40], p="" if "github.com" in p.netloc else o["url"][:70], old=o["old_location"].split(":", 1)[1][-40:]), ensure_ascii=False) + "\n")
    shutil.copy(os.path.join(HERE, "relevance-brief.md"), os.path.join(work, "ai", "brief.md"))
    print(f"{len(out)} unique ({junk} junk dropped); {len(cand)} candidates in {chunks} chunks -> {work}/ai")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2:
        sys.exit(__doc__)
    opt = lambda name, default=None: a[a.index(name) + 1] if name in a else default
    main(a[0], a[1], opt("--personal-rules"), int(opt("--chunks", 7)))
