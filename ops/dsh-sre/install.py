#!/usr/bin/env python3
"""Back up and replace local DSH controllers without restarting services."""
from datetime import datetime
import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile
import sys


def windows_files(source, root, local_bin, args):
    node = args.node or shutil.which('node.exe')
    if not node:
        raise FileNotFoundError('Node.js is not on PATH; pass --node with its native Windows executable.')
    node = Path(node).resolve()
    candidates = [node.parent / 'node_modules/@deepseek-ai/dsh/lib/bin.js']
    shim = shutil.which('dsh.cmd')
    if shim:
        candidates.append(Path(shim).parent / 'node_modules/@deepseek-ai/dsh/lib/bin.js')
    cli = Path(args.dsh_cli).resolve() if args.dsh_cli else next((p for p in candidates if p.is_file()), None)
    repository = Path(args.repository).resolve() if args.repository else source.parents[1]
    if not node.is_file() or cli is None or not cli.is_file():
        raise FileNotFoundError('Installed DSH CLI not found; pass --dsh-cli with its lib/bin.js path.')
    if not (repository / 'sites/personal-blog').is_dir():
        raise FileNotFoundError(f'{repository} is not a dsh-creative checkout; pass --repository.')
    contents = {root / 'bin' / name: (source / name).read_bytes()
                for name in ('dsh-sre', 'dsh-service', 'windows_service.py')}
    config = {'node': str(node), 'dshCli': str(cli), 'repository': str(repository)}
    previous = root / 'services/windows-config.json'
    if previous.is_file():
        current = json.loads(previous.read_text(encoding='utf-8-sig'))
        if 'dailyProfiles' in current:
            config['dailyProfiles'] = current['dailyProfiles']
    contents[root / 'services/windows-config.json'] = (json.dumps(config, indent=2) + '\n').encode('utf-8')
    commands = {'dsh-sre': ('dsh-sre', ''), 'dsh-service': ('dsh-service', '')}
    for name, profile in [('webctl', 'web'), ('web', 'web'), ('student', 'student'),
                          ('superagent', 'superagent'), ('antfarm', 'antfarm'), ('media', 'media'),
                          ('story', 'story'), ('writer', 'writer'), ('blog', 'blog')]:
        commands['dsh-' + name] = ('dsh-service', profile + ' ')
    for name, (script, prefix) in commands.items():
        python = str(Path(sys.executable).resolve()).replace('%', '%%')
        target = str(root / 'bin' / script).replace('%', '%%')
        content = f'@echo off\r\n"{python}" -X utf8 "{target}" {prefix}%*\r\n@exit /b %errorlevel%\r\n'.encode('utf-8')
        for directory in (root / 'bin', local_bin):
            contents[directory / (name + '.cmd')] = content
    return contents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', help='Windows Node executable (default: node.exe on PATH)')
    parser.add_argument('--dsh-cli', help='Windows DSH lib/bin.js (default: installed global package)')
    parser.add_argument('--repository', help='Windows dsh-creative checkout (default: this checkout)')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    root = Path.home() / '.dsh'
    local_bin = Path.home() / '.local/bin'
    controllers = ['dsh-webctl', 'dsh-antfarm', 'dsh-media', 'dsh-student', 'dsh-superagent', 'dsh-writer', 'dsh-story', 'dsh-service']
    copies = {root / 'bin' / name: source / name for name in controllers}
    copies[local_bin / 'dsh-sre'] = source / 'dsh-sre'
    links = {local_bin / name: root / 'bin' / name for name in controllers}
    links[root / 'bin/dsh-sre'] = local_bin / 'dsh-sre'
    links[root / 'bin/dsh-web'] = root / 'bin/dsh-webctl'
    links[local_bin / 'dsh-web'] = root / 'bin/dsh-webctl'
    # Read all sources and preserve both symlinks and their targets before replacement.
    contents = {target: path.read_bytes() for target, path in copies.items()}
    retired = []
    if sys.platform == 'win32':
        contents = windows_files(source, root, local_bin, args)
        links = {}
        retired = [root / 'bin/dsh-windows.ps1']
    backup = root / 'backups' / ('dsh-sre-install-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(mode=0o700, parents=True)
    for target in contents.keys() | links.keys() | set(retired):
        if not (target.exists() or target.is_symlink()):
            continue
        saved = backup / target.relative_to(Path.home())
        saved.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, saved, follow_symlinks=False)
        if target.is_symlink() and target.is_file():
            shutil.copy2(target, saved.with_name(saved.name + '.target'))
    for target, content in contents.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
        try:
            temporary.chmod(0o755)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    for target, destination in links.items():
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f'.{target.name}.{os.getpid()}')
        try:
            temporary.symlink_to(destination)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    for target in retired:
        target.unlink(missing_ok=True)
    print(f'Installed controllers from {source}')
    print(f'Backup: {backup}')


if __name__ == '__main__':
    main()
