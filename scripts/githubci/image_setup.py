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

ROOT = Path('/opt/githubci')
INSTALL = 'Install pinned Arduino targets and libraries'
SETUP = {
    'pnpm/action-setup@v4', 'actions/setup-node@v4',
    'arduino/setup-arduino-cli@v2', 'actions/cache@v4',
}
BAKED_RUNS = {
    'pnpm exec playwright install --with-deps chromium firefox webkit',
}


def call(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def output(args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def workflow(path):
    return yaml.safe_load(Path(path).read_text(encoding='utf-8'))


def expand(wf):
    """Reject unsupported semantics rather than accidentally giving a green result."""
    if set(wf) - {'name', 'on', True, 'concurrency', 'permissions', 'jobs'}:
        raise ValueError('Unsupported workflow keys; update the local runner')
    result = []
    for key, job in wf['jobs'].items():
        if set(job) - {'name', 'runs-on', 'needs', 'timeout-minutes', 'steps', 'strategy'}:
            raise ValueError(f'{key}: unsupported job keys')
        if job['runs-on'] not in ('ubuntu-latest', 'ubuntu-24.04', 'self-hosted'):
            raise ValueError(f'{key}: unsupported OS {job["runs-on"]}')
        needs = job.get('needs', [])
        if isinstance(needs, str):
            needs = [needs]
        if (not isinstance(needs, list) or
                any(not isinstance(dependency, str) for dependency in needs)):
            raise ValueError(f'{key}: needs must be a job id or list of job ids')
        unknown = set(needs) - set(wf['jobs'])
        if unknown:
            raise ValueError(f'{key}: unknown job dependency {sorted(unknown)}')
        if key in needs:
            raise ValueError(f'{key}: job cannot depend on itself')
        strategy = job.get('strategy', {})
        if set(strategy) - {'fail-fast', 'matrix'}:
            raise ValueError(f'{key}: unsupported strategy')
        matrix = strategy.get('matrix', {'include': [{}]})
        if set(matrix) != {'include'}:
            raise ValueError(f'{key}: only explicit include matrices are supported')
        if not matrix['include']:
            raise ValueError(f'{key}: empty matrix would skip a required job')
        for row in matrix['include']:
            name = key + ('-' + row['group'] if row else '')
            for step in job['steps']:
                classify(step)
                substitute(step.get('run', ''), row)
            result.append((name, job, row))
    return result


def classify(step):
    if set(step) - {'name', 'id', 'uses', 'with', 'run', 'if', 'continue-on-error', 'env'}:
        raise ValueError(f'Unsupported step keys: {step}')
    action = step.get('uses')
    if action == 'actions/github-script@v7':
        # This exact action is informational only, not a test. No API writes locally.
        if step.get('name') != 'Record plan-sync exemption on the pull request':
            raise ValueError('Unsupported GitHub API action')
        return 'HOSTED-ONLY'
    if 'if' in step or 'continue-on-error' in step:
        raise ValueError(f'Unsupported conditional step: {step.get("name")}')
    options = step.get('with', {})
    if action == 'pnpm/action-setup@v4' and options != {'version': '9.15.5', 'run_install': False}:
        raise ValueError('pnpm setup differs from the prebuilt image')
    if action == 'actions/setup-node@v4' and options != {'node-version-file': '.nvmrc', 'cache': 'pnpm'}:
        raise ValueError('Node setup differs from the prebuilt image')
    if action == 'arduino/setup-arduino-cli@v2' and options != {'version': '1.2.2'}:
        raise ValueError('Arduino action options need a corresponding image update')
    if action == 'actions/cache@v4' and (set(options) != {'path', 'key'} or options['path'] != '.cache/raw-corpus'):
        raise ValueError('Unsupported cache configuration')
    if action == 'actions/checkout@v4':
        if set(options) - {'fetch-depth', 'repository', 'ref', 'path'}:
            raise ValueError('Unsupported checkout configuration')
        if 'repository' in options and (options['repository'] != 'lvgl/lvgl' or
                                        options.get('path') not in ('.lvgl/v8', '.lvgl/v9')):
            raise ValueError('Unsupported external checkout')
    for value in step.get('env', {}).values():
        if '${{' in str(value):
            raise ValueError('Unsupported environment expression')
    if action in SETUP or action == 'actions/checkout@v4':
        return 'PREBAKED'
    if action:
        raise ValueError(f'Unsupported action {action}; add a tested adapter')
    if step.get('name') == INSTALL or step.get('run', '').strip() in BAKED_RUNS:
        return 'PREBAKED'
    if 'run' not in step:
        raise ValueError('Step has neither a supported action nor run command')
    return 'RUN'


def substitute(command, matrix):
    for key, value in matrix.items():
        command = command.replace('${{ matrix.' + key + ' }}', str(value))
    if '${{' in command:
        raise ValueError(f'Unsupported expression: {command}')
    return command


def provision():
    wf = workflow(ROOT / 'ci.yml')
    expand(wf)
    if Path('/work/.nvmrc').read_text().strip() != output(['node', '-p', 'process.versions.node.split(".")[0]']):
        raise ValueError('Node image major version does not match .nvmrc')
    package_manager = json.loads(Path('/work/package.json').read_text())['packageManager']
    if package_manager != 'pnpm@' + output(['pnpm', '--version']):
        raise ValueError('Prebuilt pnpm version does not match packageManager')
    for job in wf['jobs'].values():
        for step in job['steps']:
            options = step.get('with', {})
            if step.get('uses') == 'actions/checkout@v4' and 'repository' in options:
                if not re.fullmatch(r'[0-9a-f]{40}', options['ref']):
                    raise ValueError('External checkouts must use a full commit SHA')
                target = Path('/work') / options['path']
                target.mkdir(parents=True, exist_ok=True)
                call(['git', 'init', str(target)])
                call(['git', '-C', str(target), 'fetch', '--depth=1',
                      'https://github.com/' + options['repository'] + '.git', options['ref']])
                call(['git', '-C', str(target), 'checkout', '--detach', 'FETCH_HEAD'])
                shutil.rmtree(target / '.git')
            if step.get('name') == INSTALL:
                call(['bash', '-euo', 'pipefail', '-c', step['run']])
    destination = Path('/work/.cache/raw-corpus')
    destination.mkdir(parents=True, exist_ok=True)
    for entry in json.loads((ROOT / 'raw-real-corpus.json').read_text())['files']:
        cache = Path('/opt/githubci-downloads/raw')
        cache.mkdir(parents=True, exist_ok=True)
        target = cache / entry['sha256']
        if not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != entry['sha256']:
            call(['curl', '-fsSL', '--retry', '3', '--max-time', '300', entry['url'], '-o', str(target)])
        if hashlib.sha256(target.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f'RAW corpus hash mismatch: {entry["filename"]}')
        shutil.copyfile(target, destination / entry['filename'])
        print('Cached RAW fixture: ' + entry['filename'], flush=True)
    inputs = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.nvmrc']
    inputs += [str(p.relative_to('/work')) for p in Path('/work').glob('apps/*/package.json')]
    inputs += [str(p.relative_to('/work')) for p in Path('/work').glob('packages/*/package.json')]
    hashes = {p: hashlib.sha256((Path('/work') / p).read_bytes().replace(b'\r\n', b'\n')).hexdigest() for p in inputs}
    (ROOT / 'inputs.json').write_text(json.dumps(hashes))


if __name__ == '__main__':
    provision()
