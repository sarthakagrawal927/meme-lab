#!/usr/bin/env python3
"""Validate this release offline. Does NOT fetch media or verify meme meanings."""
from pathlib import Path
from urllib.parse import urlparse
import json
from collections import Counter

BASE = Path(__file__).resolve().parent

def load_lines(name):
    return [json.loads(line) for line in (BASE/name).read_text(encoding="utf-8").splitlines() if line.strip()]

def main():
    records=json.loads((BASE/"memes.json").read_text(encoding="utf-8"))
    assert records == load_lines("memes.jsonl"), "JSON and JSONL disagree"
    assert len(records)==60
    assert len({r["id"] for r in records})==60
    assert len({r["family_id"] for r in records})==60
    assert len({r["asset"]["url"] for r in records})==60
    for r in records:
        assert r["annotation_language"]=="en"
        u=urlparse(r["asset"]["url"])
        assert u.scheme=="https" and u.netloc in {"i.imgflip.com","api.memegen.link"}
        assert not r["annotation_provenance"]["human_validated"]
        assert not r["annotation_provenance"]["audience_tested"]
        assert r["asset"]["local_file"] is None
        assert not r["delivery"]["production_ready"]
        for key in ["message","relational_pattern","example_context","near_miss_context"]:
            assert r["interpretation"][key].strip()
    reactions=load_lines("reaction_candidates.jsonl")
    templates=load_lines("caption_templates.jsonl")
    assert len(reactions)==30 and len(templates)==30
    assert {r["id"] for r in reactions}.isdisjoint({r["id"] for r in templates})
    assert {r["id"] for r in reactions+templates}=={r["id"] for r in records}
    assert all(r["delivery"]["suggested_mode"]!="caption_template" for r in reactions)
    assert all(r["delivery"]["suggested_mode"]=="caption_template" for r in templates)
    assert len(json.loads((BASE/"sources.json").read_text()))==12
    print(json.dumps({"records":len(records),"reactions":len(reactions),"templates":len(templates),"providers":dict(Counter(r["source"]["provider"] for r in records)),"offline_integrity":"passed","media_and_semantic_validation":"not performed by this script"},indent=2))

if __name__=="__main__":
    main()
