"""Featureflow private team API. Python 3.12+, standard library only."""
import argparse
import datetime as dt
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

STATUSES = ('Не начато', 'В работе', 'Выполнено', 'N/A')
PLATFORMS = ('Android', 'iOS', 'PWA', 'SDUI', 'Middle')


class Problem(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def text(value, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise Problem(400, 'Некорректное или слишком длинное поле')
    return value.strip()


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.db() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS users(login TEXT PRIMARY KEY, salt TEXT, digest TEXT, team TEXT, name TEXT);
            CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY, login TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS templates(team TEXT PRIMARY KEY, body TEXT);
            CREATE TABLE IF NOT EXISTS features(id TEXT PRIMARY KEY, team TEXT, body TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER, until REAL);
            ''')
        if os.name != 'nt':
            os.chmod(self.path, 0o600)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def provision(self, login, password, team, name):
        login, team, name = text(login, 80, True), text(team, 100, True), text(name, 100, True)
        if len(password) < 12 or len(password) > 256:
            raise ValueError('Пароль должен содержать от 12 до 256 символов')
        salt = secrets.token_hex(16)
        with self.db() as db:
            db.execute('INSERT INTO users VALUES(?,?,?,?,?)', (login, salt, password_hash(password, salt), team, name))

    def template(self, team, items):
        if not isinstance(items, list) or not items or len(items) > 1000:
            raise ValueError('Нужен непустой шаблон, не более 1000 пунктов')
        clean, ids = [], set()
        for item in items:
            row = {k: text(item.get(k, ''), 3000 if k == 'text' else 150, True) for k in ('id', 'text', 'competence', 'stage', 'required')}
            if row['id'] in ids:
                raise ValueError('Повторяющийся ID')
            ids.add(row['id'])
            if item.get('gate') in ('DoR', 'DoD'):
                row['gate'] = item['gate']
            if item.get('platform') in PLATFORMS:
                row['platform'] = item['platform']
            clean.append(row)
        with self.db() as db:
            db.execute('INSERT OR REPLACE INTO templates VALUES(?,?)', (team, json.dumps(clean, ensure_ascii=False)))

    def login(self, body, address):
        login = text(body.get('login'), 80, True)
        password = body.get('password')
        text(password, 256, True)
        current = time.time()
        # Shared IP and per-account budgets, persisted across restarts. No trust in X-Forwarded-For.
        keys = [hashlib.sha256(v.encode()).hexdigest() for v in ('ip:' + address, 'user:' + login)]
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM attempts WHERE until < ?', (current,))
            for index, key in enumerate(keys):
                attempt = db.execute('SELECT count FROM attempts WHERE key=?', (key,)).fetchone()
                if attempt and attempt['count'] >= (120 if index == 0 else 12):
                    raise Problem(429, 'Слишком много попыток. Подожди 15 минут.')
                db.execute('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', (key, current + 900))
            user = db.execute('SELECT * FROM users WHERE login=?', (login,)).fetchone()
        salt = user['salt'] if user else 'missing-user-salt'
        valid = hmac.compare_digest(password_hash(password, salt), user['digest'] if user else '0' * 128)
        if not user or not valid:
            raise Problem(401, 'Неверный логин или пароль')
        token = secrets.token_urlsafe(32)
        with self.db() as db:
            db.execute('DELETE FROM attempts WHERE key=?', (keys[1],))
            db.execute('DELETE FROM sessions WHERE expires < ?', (current,))
            db.execute('INSERT INTO sessions VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), login, current + 7 * 86400))
        return {'token': token}

    def user(self, token):
        with self.db() as db:
            row = db.execute('SELECT u.* FROM users u JOIN sessions s ON s.login=u.login WHERE s.digest=? AND s.expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
        if not row:
            raise Problem(401, 'Сессия истекла. Войди снова.')
        return dict(row)

    def workspace(self, user):
        with self.db() as db:
            features = [json.loads(r['body']) for r in db.execute('SELECT body FROM features WHERE team=? ORDER BY created DESC', (user['team'],))]
        return {'team': user['team'], 'features': features}

    def create(self, user, body):
        title = text(body.get('title'), 120, True)
        description = text(body.get('description', ''), 2000)
        platforms = body.get('platforms', [])
        if not isinstance(platforms, list) or any(p not in PLATFORMS for p in platforms):
            raise Problem(400, 'Неизвестная платформа')
        with self.db() as db:
            template = db.execute('SELECT body FROM templates WHERE team=?', (user['team'],)).fetchone()
            if not template:
                raise Problem(409, 'Администратор ещё не загрузил шаблон команды')
            items = json.loads(template['body'])
            for item in items:
                excluded = item.get('platform') and item['platform'] not in platforms
                item.update(status='N/A' if excluded else 'Не начато', comment='Платформа не входит в объём фичи' if excluded else '', version=1)
            feature = {'id': uuid.uuid4().hex, 'title': title, 'description': description, 'items': items, 'history': [{'actor': user['name'], 'at': now(), 'text': 'Создана фича'}]}
            db.execute('INSERT INTO features VALUES(?,?,?,?)', (feature['id'], user['team'], json.dumps(feature, ensure_ascii=False), time.time()))
        return self.workspace(user)

    def update(self, user, body):
        status = body.get('status')
        comment = text(body.get('comment', ''), 2000)
        if status not in STATUSES or (status == 'N/A' and not comment):
            raise Problem(400, 'Для N/A нужна причина; статус должен быть из списка')
        feature_id = text(body.get('feature'), 100, True)
        item_id = text(body.get('item'), 150, True)
        if type(body.get('version')) is not int:
            raise Problem(400, 'Нужна версия пункта')
        with self.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT body FROM features WHERE id=? AND team=?', (feature_id, user['team'])).fetchone()
            if not row:
                raise Problem(404, 'Фича не найдена')
            feature = json.loads(row['body'])
            item = next((i for i in feature['items'] if i['id'] == item_id), None)
            if not item:
                raise Problem(404, 'Пункт не найден')
            if item['version'] != body['version']:
                raise Problem(409, 'Пункт уже изменён коллегой. Загружена актуальная версия; проверь её и повтори изменение.')
            before = item['status']
            item.update(status=status, comment=comment, version=item['version'] + 1)
            feature['history'].insert(0, {'actor': user['name'], 'at': now(), 'text': f'{item_id}: {before} → {status}', 'before': before, 'after': status, 'comment': comment})
            db.execute('UPDATE features SET body=? WHERE id=? AND team=?', (json.dumps(feature, ensure_ascii=False), feature_id, user['team']))
        return self.workspace(user)

    def logout(self, token):
        with self.db() as db:
            db.execute('DELETE FROM sessions WHERE digest=?', (hashlib.sha256(token.encode()).hexdigest(),))
        return {'ok': True}


class Handler(BaseHTTPRequestHandler):
    server_version = 'Featureflow'

    def log_message(self, *_args):
        pass  # Do not log tokens, bodies, names or feature content.

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def dispatch(self):
        try:
            if self.path == '/health' and self.command == 'GET':
                result = {'ok': True}
            else:
                body = {}
                if self.command == 'POST':
                    self.connection.settimeout(10)
                    try:
                        length = int(self.headers.get('Content-Length', '0'))
                    except ValueError:
                        raise Problem(400, 'Неверная длина запроса')
                    if length < 1 or length > 32768:
                        raise Problem(413, 'Недопустимый размер запроса')
                    if self.headers.get_content_type() != 'application/json':
                        raise Problem(415, 'Нужен application/json')
                    body = json.loads(self.rfile.read(length))
                    if not isinstance(body, dict):
                        raise Problem(400, 'Нужен JSON-объект')
                store = self.server.store
                if self.path == '/login' and self.command == 'POST':
                    result = store.login(body, self.client_address[0])
                else:
                    auth = self.headers.get('Authorization', '')
                    token = auth[7:] if auth.startswith('Bearer ') else ''
                    user = store.user(token)
                    routes = {('GET', '/workspace'): lambda: store.workspace(user), ('POST', '/features'): lambda: store.create(user, body), ('POST', '/items'): lambda: store.update(user, body), ('POST', '/logout'): lambda: store.logout(token)}
                    route = routes.get((self.command, self.path))
                    if not route:
                        raise Problem(404, 'Маршрут не найден')
                    result = route()
            self.respond(200, result)
        except Problem as e:
            self.respond(e.status, {'error': e.message})
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.respond(400, {'error': 'Некорректный JSON'})
        except (TimeoutError, ConnectionError):
            self.close_connection = True
        except Exception:
            self.respond(500, {'error': 'Ошибка сервера'})

    def respond(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)


def main():
    if os.name != 'nt':
        os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', required=True, help='Absolute SQLite path outside public repository')
    sub = parser.add_subparsers(dest='command', required=True)
    serve = sub.add_parser('serve'); serve.add_argument('--host', default='127.0.0.1'); serve.add_argument('--port', default=21003, type=int)
    provision = sub.add_parser('user'); provision.add_argument('--login', required=True); provision.add_argument('--team', required=True); provision.add_argument('--name', required=True)
    template = sub.add_parser('template'); template.add_argument('--team', required=True); template.add_argument('--file', required=True)
    args = parser.parse_args()
    path = Path(args.db).expanduser().resolve()
    if Path(__file__).resolve().parents[1] in path.parents:
        parser.error('Базу нужно хранить за пределами публичного репозитория')
    path.parent.mkdir(parents=True, exist_ok=True)
    store = Store(path)
    if args.command == 'user':
        password = getpass.getpass('Новый пароль (12+ символов): ')
        if password != getpass.getpass('Повтори пароль: '):
            parser.error('Пароли не совпадают')
        store.provision(args.login, password, args.team, args.name)
        print('Пользователь создан; пароль не сохранён в открытом виде.')
    elif args.command == 'template':
        store.template(args.team, json.loads(Path(args.file).read_text(encoding='utf-8-sig')))
        print('Шаблон загружен. Существующие фичи не изменены.')
    else:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
        server.store = store
        print(f'Featureflow listening on {args.host}:{args.port}. Use an HTTPS reverse proxy for team access.')
        server.serve_forever()


if __name__ == '__main__':
    main()
