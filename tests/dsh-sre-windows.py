"""Exercise service ownership and installation without reaching daily profiles."""
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch


SOURCE = Path(__file__).resolve().parents[1] / 'ops/dsh-sre'
sys.dont_write_bytecode = True
sys.path.insert(0, str(SOURCE))
import windows_service as windows


def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class WindowsServices(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='dsh services ')
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.root = self.home / '.dsh'
        (self.root / 'services').mkdir(parents=True)
        (self.root / 'profiles/student').mkdir(parents=True)
        (self.root / 'profiles/student/package.json').write_text('{}')
        self.node = self.home / 'Node runtime/node.exe'
        self.cli = self.home / 'DSH package/lib/bin.js'
        self.repository = self.home / 'creative checkout'
        for path in (self.node, self.cli, self.repository / 'sites/personal-blog/dist/index.html',
                     self.repository / 'sites/personal-blog/node_modules/vite/bin/vite.js'):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.touch()
        self.config = {'node': str(self.node), 'dshCli': str(self.cli), 'repository': str(self.repository)}
        self.config_path = self.root / 'services/windows-config.json'
        self.config_path.write_text(json.dumps(self.config), encoding='utf-8')
        self.addCleanup(patch.stopall)
        patch.object(windows, 'ROOT', self.root).start()
        patch.object(windows, 'CONFIG', self.config_path).start()

    def record(self, created='launch-one'):
        args, _ = windows.launch_arguments('student', 3084, self.config)
        process = {'pid': 1234, 'executable': str(self.node),
                   'commandLine': subprocess.list2cmdline(args), 'created': 'launch-one'}
        record = dict(process, profile='student', port=3084, created=created)
        (self.root / 'services/windows-student.json').write_text(json.dumps(record), encoding='utf-8')
        return process, args

    def test_stale_log_does_not_supply_login_url(self):
        logs = self.root / 'logs'
        logs.mkdir()
        (logs / 'windows-student.log').write_text('http://127.0.0.1:3084/?token=old_token')
        with patch.object(windows, 'managed_process', return_value=None):
            self.assertIsNone(windows.status('student', 3084)['url'])

    def test_live_log_uses_latest_token(self):
        logs = self.root / 'logs'
        logs.mkdir()
        (logs / 'windows-student.log').write_text(
            'http://127.0.0.1:3084/?token=old\nhttp://127.0.0.1:3084/?token=current')
        with patch.object(windows, 'managed_process', return_value={'pid': 1234}):
            self.assertEqual(windows.status('student', 3084)['url'], 'http://127.0.0.1:3084/?token=current')

    def test_reused_pid_is_not_stopped(self):
        process, args = self.record(created='previous-launch')
        with patch.object(windows, 'inspect_process', return_value=process), \
             patch.object(windows, 'command_arguments', return_value=args), \
             patch('subprocess.run') as run:
            windows.stop('student', 3084)
            run.assert_not_called()
        self.assertTrue((self.root / 'services/student.stopped').is_file())

    def test_different_profile_is_not_managed(self):
        process, args = self.record()
        args[args.index('student')] = 'media'
        with patch.object(windows, 'inspect_process', return_value=process), \
             patch.object(windows, 'command_arguments', return_value=args):
            self.assertIsNone(windows.managed_process('student', 3084))

    @unittest.skipUnless(sys.platform == 'win32', 'Windows process query')
    def test_native_query_reads_own_process_identity(self):
        process = windows.inspect_process(os.getpid())
        self.assertEqual(process['pid'], os.getpid())
        self.assertEqual(Path(process['executable']).resolve(), Path(sys.executable).resolve())
        self.assertTrue(process['commandLine'])
        self.assertTrue(process['created'])

    @unittest.skipUnless(sys.platform == 'win32', 'Windows command-line parser')
    def test_legacy_record_with_quoted_paths_is_adopted(self):
        process, _ = self.record()
        record = self.root / 'services/windows-student.json'
        record.write_text(json.dumps({'pid': 1234, 'profile': 'student', 'port': 3084}), encoding='utf-8-sig')
        with patch.object(windows, 'inspect_process', return_value=process):
            self.assertEqual(windows.managed_process('student', 3084)['pid'], 1234)

    def test_start_is_idempotent(self):
        with patch.object(windows, 'managed_process', return_value={'pid': 1234}), patch('subprocess.Popen') as spawn:
            windows.start('student', 3084)
            spawn.assert_not_called()

    def test_missing_profile_is_not_created_by_start(self):
        with patch.object(windows, 'managed_process', return_value=None), patch('subprocess.Popen') as spawn:
            with self.assertRaisesRegex(FileNotFoundError, 'not installed'):
                windows.start('writer', 3086)
            spawn.assert_not_called()
        self.assertFalse((self.root / 'profiles/writer').exists())

    def test_busy_port_preserves_logs_and_does_not_launch(self):
        logs = self.root / 'logs'
        logs.mkdir()
        log = logs / 'windows-student.log'
        log.write_text('preserved')
        with patch.object(windows, 'managed_process', return_value=None), patch('socket.socket') as sock, \
             patch('subprocess.Popen') as spawn:
            sock.return_value.__enter__.return_value.connect_ex.return_value = 0
            with self.assertRaisesRegex(OSError, 'already accepting connections'):
                windows.start('student', 3084)
            spawn.assert_not_called()
        self.assertEqual(log.read_text(), 'preserved')

    @unittest.skipUnless(sys.platform == 'win32', 'Windows process creation flags')
    def test_launch_records_identity_and_passes_native_arguments(self):
        with patch.object(windows, 'managed_process', return_value=None), patch('socket.socket') as sock, \
             patch.object(windows, 'inspect_process', return_value={'pid': 1234, 'created': 'now'}), \
             patch('subprocess.Popen', return_value=SimpleNamespace(pid=1234)) as spawn:
            sock.return_value.__enter__.return_value.connect_ex.return_value = 10061
            windows.start('student', 3084)
            args, kwargs = spawn.call_args
            self.assertEqual(args[0][1], str(self.cli))
            self.assertEqual(kwargs['cwd'], self.repository)
            self.assertEqual(kwargs['env']['DSH_HOME'], str(self.root))
            self.assertTrue(kwargs['creationflags'] & subprocess.DETACHED_PROCESS)
        self.assertEqual(json.loads((self.root / 'services/windows-student.json').read_text())['created'], 'now')

    def service(self):
        import urllib.request
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with patch('sys.platform', 'win32'), patch('urllib.request.build_opener', return_value=opener):
            return load('service_test', SOURCE / 'dsh-service')

    def test_superagent_reports_pending_setup(self):
        service = self.service()
        from io import StringIO
        with patch.object(windows, 'status', return_value={'pids': [1], 'url': 'http://127.0.0.1:3082/?token=x',
                                                         'errors': [], 'log': 'test.log'}), \
             patch.object(service, 'reachable', return_value=True), patch.object(service.HTTP, 'open') as request:
            request.return_value.__enter__.return_value = StringIO(json.dumps({'setup': {'problem': {'detail': 'Missing source'}}}))
            details, code = service.health('superagent')
        self.assertEqual(code, 3)
        self.assertEqual(details['state'], 'setup-pending')
        self.assertTrue(details['httpReady'])

    def test_media_backend_failure_is_not_ready(self):
        service = self.service()
        with patch.object(windows, 'status', return_value={'pids': [1], 'url': 'http://127.0.0.1:3085/?token=x', 'errors': []}), \
             patch.object(service, 'reachable', return_value=True), \
             patch.object(service.HTTP, 'open', side_effect=OSError('backend unavailable')):
            details, code = service.health('media')
        self.assertEqual(code, 2)
        self.assertEqual(details['state'], 'unhealthy')

    def test_windows_sre_uses_python_controller_without_lsof(self):
        (self.root / 'profiles/web').mkdir()
        (self.root / 'profiles/web/package.json').write_text('{}')
        with patch('sys.platform', 'win32'), patch('pathlib.Path.home', return_value=self.home):
            sre = load('sre_test', SOURCE / 'dsh-sre')
        details = {'pids': [1], 'state': 'running', 'url': 'http://127.0.0.1:3080/?token=live', 'log': 'current.log'}
        (self.root / 'bin').mkdir()
        (self.root / 'bin/dsh-service').touch()
        with patch.object(sre, 'run', return_value=SimpleNamespace(stdout=json.dumps(details), stderr='', returncode=0)) as run:
            self.assertEqual(sre.show_status('web'), 0)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0], sys.executable)
        self.assertIn('blog', sre.SERVICES)

    def test_daily_group_excludes_on_demand_profiles_but_allows_explicit_start(self):
        (self.root / 'profiles/superagent').mkdir()
        (self.root / 'profiles/superagent/package.json').write_text('{}')
        self.config['dailyProfiles'] = ['student']
        self.config_path.write_text(json.dumps(self.config), encoding='utf-8')
        with patch('sys.platform', 'win32'), patch('pathlib.Path.home', return_value=self.home):
            sre = load('sre_daily_test', SOURCE / 'dsh-sre')
        self.assertNotIn('media', sre.SERVICES)
        for target, expected in [('all', 'student'), ('superagent', 'superagent')]:
            with patch.object(sys, 'argv', ['dsh-sre', 'start', target]), \
                 patch.object(sre.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run, \
                 patch.object(sre, 'show_status', return_value=0):
                self.assertEqual(sre.main(), 0)
                self.assertEqual(run.call_args.args[0][-2:], [expected, 'start'])
                self.assertEqual(run.call_count, 1)

    def test_daily_group_rejects_missing_profiles(self):
        self.config['dailyProfiles'] = ['missing']
        self.config_path.write_text(json.dumps(self.config), encoding='utf-8')
        with patch('sys.platform', 'win32'), patch('pathlib.Path.home', return_value=self.home):
            sre = load('sre_daily_invalid_test', SOURCE / 'dsh-sre')
        with self.assertRaisesRegex(ValueError, 'installed managed profiles'):
            sre.daily_profiles()

    def test_windows_installer_backs_up_and_retires_temporary_entry(self):
        installer = load('installer_test', SOURCE / 'install.py')
        self.config['dailyProfiles'] = ['student']
        self.config_path.write_text(json.dumps(self.config), encoding='utf-8')
        (self.root / 'bin').mkdir()
        legacy = self.root / 'bin/dsh-windows.ps1'
        legacy.write_text('old controller')
        old = self.home / '.local/bin/dsh-sre.cmd'
        old.parent.mkdir(parents=True)
        old.write_text('old launcher')
        with patch('sys.platform', 'win32'), patch('pathlib.Path.home', return_value=self.home), \
             patch('shutil.which', return_value=None), \
             patch.object(sys, 'argv', ['install.py', '--node', str(self.node), '--dsh-cli', str(self.cli), '--repository', str(self.repository)]):
            installer.main()
        self.assertFalse(legacy.exists())
        backups = list((self.root / 'backups').iterdir())
        self.assertEqual((backups[0] / '.dsh/bin/dsh-windows.ps1').read_text(), 'old controller')
        self.assertEqual((backups[0] / '.local/bin/dsh-sre.cmd').read_text(), 'old launcher')
        self.assertIn('student %*', (self.home / '.local/bin/dsh-student.cmd').read_text())
        self.assertIn('-X utf8', old.read_text())
        self.assertTrue((self.root / 'bin/windows_service.py').is_file())
        self.assertEqual(json.loads(self.config_path.read_text())['dailyProfiles'], ['student'])


class PosixDailyProfiles(unittest.TestCase):
    def test_daily_actions_and_explicit_on_demand_start(self):
        for platform in ('darwin', 'linux'):
            with self.subTest(platform=platform), tempfile.TemporaryDirectory() as directory:
                home = Path(directory)
                root = home / '.dsh'
                for name in ('web', 'student', 'superagent'):
                    profile = root / 'profiles' / name
                    profile.mkdir(parents=True)
                    (profile / 'package.json').write_text('{}')
                (root / 'services').mkdir()
                config = root / 'services/config.json'
                with patch('sys.platform', platform), patch('pathlib.Path.home', return_value=home):
                    sre = load('posix_sre_test', SOURCE / 'dsh-sre')
                self.assertIsNone(sre.daily_profiles())
                config.write_text(json.dumps({'dailyProfiles': ['web', 'student']}))
                for action, target, expected in [('start', 'all', ['web', 'student']),
                                                 ('restart', 'all', ['web', 'student']),
                                                 ('stop', 'all', ['web', 'student']),
                                                 ('status', None, ['web', 'student']),
                                                 ('start', 'superagent', ['superagent'])]:
                    argv = ['dsh-sre', action] + ([target] if target else [])
                    with patch.object(sys, 'argv', argv), \
                         patch.object(sre.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run, \
                         patch.object(sre, 'show_status', return_value=0) as status:
                        self.assertEqual(sre.main(), 0)
                        self.assertEqual([call.args[0] for call in status.call_args_list], expected)
                        self.assertEqual(run.call_count, 0 if action == 'status' else len(expected))
                        for call, name in zip(run.call_args_list, expected):
                            self.assertEqual(call.args[0], sre.controller_command(name, action))
                for invalid in ([], ['web', 'web'], ['media'], ['missing'], 'web', [None]):
                    config.write_text(json.dumps({'dailyProfiles': invalid}))
                    with self.assertRaisesRegex(ValueError, 'installed managed profiles'):
                        sre.daily_profiles()


if __name__ == '__main__':
    unittest.main()
