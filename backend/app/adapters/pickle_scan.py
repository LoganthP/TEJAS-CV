"""Static scan of pickle streams inside model files (.pt/.pth/.pkl/.bin).

Pickle can execute arbitrary code on load, so a "model" is itself a supply-chain
attack vector. We never unpickle untrusted files; we disassemble the opcode stream
and list every imported global. Heuristic: STACK_GLOBAL arguments reached through
memo references may be missed; this is reported as a known limitation.
"""
from __future__ import annotations

import pickletools
import zipfile
from pathlib import Path

DANGEROUS_MODULES = {"os", "posix", "nt", "subprocess", "sys", "socket", "shutil", "runpy",
                     "importlib", "webbrowser", "pty", "ctypes", "multiprocessing", "code",
                     "commands", "requests", "urllib", "http"}
DANGEROUS_GLOBALS = {"builtins.eval", "builtins.exec", "builtins.compile", "builtins.open",
                     "builtins.__import__", "builtins.getattr", "__builtin__.eval",
                     "__builtin__.exec", "builtins.apply"}
SAFE_PREFIXES = ("torch.", "collections.OrderedDict", "numpy.", "_codecs.encode",
                 "builtins.set", "builtins.slice", "builtins.frozenset", "builtins.bytearray",
                 "__builtin__.set")


def _scan_stream(data: bytes) -> list[str]:
    found, strings = [], []
    for op, arg, _ in pickletools.genops(data):
        if op.name in ("GLOBAL", "INST"):
            found.append(str(arg).replace(" ", "."))
        elif op.name == "STACK_GLOBAL" and len(strings) >= 2:
            found.append(f"{strings[-2]}.{strings[-1]}")
        if op.name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "BINUNICODE8"):
            strings.append(str(arg))
    return found


def scan_model_file(path: str | Path) -> dict:
    path = Path(path)
    globals_, streams, errors = [], 0, []
    try:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as zf:
                for name in zf.namelist():
                    if name.endswith(".pkl"):
                        streams += 1
                        globals_ += _scan_stream(zf.read(name))
        else:
            streams = 1
            globals_ = _scan_stream(path.read_bytes())
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{type(exc).__name__}: {exc}")
    uniq = sorted(set(globals_))
    dangerous = [g for g in uniq if g in DANGEROUS_GLOBALS or g.split(".")[0] in DANGEROUS_MODULES]
    unknown = [g for g in uniq if g not in dangerous and not g.startswith(SAFE_PREFIXES)]
    return {"scanned": streams > 0 and not errors, "pickle_streams": streams, "globals": uniq,
            "dangerous": dangerous, "unknown": unknown, "errors": errors}
