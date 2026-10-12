"""TEJAS-CV format converters for benchmark datasets.

Handles parsing, validating and converting external dataset formats (binary CIFAR,
GTSRB, corruption benchmarks, COCO, YOLO) into TEJAS-CV internal layouts.
"""
from .cifar10_bin import convert_cifar10_binary
from .corruptions import convert_corruption_dataset
from .gtsrb import convert_gtsrb
from .coco import parse_coco, write_coco, coco_to_internal, internal_to_coco
from .yolo import parse_yolo, write_yolo, yolo_to_internal, internal_to_yolo
