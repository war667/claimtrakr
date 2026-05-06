from typing import Optional


def compute_priority_label(score: Optional[int]) -> str:
    if score is None:
        return "low"
    if score >= 70:
        return "high"
    if score >= 40:
        return "medium"
    return "low"
