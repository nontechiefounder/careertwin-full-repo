from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
VERSION_DIR = ROOT / "packages" / "ontology" / "0.1.0"


def read_yaml(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a YAML object")
    return data


def validate() -> None:
    ontology = read_yaml(VERSION_DIR / "ontology.yaml")
    rubric = read_yaml(VERSION_DIR / "rubric.yaml")

    if ontology.get("version") != rubric.get("version"):
        raise ValueError("ontology and rubric versions must match")
    entities = ontology.get("entities", {})
    for relation_name, relation in ontology.get("relationships", {}).items():
        if relation["from"] not in entities or relation["to"] not in entities:
            raise ValueError(f"relationship {relation_name} references an unknown entity")

    weights = rubric.get("score_dimensions", {})
    total = sum(float(value) for value in weights.values())
    if abs(total - 1.0) > 1e-9:
        raise ValueError(f"score dimension weights must sum to 1.0, got {total}")

    prohibited = set(ontology.get("prohibited_features", []))
    required_prohibitions = {"age", "gender", "race", "disability", "similarity_to_past_employee"}
    if not required_prohibitions.issubset(prohibited):
        raise ValueError("prohibited feature baseline is incomplete")

    print(f"validated ontology {ontology['version']}: {len(entities)} entities, {len(weights)} score dimensions")


if __name__ == "__main__":
    validate()

