"""TEJAS-CV Reproducible Attack Generator Package.

Provides pure numpy/PIL implementations of dataset, image, model, and inference attacks:
- badnets, blended, sig, wanet, label_flip, clean_label, near_duplicate_flood
- substitution, weight_perturb, architectural_backdoor
- output_edit, replay, reorder
"""

from .image_attacks import (
    apply_badnets,
    apply_blended,
    apply_sig,
    apply_wanet,
)
from .dataset_attacks import (
    generate_dataset_attack,
)
from .model_attacks import (
    attack_substitution,
    attack_weight_perturb,
    attack_architectural_backdoor,
)
from .inference_attacks import (
    attack_output_edit,
    attack_reorder,
    attack_replay,
)

__all__ = [
    "apply_badnets",
    "apply_blended",
    "apply_sig",
    "apply_wanet",
    "generate_dataset_attack",
    "attack_substitution",
    "attack_weight_perturb",
    "attack_architectural_backdoor",
    "attack_output_edit",
    "attack_reorder",
    "attack_replay",
]
