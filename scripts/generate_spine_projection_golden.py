#!/usr/bin/env python3
"""Regenerate the committed golden spine-projection fixtures.

For each released handoff packet in the gate corpus, project it into its five spine
objects and write each projected object as a sorted-key JSON fixture under
``tests/fixtures/governance/spine_projection/``. These golden fixtures make the
lossy handoff-packet -> spine projection reviewable line-by-line; a regression test
asserts the live projection still matches them byte-for-byte.

Run: ``python scripts/generate_spine_projection_golden.py``
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "src"))

from epigenomics_mcp.governance import project_to_spine as projector  # noqa: E402

OUT_DIR = REPO_ROOT / "tests" / "fixtures" / "governance" / "spine_projection"

# (corpus_rel_path, stable_fixture_stem)
CORPUS: tuple[tuple[str, str], ...] = (
    ("examples/bioactivity_pod_handoff_valid/accepted.json", "accepted"),
    ("examples/bioactivity_pod_handoff_valid/accepted_with_warnings.json", "accepted_with_warnings"),
    ("examples/bioactivity_pod_handoff_valid/excluded.json", "excluded"),
    ("examples/bioactivity_pod_handoff_valid/exploratory_only.json", "exploratory_only"),
    ("tests/fixtures/governance/golden_pass_handoff.json", "golden_pass_handoff"),
)


def _projections(packet: dict) -> dict[str, dict]:
    return {
        "pod": projector.project_pod_record(packet),
        "observation": projector.project_bioactivity_observation(packet),
        "concentrationResponseDesign": projector.project_concentration_response_design(packet),
        "claimTransitionPolicy": projector.project_claim_transition_policy(packet),
        "readiness": projector.project_pod_readiness(packet),
    }


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for rel, stem in CORPUS:
        packet = json.loads((REPO_ROOT / rel).read_text(encoding="utf-8"))
        for label, obj in _projections(packet).items():
            out = OUT_DIR / f"{stem}__{label}.json"
            out.write_text(
                json.dumps(obj, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            written += 1
    print(f"[generate_spine_projection_golden] wrote {written} projected fixtures to {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
