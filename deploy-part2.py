#!/usr/bin/env python3
"""VoicePilot Vercel deploy — part 2: env vars, file upload, deployment.
Run after the project exists. Safe to re-run (env vars may duplicate on
re-run; Vercel keeps the latest value per key+target).
"""
import json, subprocess, hashlib, base64, os, sys, time, secrets, urllib.request

SITE = os.path.expanduser('~/workspace/voicepilot')
VERCEL = '/opt/hatch/bin/vercel'
PROJECT = 'voicepilot'
SKIP_DIRS = {'node_modules', '.next', '.git', '__pycache__'}
SKIP_FILES = {'.env', '.env.local', 'deploy-vercel.py', 'deploy-part2.py', 'tsconfig.tsbuildinfo',
             'package-lock.json'}  # package-lock exceeds the MCP arg-size limit; Vercel resolves deps itself
PAGES = {'/': 'VoicePilot', '/demo': 'SIMULATED', '/signin': 'Sign in'}


def call(tool, args, timeout=180):
    r = subprocess.run(
        [VERCEL, 'call-tool', '--name', tool,
         '--arguments-json', json.dumps(args)],
        capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        print(f'{tool} FAILED:\n{r.stderr[:800]}', flush=True)
        sys.exit(1)
    out = json.loads(r.stdout)
    try:
        inner_text = out["result"]["content"][0]["text"]
        inner = json.loads(inner_text)
        if isinstance(inner, dict) and "result" in inner:
            out = inner["result"]
    except (KeyError, TypeError, ValueError, IndexError):
        pass
    return out


for key, value in {
    'APP_ENCRYPTION_KEY': secrets.token_hex(32),
    'BRIDGE_SHARED_SECRET': secrets.token_hex(32),
    'NEXT_PUBLIC_BRAND_NAME': 'VoicePilot',
}.items():
    print(f'Setting env {key}...', flush=True)
    call('create_project_env', {
        'idOrName': PROJECT,
        'requestBody': {'key': key, 'value': value, 'target': ['production'], 'type': 'plain'},
    })
print('env done', flush=True)

file_refs = []
count = 0
for root, dirs, files in os.walk(SITE):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
    for f in sorted(files):
        if f in SKIP_FILES or f.endswith('.log'):
            continue
        full = os.path.join(root, f)
        rel = os.path.relpath(full, SITE)
        data = open(full, 'rb').read()
        sha1 = hashlib.sha1(data).hexdigest()
        call('upload_file', {
            'contentLength': len(data),
            'requestBody': base64.b64encode(data).decode(),
            'xVercelDigest': sha1,
        })
        file_refs.append({'file': rel, 'sha': sha1, 'size': len(data)})
        count += 1
        if count % 25 == 0:
            print(f'  {count} files...', flush=True)
print(f'{count} files uploaded', flush=True)

print('Creating deployment...', flush=True)
dep = call('create_deployment', {'requestBody': {
    'name': PROJECT,
    'target': 'production',
    'files': file_refs,
    'projectSettings': {'framework': 'nextjs'},
}}, timeout=300)
dep_id = dep.get('id') or dep.get('uid')
print('deployment id:', dep_id, flush=True)

url = None
for i in range(60):
    time.sleep(15)
    d = call('get_deployment', {'id': dep_id})
    txt = json.dumps(d)
    state = d.get('state') or d.get('status')
    if not state and '"READY"' in txt:
        state = 'READY'
    if i % 4 == 0:
        print(f'  state: {state}', flush=True)
    if state == 'READY':
        url = d.get('url')
        break
    if state in ('ERROR', 'CANCELED'):
        print('DEPLOYMENT FAILED:', txt[:800], flush=True)
        sys.exit(1)
else:
    print('Timed out waiting for READY', flush=True)
    sys.exit(1)

print('Disabling deployment protection...', flush=True)
call('update_project', {'idOrName': PROJECT, 'requestBody': {'ssoProtection': None}})
print('  protection off', flush=True)

base = f'https://{PROJECT}-raziaazeem285-26.vercel.app'
if url and url.startswith('http'):
    base = url.rstrip('/')
elif url:
    base = 'https://' + url
print('Base URL:', base, flush=True)
time.sleep(8)

fails = 0
for path, marker in PAGES.items():
    full = base + path
    try:
        req = urllib.request.Request(full, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8', 'replace')
            ok = resp.status == 200 and marker in body
            print(f"  {'OK ' if ok else 'FAIL'} {path} -> HTTP {resp.status}, marker {'found' if marker in body else 'MISSING'}", flush=True)
            if not ok:
                fails += 1
    except Exception as e:
        print(f'  FAIL {path} -> {e}', flush=True)
        fails += 1

print('RESULT:', 'DONE ' + base if not fails else f'{fails} FAILED')
sys.exit(1 if fails else 0)
