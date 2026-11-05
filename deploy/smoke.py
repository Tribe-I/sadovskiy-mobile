"""Read-only team access smoke: login, workspace, revoke session. No secrets printed."""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None  # Never forward credentials to a redirect destination.


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--credentials', required=True, help='Private credentials JSON outside repository')
    parser.add_argument('--base-url', default='https://tribe-i.ru/sadovskiy-mobile')
    args = parser.parse_args()
    base = args.base_url.rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        parser.error('Use an HTTPS API base URL without credentials, query or fragment')
    credentials_path = Path(args.credentials).resolve()
    if Path(__file__).resolve().parents[1] in credentials_path.parents:
        parser.error('Credentials must be outside the public repository')
    entries = json.loads(credentials_path.read_text(encoding='utf-8-sig'))
    if not isinstance(entries, list) or not entries:
        parser.error('Credentials list is empty')
    entry = entries[0]
    opener = urllib.request.build_opener(NoRedirect)

    def request(path, token=None, body=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None if body is None else json.dumps(body).encode()
        with opener.open(urllib.request.Request(base + path, data=data, headers=headers), timeout=15) as response:
            return json.load(response)

    if request('/health').get('ok') is not True:
        raise RuntimeError('Health check failed')
    try:
        request('/workspace')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError('Unexpected anonymous response') from None
    else:
        raise RuntimeError('Anonymous workspace access was allowed')
    token = request('/login', body={'login': entry['login'], 'password': entry['password']})['token']
    try:
        workspace = request('/workspace', token=token)
        if workspace.get('team') != entry['team'] or not isinstance(workspace.get('features'), list):
            raise RuntimeError('Workspace contract or team mismatch')
    finally:
        request('/logout', token=token, body={})
    try:
        request('/workspace', token=token)
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError('Unexpected revoked-session response') from None
    else:
        raise RuntimeError('Revoked session remained valid')
    print('PASS: HTTPS health, anonymous denial, login, team workspace and session revocation')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f'FAIL: HTTP {error.code}; response body omitted', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(f'FAIL: {type(error).__name__}; sensitive details omitted', file=sys.stderr)
        sys.exit(1)
