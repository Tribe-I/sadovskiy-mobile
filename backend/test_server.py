import concurrent.futures
import http.client
import json
import socket
import tempfile
import threading
import unittest
from pathlib import Path
from server import Store, Problem, Handler, TeamHTTPServer


class TeamApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'team.sqlite')
        for login, team in [('one', 'A'), ('two', 'B')]:
            self.store.provision(login, 'test-password-1234', team, login)
        self.user = self.store.user(self.store.login({'login': 'one', 'password': 'test-password-1234'}, 'local')['token'])
        self.other = {'team': 'B', 'name': 'two'}
        self.store.template('A', [{'id': '1', 'text': 'Задача', 'competence': 'QA', 'stage': 'Тест', 'required': 'Обязательно'}, {'id': '2', 'text': 'Android', 'competence': 'Android', 'stage': 'Тест', 'required': 'Обязательно', 'platform': 'Android'}])
        self.feature = self.store.create(self.user, {'title': 'Фича', 'platforms': []})['features'][0]
        self.update = {'feature': self.feature['id'], 'item': '1', 'status': 'Выполнено', 'comment': '', 'version': 1}

    def tearDown(self):
        self.temp.cleanup()

    def test_team_isolation(self):
        self.assertEqual(self.store.workspace(self.other)['features'], [])
        with self.assertRaises(Problem) as error:
            self.store.update(self.other, self.update)
        self.assertEqual(error.exception.status, 404)

    def test_conflicting_writes_are_atomic(self):
        def update(_):
            try:
                self.store.update(self.user, self.update)
                return 200
            except Problem as e:
                return e.status
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(update, range(2))), [200, 409])
        current = self.store.workspace(self.user)['features'][0]
        self.assertEqual(current['items'][0]['version'], 2)
        self.assertEqual(len(current['history']), 2)

    def test_na_requires_reason_and_platforms_are_excluded(self):
        self.assertEqual(self.feature['items'][1]['status'], 'N/A')
        self.assertTrue(self.feature['items'][1]['comment'])
        with self.assertRaises(Problem):
            self.store.update(self.user, {**self.update, 'status': 'N/A'})

    def test_session_revocation_and_password_storage(self):
        token = self.store.login({'login': 'one', 'password': 'test-password-1234'}, 'local')['token']
        with self.store.db() as db:
            self.assertNotIn(token, str([tuple(r) for r in db.execute('SELECT * FROM sessions')]))
            self.assertNotIn('test-password-1234', str([tuple(r) for r in db.execute('SELECT * FROM users')]))
        self.store.logout(token)
        with self.assertRaises(Problem):
            self.store.user(token)

    def test_login_rate_limit(self):
        for _ in range(12):
            with self.assertRaises(Problem):
                self.store.login({'login': 'missing', 'password': 'wrong'}, 'attacker')
        with self.assertRaises(Problem) as error:
            self.store.login({'login': 'missing', 'password': 'wrong'}, 'attacker')
        self.assertEqual(error.exception.status, 429)

    def test_http_contract_rejects_anonymous_and_malformed_requests(self):
        server = TeamHTTPServer(('127.0.0.1', 0), Handler)
        server.store = self.store
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            connection = http.client.HTTPConnection(*server.server_address)
            connection.request('GET', '/workspace')
            response = connection.getresponse()
            self.assertEqual(response.status, 401)
            self.assertEqual(response.getheader('Cache-Control'), 'no-store')
            response.read()
            connection.request('POST', '/login', '[]', {'Content-Type': 'application/json'})
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            response.read()
            connection.request('POST', '/login', json.dumps({'login': 'one', 'password': 'test-password-1234'}), {'Content-Type': 'application/json'})
            response = connection.getresponse()
            token = json.loads(response.read())['token']
            connection.request('GET', '/workspace', headers={'Authorization': 'Bearer ' + token})
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.read())['team'], 'A')
            connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_worker_limit_rejects_load_then_recovers(self):
        entered, release = threading.Event(), threading.Event()

        class SlowHandler(Handler):
            def do_GET(self):
                entered.set()
                release.wait(3)
                super().do_GET()

        server = TeamHTTPServer(('127.0.0.1', 0), SlowHandler, max_workers=1)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        first = http.client.HTTPConnection(*server.server_address, timeout=3)
        second = http.client.HTTPConnection(*server.server_address, timeout=3)
        try:
            first.request('GET', '/health')
            self.assertTrue(entered.wait(2))
            second.request('GET', '/health')
            overloaded = second.getresponse()
            self.assertEqual(overloaded.status, 503)
            self.assertEqual(overloaded.getheader('Retry-After'), '2')
            overloaded.read()
            release.set()
            response = first.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
        finally:
            release.set()
            first.close()
            second.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_slow_incomplete_headers_are_closed(self):
        class ShortTimeoutHandler(Handler):
            request_timeout = 0.1

        server = TeamHTTPServer(('127.0.0.1', 0), ShortTimeoutHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with socket.create_connection(server.server_address, timeout=2) as connection:
                connection.sendall(b'GET /health HTTP/1.1\r\nHost: localhost\r\n')
                self.assertEqual(connection.recv(1), b'')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
