#!/usr/bin/env python3
"""Evaluate a cheap local text classifier on Cornell's controlled quote pairs.

Run with:
  uv run --with scikit-learn python experiments/dialogue_memorability_classifier.py

The folds are grouped by movie so lines from one film never appear in both the
training and test portions of a fold. The primary metric is pairwise accuracy:
did the classifier score the Cornell memorable line above its controlled mate?
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import FeatureUnion


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "eval" / "dialogue_cornell_memorability_pairs.jsonl"
OUTPUT = ROOT / "results" / "dialogue-memorability-v1" / "tfidf-logistic-report.json"


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def features() -> FeatureUnion:
    return FeatureUnion(
        [
            (
                "words",
                TfidfVectorizer(
                    lowercase=True,
                    ngram_range=(1, 2),
                    min_df=2,
                    max_df=0.98,
                    sublinear_tf=True,
                    strip_accents="unicode",
                ),
            ),
            (
                "characters",
                TfidfVectorizer(
                    analyzer="char_wb",
                    lowercase=True,
                    ngram_range=(3, 5),
                    min_df=2,
                    max_features=60_000,
                    sublinear_tf=True,
                ),
            ),
        ]
    )


def main() -> None:
    pairs = read_jsonl(INPUT)
    texts: list[str] = []
    labels: list[int] = []
    groups: list[str] = []
    pair_indexes: list[tuple[int, int]] = []
    for pair in pairs:
        positive_index = len(texts)
        texts.append(pair["memorable"]["annotation_quote"])
        labels.append(1)
        groups.append(pair["work_title"])
        negative_index = len(texts)
        texts.append(pair["non_memorable"]["quote"])
        labels.append(0)
        groups.append(pair["work_title"])
        pair_indexes.append((positive_index, negative_index))

    labels_array = np.asarray(labels)
    groups_array = np.asarray(groups)
    scores = np.zeros(len(texts), dtype=float)
    fold_rows = []
    splitter = GroupKFold(n_splits=5)

    for fold, (train_indexes, test_indexes) in enumerate(
        splitter.split(texts, labels_array, groups_array), start=1
    ):
        vectorizer = features()
        train_vectors = vectorizer.fit_transform([texts[index] for index in train_indexes])
        classifier = LogisticRegression(
            C=2.0,
            max_iter=2_000,
            random_state=42,
            solver="liblinear",
        )
        classifier.fit(train_vectors, labels_array[train_indexes])
        test_vectors = vectorizer.transform([texts[index] for index in test_indexes])
        scores[test_indexes] = classifier.predict_proba(test_vectors)[:, 1]
        fold_pair_indexes = [
            (positive, negative)
            for positive, negative in pair_indexes
            if positive in set(test_indexes)
        ]
        fold_rows.append(
            {
                "fold": fold,
                "movies": len(set(groups_array[test_indexes])),
                "pairs": len(fold_pair_indexes),
                "pairwise_accuracy": round(
                    sum(scores[positive] > scores[negative] for positive, negative in fold_pair_indexes)
                    / len(fold_pair_indexes),
                    4,
                ),
            }
        )

    wins = int(sum(scores[positive] > scores[negative] for positive, negative in pair_indexes))
    ties = int(sum(scores[positive] == scores[negative] for positive, negative in pair_indexes))
    predictions = (scores >= 0.5).astype(int)
    report = {
        "version": "cornell-dialogue-tfidf-logistic-v1",
        "dataset": "Cornell Movie-Quotes Corpus v1.0 controlled memorable/non-memorable pairs",
        "validation": "5-fold group cross-validation with movies kept within one fold",
        "features": "word 1-2 grams plus character 3-5 grams",
        "pairs": len(pair_indexes),
        "movies": len(set(groups)),
        "pairwise_correct": wins,
        "pairwise_ties": ties,
        "pairwise_accuracy": round(wins / len(pair_indexes), 4),
        "line_classification_accuracy": round(float(np.mean(predictions == labels_array)), 4),
        "folds": fold_rows,
        "uncertainty": (
            "The label is IMDb memorable-quote presence, not owner sendability or "
            "text-to-dialogue relevance. This experiment does not grant production rights."
        ),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({**report, "report_output": str(OUTPUT)}, indent=2))


if __name__ == "__main__":
    main()
