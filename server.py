#!/usr/bin/env python3
"""
PrepTrack Local Development Server
Run: python server.py
Then open: http://localhost:3000
"""

import http.server
import socketserver
import os
import mimetypes
import sys

PORT = int(os.environ.get('PORT', 3000))
ROOT = os.path.dirname(os.path.abspath(__file__))

MIME_OVERRIDES = {
    '.js':   'application/javascript; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
}

class PrepTrackHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Required for Service Worker
        self.send_header('Service-Worker-Allowed', '/')
        self.send_header('Access-Control-Allow-Origin', '*')
        # No-cache for SW
        if self.path == '/sw.js':
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        if ext in MIME_OVERRIDES:
            return MIME_OVERRIDES[ext]
        return super().guess_type(path)

    def do_GET(self):
        # Serve index.html for root
        if self.path == '/':
            self.path = '/index.html'

        # Try to serve the file directly
        full_path = ROOT + self.path.split('?')[0]
        if os.path.isfile(full_path):
            return super().do_GET()

        # Try adding .html extension
        if not self.path.endswith('.html') and os.path.isfile(full_path + '.html'):
            self.path = self.path + '.html'
            return super().do_GET()

        # Fallback to index.html for SPA routing (but NOT for static assets)
        _, ext = os.path.splitext(self.path)
        if not ext or ext == '.html':
            self.path = '/index.html'
            super().do_GET()
        else:
            self.send_error(404, f'File not found: {self.path}')

    def log_message(self, format, *args):
        # Clean log output
        print(f'  {self.address_string()} {format % args}')


if __name__ == '__main__':
    os.chdir(ROOT)
    with socketserver.TCPServer(('', PORT), PrepTrackHandler) as httpd:
        httpd.allow_reuse_address = True
        print(f'\n  PrepTrack Dev Server running at:')
        print(f'  http://localhost:{PORT}\n')
        print(f'  Auth callback URL for Supabase:')
        print(f'  http://localhost:{PORT}/pages/auth-callback.html\n')
        print(f'  Press Ctrl+C to stop.\n')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  Server stopped.')

