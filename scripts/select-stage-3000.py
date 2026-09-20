# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2.0,<3"]
# ///

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def read_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def clamp(value, minimum=0.0, maximum=100.0):
    return max(minimum, min(maximum, value))


parser = argparse.ArgumentParser(description="Rank and select the local stage-3,000 promotion set.")
parser.add_argument("--signals", default="results/stage-3000-local-signals.jsonl")
parser.add_argument("--source", default="expansion/sources/stage-3000-source.jsonl")
parser.add_argument("--selected", default="expansion/sources/stage-3000-selected-source.jsonl")
parser.add_argument("--report", default="expansion/sources/stage-3000-semantic-uniqueness.json")
parser.add_argument("--scores", default="expansion/sources/stage-3000-local-scores.jsonl")
parser.add_argument("--target", type=int, default=2000)
parser.add_argument("--duplicate-threshold", type=float, default=0.985)
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
signals = read_jsonl(root / args.signals)
source = read_jsonl(root / args.source)
source_by_id = {record["proposed_id"]: record for record in source}

reference = [record for record in signals if record["scope"] == "reference"]
targets = [record for record in signals if record["scope"] == "target"]
if len(reference) != 1000:
    raise SystemExit(f"Expected 1,000 reference embeddings; found {len(reference)}.")
if len(targets) < args.target:
    raise SystemExit(f"Need at least {args.target} target embeddings; found {len(targets)}.")

reference_vectors = np.asarray([record["embedding"] for record in reference], dtype=np.float32)
target_vectors = np.asarray([record["embedding"] for record in targets], dtype=np.float32)
reference_vectors /= np.linalg.norm(reference_vectors, axis=1, keepdims=True).clip(min=1e-12)
target_vectors /= np.linalg.norm(target_vectors, axis=1, keepdims=True).clip(min=1e-12)

nearest_reference_score = np.full(len(targets), -1.0, dtype=np.float32)
nearest_reference_index = np.full(len(targets), -1, dtype=np.int32)
nearest_target_score = np.full(len(targets), -1.0, dtype=np.float32)
nearest_target_index = np.full(len(targets), -1, dtype=np.int32)
reference_nearest_score = np.full(len(reference), -1.0, dtype=np.float32)
reference_nearest_index = np.full(len(reference), -1, dtype=np.int32)
all_vectors = np.concatenate([reference_vectors, target_vectors], axis=0)
block_size = 128

for start in range(0, len(reference), block_size):
    end = min(len(reference), start + block_size)
    similarity = reference_vectors[start:end] @ all_vectors.T
    rows = np.arange(end - start)
    similarity[rows, np.arange(start, end)] = -1.0
    indexes = similarity.argmax(axis=1)
    reference_nearest_index[start:end] = indexes
    reference_nearest_score[start:end] = similarity[rows, indexes]

for start in range(0, len(targets), block_size):
    end = min(len(targets), start + block_size)
    batch = target_vectors[start:end]
    reference_similarity = batch @ reference_vectors.T
    reference_indexes = reference_similarity.argmax(axis=1)
    nearest_reference_index[start:end] = reference_indexes
    nearest_reference_score[start:end] = reference_similarity[np.arange(end - start), reference_indexes]

    target_similarity = batch @ target_vectors.T
    rows = np.arange(end - start)
    target_similarity[rows, np.arange(start, end)] = -1.0
    target_indexes = target_similarity.argmax(axis=1)
    nearest_target_index[start:end] = target_indexes
    nearest_target_score[start:end] = target_similarity[rows, target_indexes]
    print(f"Compared {end}/{len(targets)} target embeddings.", flush=True)

ranked = []
duplicate_candidates = []
target_scores = {}
for index, signal in enumerate(targets):
    if nearest_reference_score[index] >= nearest_target_score[index]:
        nearest_id = reference[int(nearest_reference_index[index])]["id"]
        nearest_scope = "reference"
        nearest_similarity = float(nearest_reference_score[index])
    else:
        nearest_id = targets[int(nearest_target_index[index])]["id"]
        nearest_scope = "target"
        nearest_similarity = float(nearest_target_score[index])

    uniqueness = round(clamp((0.997 - nearest_similarity) / (0.997 - 0.82) * 100))
    selection_score = round(
        signal["meme_strength"] * 0.62
        + signal["asset_quality"] * 0.18
        + uniqueness * 0.20,
        2,
    )
    enriched = {
        **source_by_id[signal["id"]],
        "meme_strength": signal["meme_strength"],
        "asset_quality": signal["asset_quality"],
        "reaction_fit": signal["reaction_fit"],
        "uniqueness_score": uniqueness,
        "nearest_embedding_id": nearest_id,
        "nearest_embedding_scope": nearest_scope,
        "nearest_embedding_similarity": round(nearest_similarity, 6),
        "selection_score": selection_score,
    }
    if nearest_similarity >= args.duplicate_threshold:
        duplicate_candidates.append(enriched)
    else:
        ranked.append(enriched)
    target_scores[signal["id"]] = enriched

ranked.sort(
    key=lambda record: (
        record["selection_score"],
        record["meme_strength"],
        record["asset_quality"],
        record["proposed_id"],
    ),
    reverse=True,
)
if len(ranked) < args.target:
    raise SystemExit(
        f"Only {len(ranked)} records remain after semantic duplicate blocking; need {args.target}."
    )
selected = ranked[: args.target]
selected_ids = {record["proposed_id"] for record in selected}

selected_path = root / args.selected
selected_path.parent.mkdir(parents=True, exist_ok=True)
selected_path.write_text("\n".join(json.dumps(record, separators=(",", ":")) for record in selected) + "\n")

scores_path = root / args.scores
score_records = []
for index, signal in enumerate(reference):
    nearest_index = int(reference_nearest_index[index])
    nearest = reference[nearest_index] if nearest_index < len(reference) else targets[nearest_index - len(reference)]
    similarity = float(reference_nearest_score[index])
    score_records.append({
        **{key: value for key, value in signal.items() if key != "embedding"},
        "uniqueness_score": round(clamp((0.997 - similarity) / (0.997 - 0.82) * 100)),
        "nearest_embedding_id": nearest["id"],
        "nearest_embedding_scope": nearest["scope"],
        "nearest_embedding_similarity": round(similarity, 6),
    })
for signal in targets:
    enriched = target_scores[signal["id"]]
    score_records.append({
        **{key: value for key, value in signal.items() if key != "embedding"},
        "uniqueness_score": enriched["uniqueness_score"],
        "nearest_embedding_id": enriched["nearest_embedding_id"],
        "nearest_embedding_scope": enriched["nearest_embedding_scope"],
        "nearest_embedding_similarity": enriched["nearest_embedding_similarity"],
    })
scores_path.write_text(
    "\n".join(
        json.dumps(record, separators=(",", ":")) for record in score_records
    )
    + "\n"
)

provider_counts = {}
for record in selected:
    provider_counts[record["provider"]] = provider_counts.get(record["provider"], 0) + 1
report = {
    "version": "stage-3000-local-clip-selection-v1",
    "model": "Xenova/clip-vit-base-patch32 (quantized q8, local inference)",
    "reference_records": len(reference),
    "target_records": len(targets),
    "duplicate_threshold": args.duplicate_threshold,
    "embedding_duplicate_candidates": len(duplicate_candidates),
    "selected_records": len(selected),
    "rejected_records": len(targets) - len(selected),
    "selected_by_provider": provider_counts,
    "score_formula": "62% meme strength + 18% asset quality + 20% embedding uniqueness",
    "selection_score": {
        "minimum": min(record["selection_score"] for record in selected),
        "median": float(np.median([record["selection_score"] for record in selected])),
        "maximum": max(record["selection_score"] for record in selected),
    },
    "meme_strength": {
        "minimum": min(record["meme_strength"] for record in selected),
        "median": float(np.median([record["meme_strength"] for record in selected])),
        "maximum": max(record["meme_strength"] for record in selected),
    },
    "asset_quality": {
        "minimum": min(record["asset_quality"] for record in selected),
        "median": float(np.median([record["asset_quality"] for record in selected])),
        "maximum": max(record["asset_quality"] for record in selected),
    },
    "uniqueness_score": {
        "minimum": min(record["uniqueness_score"] for record in selected),
        "median": float(np.median([record["uniqueness_score"] for record in selected])),
        "maximum": max(record["uniqueness_score"] for record in selected),
    },
    "duplicate_examples": [
        {
            "id": record["proposed_id"],
            "nearest_id": record["nearest_embedding_id"],
            "nearest_scope": record["nearest_embedding_scope"],
            "similarity": record["nearest_embedding_similarity"],
        }
        for record in sorted(
            duplicate_candidates,
            key=lambda record: record["nearest_embedding_similarity"],
            reverse=True,
        )[:50]
    ],
    "selected_ids_sha256": hashlib.sha256("\n".join(sorted(selected_ids)).encode()).hexdigest(),
    "human_validated": False,
}
report_path = root / args.report
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({key: report[key] for key in ["selected_records", "selected_by_provider", "embedding_duplicate_candidates", "selection_score", "meme_strength", "asset_quality", "uniqueness_score"]}, indent=2))
