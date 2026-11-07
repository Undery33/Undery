#!/usr/bin/env python3
"""Run the built image with production constraints and check its public contract."""
import argparse
from html.parser import HTMLParser
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


def docker(*args):
    return subprocess.check_output(['docker', *args], text=True).strip()


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()
        self.links = set()
        self.robots = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ('img', 'script') and attrs.get('src'):
            self.urls.add(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet':
            self.urls.add(attrs['href'])
        if tag == 'a' and attrs.get('href'):
            self.links.add(attrs['href'])
        if tag == 'meta' and attrs.get('name') == 'robots':
            self.robots = attrs.get('content', '')


def verify(base, expected):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def read(path, method='GET'):
        request = urllib.request.Request(urllib.parse.urljoin(base+'/', path), method=method)
        try:
            with opener.open(request, timeout=10) as response:
                return response.status, response.headers, response.read()
        except urllib.error.HTTPError as response:
            return response.code, response.headers, response.read()

    for attempt in range(60):
        try:
            status, headers, body = read('/api/health')
            if status == 200:
                break
        except OSError:
            pass
        time.sleep(0.25)
    else:
        raise RuntimeError('Container did not become healthy')
    assert json.loads(body) == expected, 'Wrong source or infrastructure revision'
    assert headers.get('Cache-Control') == 'no-store'

    def html_page(path):
        status, headers, body = read(path)
        assert status == 200, path
        assert headers.get('X-Content-Type-Options') == 'nosniff', path
        assert 'text/html' in headers.get('Content-Type', ''), path
        html = body.decode()
        resources = Resources()
        resources.feed(html)
        return html, resources, headers

    verified_assets = set()

    def asset(resource):
        if resource in verified_assets:
            return
        parsed = urllib.parse.urlsplit(resource)
        assert not parsed.scheme and not parsed.netloc and parsed.path.startswith('/'), resource
        status, asset_headers, content = read(resource)
        assert status == 200 and content, resource
        assert not content.lstrip().lower().startswith((b'<!doctype html', b'<html')), resource
        if parsed.path.endswith('.png'):
            assert content.startswith(b'\x89PNG\r\n\x1a\n'), resource
        if parsed.path.endswith('.css'):
            assert 'text/css' in asset_headers.get('Content-Type', ''), resource
        if parsed.path.endswith('.js'):
            assert 'javascript' in asset_headers.get('Content-Type', ''), resource
        verified_assets.add(resource)

    def main_page(path, markers):
        html, resources, _ = html_page(path)
        assert 'START OVER' not in html and 'data-open="profile"' not in html, path
        assert 'lang="ko"' in html, path
        assert all(marker in html for marker in markers), path
        assert not any(urllib.parse.urlsplit(link).path.startswith('/portfolio')
                       for link in resources.links), 'Portfolio must remain outside public navigation'
        next_assets = {url for url in resources.urls if url.startswith('/_next/static/')}
        assert any(urllib.parse.urlsplit(url).path.endswith('.css') for url in next_assets), path
        assert any(urllib.parse.urlsplit(url).path.endswith('.js') for url in next_assets), path
        for resource in next_assets:
            asset(resource)
        print('PASS restored main page and Next.js assets: '+path)
        return html, resources

    _, home_resources = main_page('/', ('배우고, 즐기고,', '기록하는 공간.', '둘러보기'))
    assert {'/computer', '/vrchat', '/valorant'} <= home_resources.links
    main_page('/computer', ('<h1>Computer</h1>', '기술 글 검색', '기술 기록을 시작하며'))
    main_page('/computer/getting-started', ('<h1>기술 기록을 시작하며</h1>', '이 글은 예제입니다', '글 작성 방법'))
    main_page('/valorant', ('Valorant',))

    html, gui_resources, _ = html_page('/vrchat')
    assert 'START OVER' in html and 'data-open="profile"' in html
    assert '<dialog' in html and 'data-open="pictures"' in html and 'data-open="gallery"' in html
    assert '기록하는 공간.' not in html, 'VRChat must serve the separate GUI'
    assert len(gui_resources.urls) >= 6, 'Styles, script and all GUI images must be included'
    for resource in gui_resources.urls:
        assert resource.startswith('/vrchat/'), 'GUI assets must stay under /vrchat/: '+resource
        asset(resource)
    print('PASS isolated VRChat GUI, dialogs and prefixed assets')
    for path, location in (('/vrchat/', '/vrchat'),
                           ('/vrchat/?view=gallery&from=qa', '/vrchat?view=gallery&from=qa')):
        status, headers, _ = read(path)
        assert status == 308, path
        assert headers.get('Location') == location, 'Redirect must preserve the public origin and query'
    print('PASS relative VRChat redirects and preserved query parameters')
    search_status, _, search_body = read('/computer?q=PostgreSQL&tag=Markdown')
    assert search_status == 200 and '조건에 맞는 글이 없습니다' in search_body.decode()
    filtered_status, _, filtered_body = read('/computer?tag=Git')
    assert filtered_status == 200
    assert b'href="/computer/development-workflow"' in filtered_body
    assert b'href="/computer/getting-started"' not in filtered_body
    matched_status, _, matched_body = read('/computer?q=Markdown&tag=Markdown')
    assert matched_status == 200 and b'href="/computer/getting-started"' in matched_body
    escaped_status, _, escaped_body = read('/computer?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E')
    assert escaped_status == 200 and b'<script>alert(1)</script>' not in escaped_body
    print('PASS dynamic Computer search, tag filtering and escaped input')

    _, portfolio_resources, portfolio_headers = html_page('/portfolio')
    assert 'noindex' in portfolio_headers.get('X-Robots-Tag', '')
    assert 'noindex' in portfolio_resources.robots
    assert portfolio_headers.get('Set-Cookie') is None
    for path in ('/admin', '/admin/posts', '/admin/settings'):
        status, headers, content = read(path)
        assert status == 503, path
        assert 'no-store' in ','.join(headers.get_all('Cache-Control', [])), path
        assert 'noindex' in headers.get('X-Robots-Tag', ''), path
        assert not re.search(rb'<form\b', content, re.IGNORECASE), path
        assert read(path, method='POST')[0] == 405, path
    sitemap_status, _, sitemap_body = read('/sitemap.xml')
    assert sitemap_status == 200
    assert b'/portfolio' not in sitemap_body and b'/admin' not in sitemap_body
    assert read('/robots.txt')[0] == 200
    print('PASS direct portfolio noindex, unavailable admin and discovery exclusions')

    for path in ('/missing-page', '/computer/not-a-real-post', '/.env', '/.git/config',
                 '/styles.css', '/app.js', '/assets/avatar.png', '/vrchat/assets/missing.png',
                 '/vrchat/missing-page'):
        assert read(path)[0] == 404, path
    assert read('/', method='POST')[0] in (403, 405), 'Writes must be rejected'
    assert read('/', method='HEAD')[0] == 200
    print('PASS build identity, HTTP methods and real 404 responses')


def verify_readiness_failure(name, base):
    """Exercise failure handling only in the disposable image-test container."""
    find_next = r'''
const fs = require('node:fs');
const matches = fs.readdirSync('/proc').filter(name => /^[0-9]+$/.test(name)).filter(name => {
  try { return fs.readFileSync('/proc/' + name + '/cmdline', 'utf8').split('\0').includes('/opt/undery/main/server.js'); }
  catch { return false; }
});
if (matches.length !== 1) throw new Error('Expected exactly one supervised Next.js process');
process.stdout.write(matches[0]);
'''
    pid = docker('exec', name, '/usr/local/bin/node', '-e', find_next)
    assert pid.isdigit(), 'Invalid Next.js process identity'
    docker('exec', name, '/bin/sh', '-c', 'kill -STOP "$1"', 'signal-next', pid)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        try:
            with opener.open(base + '/api/health', timeout=10) as response:
                status = response.status
        except urllib.error.HTTPError as response:
            status = response.code
            response.close()
        assert status >= 500, 'Readiness must fail when Next.js stops responding'
    finally:
        docker('exec', name, '/bin/sh', '-c', 'kill -CONT "$1"; kill -TERM "$1"', 'signal-next', pid)
    for attempt in range(40):
        state = json.loads(docker('inspect', '--format', '{{json .State}}', name))
        if not state['Running']:
            assert state['ExitCode'] != 0, 'Unexpected child failure must fail the container'
            break
        time.sleep(0.25)
    else:
        raise AssertionError('Supervisor must stop Nginx after Next.js exits')
    print('PASS readiness dependency and supervised shutdown after Next.js failure')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    parser.add_argument('--metadata', type=Path, required=True)
    args = parser.parse_args()
    name = 'undery-test-'+uuid.uuid4().hex
    try:
        docker('run', '-d', '--name', name, '--read-only', '--user', '101:101',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,mode=1777', '--cap-drop=ALL',
               '--security-opt', 'no-new-privileges', '--pids-limit', '128',
               '--memory', '256m', '--cpus', '1', '-p', '127.0.0.1::8080', args.image)
        bindings = json.loads(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name))
        port = bindings['8080/tcp'][0]['HostPort']
        base = 'http://127.0.0.1:' + port
        verify(base, json.loads(args.metadata.read_text()))
        verify_readiness_failure(name, base)
    except BaseException:
        subprocess.run(['docker', 'logs', '--tail', '40', name], check=False)
        raise
    finally:
        subprocess.run(['docker', 'rm', '-f', name], check=False, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
