#!/usr/bin/env python3
"""Back up and replace local DSH controllers without restarting services."""
from datetime import datetime
import os
from pathlib import Path
import shutil
import tempfile


def main():
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
    backup = root / 'backups' / ('dsh-sre-install-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f'))
    backup.mkdir(mode=0o700, parents=True)
    for target in copies.keys() | links.keys():
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
    print(f'Installed controllers from {source}')
    print(f'Backup: {backup}')


if __name__ == '__main__':
    main()
