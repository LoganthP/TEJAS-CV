"""Thread-safe pub/sub that bridges worker threads to asyncio WebSocket clients.

Every job keeps its event history, so a UI that connects late replays the full
timeline before receiving live events. Channel "*" receives every event (live feed).
"""
from __future__ import annotations

import asyncio
import threading
from collections import defaultdict
from typing import Any

from ..database import iso_now

ALL = "*"


class EventBus:
    def __init__(self, history_limit: int = 2000):
        self._history: dict[str, list[dict]] = defaultdict(list)
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()
        self._seq = 0
        self._limit = history_limit

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def publish(self, job_id: str, event_type: str, **data: Any) -> dict:
        with self._lock:
            self._seq += 1
            event = {"seq": self._seq, "job_id": job_id, "type": event_type, "ts": iso_now(), **data}
            hist = self._history[job_id]
            hist.append(event)
            if len(hist) > self._limit:
                del hist[: len(hist) - self._limit]
            targets = list(self._subs[job_id]) + list(self._subs[ALL])
        if self._loop and not self._loop.is_closed():
            for q in targets:
                self._loop.call_soon_threadsafe(q.put_nowait, event)
        return event

    def subscribe(self, channel: str) -> tuple[asyncio.Queue, list[dict]]:
        q: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._subs[channel].add(q)
            history = list(self._history.get(channel, [])) if channel != ALL else []
        return q, history

    def unsubscribe(self, channel: str, q: asyncio.Queue) -> None:
        with self._lock:
            self._subs[channel].discard(q)

    def history(self, job_id: str) -> list[dict]:
        with self._lock:
            return list(self._history.get(job_id, []))


bus = EventBus()
