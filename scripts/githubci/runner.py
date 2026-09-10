"""Local execution of the explicitly supported ci.yml subset; fail closed on drift.

This is not a GitHub service emulator. Shell checks are taken from the workflow;
setup actions are fulfilled by the image. See docs/LOCAL-CI.md for boundaries.
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import yaml

from image_setup import ROOT, call, output, workflow, expand, classify, substitute, provision


def run_job(name):
    wf = workflow('/work/.github/workflows/ci.yml')
    _, job, matrix = next(item for item in expand(wf) if item[0] == name)
    results = []
    deadline = time.monotonic() + job['timeout-minutes'] * 60
    failed = False
    Path('/job-results').mkdir(exist_ok=True)
    for index, step in enumerate(job['steps']):
        title = step.get('name', step.get('uses', step.get('run', '').split('\n')[0]))
        kind = classify(step)
        code = 0
        start = time.monotonic()
        if kind == 'RUN':
            command = substitute(step['run'], matrix)
            if command.strip() == 'pnpm install --frozen-lockfile':
                # Re-run lifecycle hooks and frozen-lock validation, with no registry access.
                command += ' --offline'
            print(f'[{name}] RUN {title}', flush=True)
            env = dict(os.environ, **{k: str(v) for k, v in step.get('env', {}).items()})
            env['GITHUB_OUTPUT'] = f'/tmp/githubci-output-{index}'
            env['GITHUB_STEP_SUMMARY'] = '/tmp/githubci-step-summary'
            try:
                process = subprocess.Popen(['bash', '-euo', 'pipefail', '-c', command],
                                           cwd='/work', env=env, start_new_session=True)
                code = process.wait(timeout=max(1, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                code = 124
            status = 'PASS' if code == 0 else 'FAIL'
            failed |= code != 0
        else:
            status = kind
        results.append(dict(step=title, status=status, exit_code=code,
                            seconds=round(time.monotonic() - start, 1)))
        print(f'[{name}] {status}: {title}', flush=True)
        (Path('/job-results') / 'steps.json').write_text(json.dumps(results, indent=2))
        if time.monotonic() >= deadline:
            for rest in job['steps'][index + 1:]:
                results.append(dict(step=rest.get('name', rest.get('run', rest.get('uses'))),
                                    status='NOT-RUN (timeout)'))
            (Path('/job-results') / 'steps.json').write_text(json.dumps(results, indent=2))
            failed = True
            break
    return int(failed)


def preflight(source):
    # Raw bytes matter for locks; line endings are normalized for Windows checkouts.
    def normalized(path):
        return path.read_bytes().replace(b'\r\n', b'\n')
    for name in ('runner.py', 'test_runner.py', 'image_setup.py'):
        if normalized(source / 'scripts/githubci' / name) != normalized(ROOT / name):
            raise ValueError(f'{name} changed: rebuild githubci')
    if normalized(source / '.github/workflows/ci.yml') != normalized(ROOT / 'ci.yml'):
        raise ValueError('CI workflow changed: rebuild with docker compose --profile githubci build githubci')
    if normalized(source / 'packages/engine/test/fixtures/raw-real-corpus.json') != normalized(ROOT / 'raw-real-corpus.json'):
        raise ValueError('RAW manifest changed: rebuild githubci')
    hashes = json.loads((ROOT / 'inputs.json').read_text())
    manifests = {str(p.relative_to(source)) for kind in ('apps', 'packages')
                 for p in (source / kind).glob('*/package.json')}
    if manifests != {p for p in hashes if '/' in p}:
        raise ValueError('Workspace package list changed: update Dockerfile.githubci and rebuild')
    for name, expected in hashes.items():
        if hashlib.sha256(normalized(source / name)).hexdigest() != expected:
            raise ValueError(f'{name} changed: rebuild githubci before running tests')
    return expand(workflow(source / '.github/workflows/ci.yml'))


def orchestrate(source=Path('/workspace'), reports=Path('/reports')):
    report = reports / (time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
    report.mkdir(parents=True)
    results = []
    cancelled = threading.Event()
    def cancel(signum, frame):
        cancelled.set()
        print('\nCancellation requested; stopping owned job containers and writing summary.', flush=True)
    signal.signal(signal.SIGINT, cancel)
    signal.signal(signal.SIGTERM, cancel)
    try:
        jobs = preflight(source)
        if not jobs:
            raise ValueError('No CI jobs found')
        image = os.environ.get('GITHUBCI_IMAGE', 'ctimg-githubci:local')
        image = output(['docker', 'image', 'inspect', '--format={{.Id}}', image])
        parallel = int(os.environ.get('GITHUBCI_PARALLEL', '2'))
        if not 1 <= parallel <= 8:
            raise ValueError('GITHUBCI_PARALLEL must be between 1 and 8')
        resources = json.loads(output(['docker', 'info', '--format={{json .}}']))
        memory = os.environ.get('GITHUBCI_MEMORY', '3g')
        match = re.fullmatch(r'(\d+)([gm])', memory.lower())
        if not match:
            raise ValueError('GITHUBCI_MEMORY must use integer g or m units, e.g. 3g')
        budget = int(match[1]) * (1024 ** (3 if match[2] == 'g' else 2))
        cpus = float(os.environ.get('GITHUBCI_CPUS', '2'))
        if not 0 < cpus <= resources['NCPU']:
            raise ValueError('GITHUBCI_CPUS exceeds Docker Desktop CPU allocation')
        capacity = min(int(resources['NCPU'] / cpus),
                       int((resources['MemTotal'] - 512 * 1024**2) / budget))
        if capacity < 1:
            raise ValueError('Insufficient Docker memory: increase Docker Desktop RAM or lower GITHUBCI_MEMORY')
        if parallel > capacity:
            print(f'Reducing concurrency from {parallel} to {capacity} for Docker CPU/RAM allocation.', flush=True)
            parallel = capacity
        base = os.environ.get('GITHUBCI_BASE', 'HEAD^')
        git = ['git', '-c', 'safe.directory=/workspace', '-C', str(source)]
        changed = output(git + ['diff', '--name-only', base, '--'])
        untracked = output(git + ['ls-files', '--others', '--exclude-standard'])
        changed = '\n'.join(filter(None, [changed, untracked])) or '__no_changes__'
        body = output(git + ['log', '-1', '--format=%B'])
        with tempfile.TemporaryDirectory(prefix='githubci-') as temporary:
            snapshot = Path(temporary) / 'source'
            snapshot.mkdir()
            files = subprocess.check_output(git + ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
            # Only source files, including uncommitted edits. Never host caches/secrets.
            excluded = {'.git', 'node_modules', '.cache', '.turbo', '.svelte-kit', 'dist',
                        'build', 'coverage', 'test-results', 'playwright-report', '.lighthouseci', '.lvgl', '.generated'}
            names = []
            for raw in files.split(b'\0'):
                if not raw:
                    continue
                name = raw.decode()
                p = Path(name)
                if (excluded.intersection(p.parts) or
                        (p.name.startswith('.env') and p.name != '.env.example') or
                        not (source / p).is_file()):
                    continue
                names.append(name)
            listing = Path(temporary) / 'files'
            listing.write_bytes(b'\0'.join(n.encode() for n in sorted(set(names))) + b'\0')
            call(['rsync', '-r', '--from0', '--files-from=' + str(listing), str(source) + '/', str(snapshot)])
            # Lefthook's install lifecycle requires repository metadata. A fresh
            # empty repository is enough; never copy the host's Git object store.
            call(['git', '-c', 'init.defaultBranch=local-ci', 'init', str(snapshot)], stdout=subprocess.DEVNULL)
            # Normalize text shell/Python/YAML files copied from a Windows checkout.
            for name in names:
                path = snapshot / name
                if path.suffix in ('.sh', '.py', '.yml', '.yaml'):
                    path.write_bytes(path.read_bytes().replace(b'\r\n', b'\n'))
            print(f'Running {len(jobs)} jobs; concurrency={parallel}. Logs: {report}', flush=True)

            def execute(item):
                name, job, _ = item
                if cancelled.is_set():
                    return dict(job=name, status='NOT-RUN', error='Cancelled')
                container = 'githubci-' + uuid.uuid4().hex[:10] + '-' + name
                folder = report / name
                folder.mkdir()
                start = time.monotonic()
                code = 1
                error = None
                try:
                    args = ['docker', 'create', '--name', container, '--init', '--shm-size=1g',
                            '--memory', memory,
                            '--cpus', os.environ.get('GITHUBCI_CPUS', '2'),
                            '-e', 'PLAN_SYNC_CHANGED_FILES=' + changed,
                            '-e', 'PLAN_SYNC_COMMIT_BODY=' + body]
                    if name == 'docker-validate':
                        args += ['-v', '/var/run/docker.sock:/var/run/docker.sock',
                                 '-e', 'GITHUBCI_RUN_ID=' + container]
                    args += ['--entrypoint', 'python3', image, '/opt/githubci/runner.py', '--job', name]
                    call(args, stdout=subprocess.DEVNULL)
                    call(['docker', 'cp', str(snapshot) + '/.', container + ':/work'])
                    print(f'[{name}] START', flush=True)
                    with (folder / 'output.log').open('w') as log:
                        process = subprocess.Popen(['docker', 'start', '-a', container], stdout=log, stderr=subprocess.STDOUT)
                        deadline = time.monotonic() + job['timeout-minutes'] * 60 + 120
                        while process.poll() is None:
                            if cancelled.is_set():
                                subprocess.run(['docker', 'stop', '-t', '5', container], stdout=subprocess.DEVNULL)
                            try:
                                process.wait(timeout=30)
                            except subprocess.TimeoutExpired:
                                if time.monotonic() >= deadline:
                                    call(['docker', 'kill', container], stdout=subprocess.DEVNULL)
                                    process.wait(timeout=30)
                                else:
                                    print(f'[{name}] running ({round(time.monotonic() - start)}s); log: {folder.name}/output.log', flush=True)
                        state = json.loads(output(['docker', 'inspect', '--format={{json .State}}', container]))
                        code = state['ExitCode']
                        if state.get('OOMKilled'):
                            error = 'Out of memory: increase Docker Desktop RAM or lower concurrency'
                    for artifact in ['/job-results/.', '/work/playwright-report', '/work/test-results', '/work/.lighthouseci']:
                        subprocess.run(['docker', 'cp', container + ':' + artifact, str(folder)],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception as exc:
                    error = str(exc)
                finally:
                    subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    # Only resources owned by this job, including on timeout.
                    if name == 'docker-validate':
                        subprocess.run(['docker', 'rm', '-f', container + '-web', container + '-compose-web'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        subprocess.run(['docker', 'network', 'rm', container + '-network'],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        subprocess.run(['docker', 'image', 'rm', 'ctimg-web:' + container],
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                result = dict(job=name, status='PASS' if code == 0 and not error else 'FAIL',
                              exit_code=code, seconds=round(time.monotonic() - start, 1), error=error)
                print(f'[{name}] {result["status"]} ({result["seconds"]}s)', flush=True)
                return result

            # Keep timing-sensitive Lighthouse and benchmarks free of competing CI jobs.
            # browser-e2e declares needs on every other CI job, so run it after all
            # preceding jobs have finished and their containers have been removed.
            parallel_jobs = [j for j in jobs if j[0] != 'verify' and
                             not j[0].startswith('lighthouse-') and j[0] != 'browser-e2e']
            deferred_jobs = [j for j in jobs if j[0] == 'browser-e2e']
            serial_jobs = [j for j in jobs if j not in parallel_jobs and j not in deferred_jobs]
            with concurrent.futures.ThreadPoolExecutor(max_workers=parallel) as pool:
                results.extend(pool.map(execute, parallel_jobs))
            for job in serial_jobs:
                results.append(execute(job))
            for job in deferred_jobs:
                results.append(execute(job))
    except Exception as exc:
        results.append(dict(job='preflight', status='FAIL', error=str(exc)))
    finally:
        (report / 'summary.json').write_text(json.dumps(results, indent=2))
        lines = ['# Local CI summary', '', '| Job | Result | Seconds |', '| --- | --- | --- |']
        print('\nLOCAL CI SUMMARY', flush=True)
        for row in results:
            print(f'{row["status"]:4} {row["job"]} {row.get("error") or ""}', flush=True)
            lines.append(f'| {row["job"]} | {row["status"]} | {row.get("seconds", "-")} |')
            if row.get('error'):
                lines.append('\n' + row['error'] + '\n')
        for row in results:
            steps_file = report / row['job'] / 'steps.json'
            if not steps_file.exists():
                continue
            lines += ['', '## ' + row['job'], '', '| Check | Result |', '| --- | --- |']
            for step in json.loads(steps_file.read_text()):
                title = step['step'].replace('|', '\\|').replace('\n', ' ')
                lines.append(f'| {title} | {step["status"]} |')
                if step['status'].startswith(('FAIL', 'NOT-RUN')):
                    print(f'  {row["job"]}: {step["status"]} — {step["step"]}', flush=True)
        lines += ['', 'GitHub PR comments, API permissions, branch protection and hosted-runner behaviour are not emulated.',
                  'See per-job output.log and steps.json for every check (including PREBAKED/HOSTED-ONLY steps).']
        (report / 'summary.md').write_text('\n'.join(lines) + '\n')
        print(f'Reports: .cache/githubci/{report.name}', flush=True)
    return int(not results or any(row['status'] != 'PASS' for row in results))


if __name__ == '__main__':
    if sys.argv[1:] == ['--provision']:
        provision()
    elif sys.argv[1:2] == ['--job']:
        sys.exit(run_job(sys.argv[2]))
    elif sys.argv[1:] == ['test']:
        sys.exit(orchestrate())
    elif sys.argv[1:] == ['list']:
        for name, _, _ in preflight(Path('/workspace')):
            print(name)
    else:
        sys.exit('Usage: docker compose --profile githubci run --rm githubci {test|list}')
