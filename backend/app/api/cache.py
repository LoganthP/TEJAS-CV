"""Keep personalized API responses out of browser and CDN caches."""
from __future__ import annotations

from starlette.datastructures import MutableHeaders


class PrivateAPIMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.app(scope, receive, send)

        async def send_private(message):
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "private, no-store"
                headers["CDN-Cache-Control"] = "no-store"
                headers["Vercel-CDN-Cache-Control"] = "no-store"
            await send(message)

        await self.app(scope, receive, send_private)
