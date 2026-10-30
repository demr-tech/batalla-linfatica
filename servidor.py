import json, time, secrets, random, threading, socket, webbrowser, os
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from contextlib import contextmanager
from urllib.parse import urlparse, parse_qs
from io import BytesIO

ROOT = Path(__file__).resolve().parent
BANK = json.loads((ROOT / 'preguntas.json').read_text(encoding='utf-8'))
ROOMS = {}
LOCK = threading.RLock()
POOL = None
if os.environ.get('DATABASE_URL'):
    from psycopg_pool import ConnectionPool
    POOL = ConnectionPool(os.environ['DATABASE_URL'], min_size=0, max_size=6, timeout=12,
                          kwargs={'connect_timeout':10})

@contextmanager
def room_store(code, creating=False):
    if POOL is None:
        with LOCK:
            yield ROOMS
        return
    with POOL.connection() as conn, conn.transaction():
        if creating:
            conn.execute('SELECT pg_advisory_xact_lock(682193)')
            conn.execute('DELETE FROM game_rooms WHERE expires_at < now()')
            rows = conn.execute('SELECT code FROM game_rooms').fetchall()
            if len(rows) >= 200: raise ValueError('Hay muchas partidas abiertas. Inténtalo más tarde.')
            rooms = {row[0]: None for row in rows}
        else:
            row = conn.execute('SELECT data FROM game_rooms WHERE code=%s AND expires_at>now() FOR UPDATE', (code,)).fetchone()
            rooms = {code:row[0]} if row else {}
        before = json.dumps(rooms, ensure_ascii=False)
        yield rooms
        if json.dumps(rooms, ensure_ascii=False) != before:
            for key, room in rooms.items():
                if room is not None:
                    conn.execute('INSERT INTO game_rooms(code,data) VALUES (%s,%s::jsonb) ON CONFLICT(code) DO UPDATE SET data=EXCLUDED.data', (key,json.dumps(room,ensure_ascii=False)))

def advance(r):
    if r['phase'] == 'question' and (time.time() >= r['deadline'] or (r['players'] and all(p['answer'] is not None for p in r['players'].values()))):
        r['phase'] = 'reveal'
        for p in r['players'].values():
            if p['answer'] is None: p['streak']=0

def view(r, token):
    advance(r)
    host = secrets.compare_digest(r['host'], token)
    p = r['players'].get(token)
    if not host and p is None: raise ValueError('Vuelve a entrar a la sala.')
    result = dict(phase=r['phase'], code=r['code'], host=host, index=r['index'] + 1, total=len(r['questions']), deadline=r.get('deadline',0), now=time.time(), players=sorted([dict(name=p['name'], score=p['score'], answered=p['answer'] is not None) for p in r['players'].values()], key=lambda p:-p['score']))
    if r['phase'] in ('question','reveal'):
        q = r['questions'][r['index']]
        result['question'] = dict(text=q['text'], options=q['options'], kind=q['kind'])
        if r['phase']=='reveal': result['question'].update(correct=q['correct'], explanation=q['explanation'])
    if p: result['mine'] = dict(answer=p['answer'], gain=p['gain'], score=p['score'], streak=p.get('streak',0), best=p.get('best',0), hits=p.get('hits',0))
    return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self, data, status=200, mime='application/json'):
        payload = json.dumps(data,ensure_ascii=False).encode() if mime=='application/json' else data
        self.send_response(status); self.send_header('Content-Type',mime+'; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Referrer-Policy','same-origin'); self.send_header('Content-Length',str(len(payload))); self.end_headers(); self.wfile.write(payload)
    def do_GET(self):
        if self.path.split('?')[0] in ('/','/index.html'): self.send((ROOT/'index.html').read_bytes(),mime='text/html')
        elif urlparse(self.path).path=='/qr.svg':
            code=parse_qs(urlparse(self.path).query).get('sala',[''])[0]
            if len(code)!=6 or not code.isascii() or not code.isdigit():
                self.send({'error':'Código de sala no válido'},400); return
            import qrcode
            from qrcode.image.svg import SvgPathImage
            invite='https://batalla-linfatica.onrender.com/?sala='+code
            qr=qrcode.make(invite,image_factory=SvgPathImage,box_size=8,border=4,
                           error_correction=qrcode.constants.ERROR_CORRECT_M)
            data=BytesIO(); qr.save(data)
            self.send(data.getvalue(),mime='image/svg+xml')
        elif self.path=='/health': self.send({'ok':True})
        else: self.send({'error':'No encontrado'},404)
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length',0))
            if length<2 or length>4096: raise ValueError('Solicitud demasiado grande o vacía.')
            d=json.loads(self.rfile.read(length))
            if not isinstance(d,dict): raise ValueError('Solicitud no válida.')
            self.send(self.process(d))
        except (ValueError,KeyError,TypeError,json.JSONDecodeError) as e: self.send({'error':str(e)},400)
        except (BrokenPipeError, ConnectionResetError): pass
        except Exception:
            print('Error procesando una solicitud; revisa la conexión de la base de datos.',flush=True)
            self.send({'error':'La conexión está tardando. Inténtalo de nuevo en unos segundos.'},503)
    def process(self,d):
            with room_store(str(d.get('code','')), self.path=='/api/create') as rooms:
                action=self.path
                if action=='/api/create':
                    code=str(secrets.randbelow(900000)+100000)
                    while code in rooms: code=str(secrets.randbelow(900000)+100000)
                    questions=[]
                    count=int(d.get('count',15))
                    if count not in (10,15,30): raise ValueError('Elige 10, 15 o 30 preguntas.')
                    for row in random.sample(BANK,count):
                        pairs=list(enumerate(row[1])); random.shuffle(pairs)
                        questions.append(dict(text=row[0],options=[p[1] for p in pairs],correct=next(i for i,p in enumerate(pairs) if p[0]==0),explanation=row[2],kind=row[3]))
                    if not questions: raise ValueError('Selecciona al menos una pregunta.')
                    token=secrets.token_urlsafe(24)
                    rooms[code]=dict(code=code,host=token,questions=questions,phase='lobby',index=-1,players={})
                    return dict(code=code,token=token)
                code=str(d.get('code','')); token=str(d.get('token','')); r=rooms.get(code)
                if r is None: raise ValueError('No encontramos esa sala. Revisa el código.')
                if action=='/api/join':
                    if r['phase']!='lobby': raise ValueError('La partida ya empezó. Espera una nueva sala.')
                    name=str(d.get('name','')).strip()[:24]
                    if not name: raise ValueError('Escribe tu apodo.')
                    if len(r['players'])>=80: raise ValueError('La sala está llena.')
                    if any(p['name'].casefold()==name.casefold() for p in r['players'].values()): raise ValueError('Ese apodo ya está en uso.')
                    token=secrets.token_urlsafe(24); r['players'][token]=dict(name=name,score=0,answer=None,gain=0,streak=0,best=0,hits=0)
                    return dict(code=code,token=token)
                if token!=r['host'] and token not in r['players']: raise ValueError('Sesión no válida.')
                advance(r)
                if action=='/api/next':
                    if token!=r['host']: raise ValueError('Solo el anfitrión puede avanzar.')
                    if r['phase']=='question': raise ValueError('La ronda todavía está en marcha.')
                    if r['phase']=='lobby' and not r['players']:
                        r['players'][token]=dict(name='Tú · modo individual',score=0,answer=None,gain=0,streak=0,best=0,hits=0)
                    if r['phase'] not in ('lobby','reveal'): raise ValueError('La partida terminó.')
                    r['index']+=1
                    if r['index']>=len(r['questions']): r['phase']='finished'
                    else:
                        r['phase']='question'; r['deadline']=time.time()+30
                        for p in r['players'].values(): p.update(answer=None,gain=0)
                elif action=='/api/answer':
                    p=r['players'].get(token)
                    if not p or r['phase']!='question' or p['answer'] is not None: raise ValueError('La respuesta ya está cerrada.')
                    if int(d.get('index',-1))!=r['index']+1: raise ValueError('Esa ronda ya terminó.')
                    a=int(d['answer']); q=r['questions'][r['index']]
                    if a<0 or a>=len(q['options']): raise ValueError('Opción no válida.')
                    p['answer']=a
                    if a==q['correct']:
                        p['streak']=p.get('streak',0)+1; p['hits']=p.get('hits',0)+1
                        p['best']=max(p.get('best',0),p['streak'])
                        p['gain']=500+int(500*max(0,r['deadline']-time.time())/30)+100*min(3,p['streak']-1)
                    else: p['streak']=0; p['gain']=0
                    p['score']+=p['gain']
                elif action!='/api/state': raise ValueError('Acción desconocida.')
                return view(r,token)

if __name__=='__main__':
    port=int(os.environ.get('PORT','8765'))
    server=ThreadingHTTPServer(('0.0.0.0',port),Handler)
    if os.environ.get('RENDER'):
        print(f'Batalla linfática escuchando en 0.0.0.0:{port}',flush=True)
        server.serve_forever()
        raise SystemExit
    try:
        s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM); s.connect(('8.8.8.8',80)); ip=s.getsockname()[0]; s.close()
    except OSError: ip=socket.gethostbyname(socket.gethostname())
    print(f'BATALLA LINFÁTICA\nAnfitrión: http://localhost:{port}\nTeléfonos (misma Wi-Fi): http://{ip}:{port}\nMantén esta ventana abierta. Ctrl+C para salir.',flush=True)
    if '--no-browser' not in __import__('sys').argv: webbrowser.open(f'http://localhost:{port}')
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
