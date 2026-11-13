import threading, http.server, functools, socketserver
def start():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/lct')
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a): pass
    socketserver.ThreadingTCPServer.allow_reuse_address=True; s=socketserver.ThreadingTCPServer(('127.0.0.1',8799), functools.partial(Q, directory='/tmp/lct')); s.daemon_threads=True
    threading.Thread(target=s.serve_forever, daemon=True).start(); return s.server_address[1]
