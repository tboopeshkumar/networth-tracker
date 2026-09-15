"""Local dev server with caching disabled, so edits show up on reload.

    python3 tools/serve.py        # http://localhost:8080/?demo
"""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
print(f"http://localhost:{PORT}/?demo")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCache).serve_forever()
