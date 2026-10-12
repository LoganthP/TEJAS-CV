"""Download public benchmark archives -- run this ONLY on an internet-connected machine.

    python scripts/fetch_datasets.py --list
    python scripts/fetch_datasets.py cifar10 yolo_coco8

Files land in TEJAS_HOME/benchmarks_raw/<id>/ together with fetch_manifest.json (URL, size,
SHA-256, time). Copy that folder to the air-gapped machine and run import_dataset.py there.
Sources behind registration or licence pages are never scraped; manual steps are printed.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request

from _common import BACKEND, init

import yaml


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    settings = init()
    cat = yaml.safe_load((BACKEND / "benchmarks" / "catalog.yaml").read_text(encoding="utf-8"))["datasets"]
    if a.list or not a.ids:
        for e in cat:
            auto = e.get("url", "").startswith("http")
            print(f"{e['id']:<15} {e['task']:<14} {'auto' if auto else 'MANUAL'}  {e['name']}")
        return 0
    from app.core.hashing import sha256_file
    for ds in a.ids:
        e = next((x for x in cat if x["id"] == ds), None)
        if e is None:
            print(f"[x] unknown id {ds}")
            continue
        urls = [u for u in (e.get("url"), e.get("annotations_url")) if u and u.startswith("http")]
        if not urls:
            print(f"[!] {ds}: manual download required -> {e.get('manual_download_url')}")
            continue
        out = settings.home / "benchmarks_raw" / ds
        out.mkdir(parents=True, exist_ok=True)
        records = []
        for url in urls:
            dest = out / url.rstrip("/").split("/")[-1]
            print(f"[*] {url}")
            urllib.request.urlretrieve(url, dest)
            records.append({"url": url, "file": dest.name, "bytes": dest.stat().st_size,
                            "sha256": sha256_file(dest), "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S")})
            print(f"    {dest.stat().st_size/1e6:.1f} MB  sha256={records[-1]['sha256']}")
        (out / "fetch_manifest.json").write_text(json.dumps(records, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
