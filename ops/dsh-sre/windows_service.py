"""Own native Windows processes and logs for the shared DSH service commands."""
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time


ROOT = Path.home() / '.dsh'
CONFIG = ROOT / 'services/windows-config.json'


def configuration():
    return json.loads(CONFIG.read_text(encoding='utf-8-sig'))


def blog_available():
    if not CONFIG.is_file():
        return False
    repository = Path(configuration()['repository'])
    return all((repository / path).is_file() for path in (
        'sites/personal-blog/dist/index.html',
        'sites/personal-blog/node_modules/vite/bin/vite.js',
    ))


def inspect_process(pid):
    if type(pid) is not int or pid <= 0:
        return None
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetProcessTimes.argtypes = [wintypes.HANDLE, *([ctypes.POINTER(wintypes.FILETIME)] * 4)]
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    handle = kernel.OpenProcess(0x1000 | 0x100000, False, pid)
    if not handle:
        error = ctypes.get_last_error()
        if error in (5, 87):  # An inaccessible or absent PID cannot be our managed process.
            return None
        raise ctypes.WinError(error)
    try:
        if kernel.WaitForSingleObject(handle, 0) == 0:
            return None
        size = wintypes.DWORD(32768)
        image = ctypes.create_unicode_buffer(size.value)
        times = [wintypes.FILETIME() for _ in range(4)]
        if not kernel.QueryFullProcessImageNameW(handle, 0, image, ctypes.byref(size)) or not kernel.GetProcessTimes(handle, *map(ctypes.byref, times)):
            raise ctypes.WinError(ctypes.get_last_error())
        query = ctypes.WinDLL('ntdll').NtQueryInformationProcess
        query.argtypes = [wintypes.HANDLE, wintypes.ULONG, ctypes.c_void_p, wintypes.ULONG, ctypes.POINTER(wintypes.ULONG)]
        query.restype = wintypes.LONG
        length = wintypes.ULONG()
        # ProcessCommandLineInformation is available on the Windows versions supported by Node 24.
        query(handle, 60, None, 0, ctypes.byref(length))
        if not length.value:
            raise OSError(f'Cannot read command line for process {pid}.')
        buffer = ctypes.create_string_buffer(length.value)
        if query(handle, 60, buffer, length, ctypes.byref(length)) < 0:
            raise OSError(f'Cannot read command line for process {pid}.')
        class UnicodeString(ctypes.Structure):
            _fields_ = [('length', wintypes.USHORT), ('maximum', wintypes.USHORT), ('buffer', ctypes.c_void_p)]
        text = UnicodeString.from_buffer(buffer)
        command_line = ctypes.wstring_at(text.buffer, text.length // 2)
        return {'pid': pid, 'executable': image.value, 'commandLine': command_line,
                'created': (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime}
    finally:
        kernel.CloseHandle(handle)


def command_arguments(command_line):
    shell = ctypes.WinDLL('shell32', use_last_error=True)
    shell.CommandLineToArgvW.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
    shell.CommandLineToArgvW.restype = ctypes.POINTER(wintypes.LPWSTR)
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    count = ctypes.c_int()
    arguments = shell.CommandLineToArgvW(command_line, ctypes.byref(count))
    if not arguments:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return [arguments[i] for i in range(count.value)]
    finally:
        kernel.LocalFree(arguments)


def launch_arguments(profile, port, config):
    repository = Path(config['repository'])
    if profile == 'blog':
        entry = repository / 'sites/personal-blog/node_modules/vite/bin/vite.js'
        args = [str(entry), 'dist', '--host', '127.0.0.1', '--port', str(port), '--strictPort']
        directory = repository / 'sites/personal-blog'
    else:
        entry = Path(config['dshCli'])
        args = [str(entry), '--profile', profile, '--host', '127.0.0.1', '--port', str(port), '--no-open']
        directory = repository
    return [config['node'], *args], directory


def managed_process(profile, port):
    record_path = ROOT / 'services' / f'windows-{profile}.json'
    if not record_path.is_file():
        return None
    record = json.loads(record_path.read_text(encoding='utf-8-sig'))
    if record.get('profile') != profile or record.get('port') != port:
        raise ValueError(f'Invalid process record: {record_path}')
    process = inspect_process(record.get('pid'))
    if not process:
        return None
    args, _ = launch_arguments(profile, port, configuration())
    executable = process.get('executable')
    command_line = process.get('commandLine')
    if not executable or not command_line:
        return None
    if Path(executable).resolve() != Path(args[0]).resolve():
        return None
    actual = command_arguments(command_line)
    if len(actual) != len(args) or Path(actual[1]).resolve() != Path(args[1]).resolve() or actual[2:] != args[2:]:
        return None
    # A PID may be reused even by the same command after the managed process exits.
    if record.get('created') and record['created'] != process['created']:
        return None
    return process


def status(profile, port):
    process = managed_process(profile, port)
    log = ROOT / 'logs' / f'windows-{profile}.log'
    url = None
    if process:
        if profile == 'blog':
            url = f'http://127.0.0.1:{port}/'
        elif log.is_file():
            with log.open('rb') as stream:
                stream.seek(0, 2)
                stream.seek(max(0, stream.tell() - 1024 * 1024))
                content = stream.read().decode('utf-8', errors='replace')
            urls = re.findall(r'http://127\.0\.0\.1:' + str(port) + r'/\?token=[A-Za-z0-9_-]+', content)
            url = urls[-1] if urls else None
    return {
        'pids': [process['pid']] if process else [],
        'state': 'unhealthy' if process else 'stopped',
        'httpReady': False,
        'url': url,
        'log': str(log),
        'errors': [],
    }


def stop(profile, port):
    (ROOT / 'services').mkdir(parents=True, exist_ok=True)
    (ROOT / 'services' / f'{profile}.stopped').touch()
    process = managed_process(profile, port)
    if process:
        subprocess.run(['taskkill.exe', '/PID', str(process['pid']), '/T', '/F'],
                       capture_output=True, text=True, errors='replace', check=True,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    (ROOT / 'services' / f'windows-{profile}.json').unlink(missing_ok=True)


def start(profile, port, restart=False):
    if restart:
        stop(profile, port)
    (ROOT / 'services').mkdir(parents=True, exist_ok=True)
    (ROOT / 'services' / f'{profile}.stopped').unlink(missing_ok=True)
    if managed_process(profile, port):
        return
    if profile != 'blog' and not (ROOT / 'profiles' / profile / 'package.json').is_file():
        raise FileNotFoundError(f'Profile {profile} is not installed; install its published package before starting it.')
    config = configuration()
    args, directory = launch_arguments(profile, port, config)
    for path in (Path(args[0]), Path(args[1]), directory):
        if not path.exists():
            raise FileNotFoundError(f'{path} is missing; rerun ops/dsh-sre/install.py with the installed Node and DSH CLI.')
    with socket.socket() as probe:
        probe.settimeout(1)
        # A bind probe also rejects TIME_WAIT connections after a Windows restart.
        if probe.connect_ex(('127.0.0.1', port)) == 0:
            raise OSError(f'Port {port} is already accepting connections; stop its owner before starting {profile}.')
    logs = ROOT / 'logs'
    logs.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, DSH_HOME=str(ROOT))
    env['PATH'] = str(Path(config['node']).parent) + os.pathsep + env.get('PATH', '')
    env['NO_PROXY'] = ','.join(filter(None, [env.get('NO_PROXY'), '127.0.0.1,localhost,::1']))
    if env.get('HTTP_PROXY') and env.get('ALL_PROXY', '').lower().startswith('socks'):
        env['ALL_PROXY'] = env['HTTP_PROXY']
    with (logs / f'windows-{profile}.log').open('wb') as stdout, (logs / f'windows-{profile}.error.log').open('wb') as stderr:
        child = subprocess.Popen(args, cwd=directory, env=env, stdin=subprocess.DEVNULL,
                                 stdout=stdout, stderr=stderr, close_fds=True,
                                 creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)
    try:
        process = inspect_process(child.pid)
        if not process:
            raise RuntimeError(f'{profile} exited during startup; inspect {logs / f"windows-{profile}.error.log"}.')
        record = dict(process, profile=profile, port=port)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=ROOT / 'services', delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(record, stream)
        try:
            temporary.replace(ROOT / 'services' / f'windows-{profile}.json')
        finally:
            temporary.unlink(missing_ok=True)
    except BaseException:
        # Do not leave an untracked service if querying or saving its identity fails.
        if child.poll() is None:
            child.terminate()
        child.wait(timeout=10)
        raise


def follow_logs(profile):
    path = ROOT / 'logs' / f'windows-{profile}.log'
    with path.open(encoding='utf-8', errors='replace') as stream:
        print(''.join(stream.readlines()[-80:]), end='', flush=True)
        while True:
            text = stream.read()
            if text:
                print(text, end='', flush=True)
            elif path.stat().st_size < stream.tell():
                stream.seek(0)
            time.sleep(0.5)
