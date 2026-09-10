import copy
from pathlib import Path
import unittest
import json
import tempfile
from unittest.mock import patch

import runner


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        source = Path(__file__).resolve().parents[2] / '.github/workflows/ci.yml'
        self.workflow = runner.workflow(source if source.exists() else Path(__file__).with_name('ci.yml'))

    def test_all_jobs_and_matrix_rows_are_present(self):
        jobs = runner.expand(self.workflow)
        self.assertEqual(len(jobs), 11)
        names = {name for name, _, _ in jobs}
        self.assertIn('raw-corpus', names)
        self.assertIn('embedded-compile', names)
        self.assertEqual(len([n for n in names if n.startswith('lighthouse-')]), 4)

    def test_unknown_action_is_not_silently_skipped(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported action'):
            runner.classify({'uses': 'actions/upload-artifact@v4'})

    def test_unknown_platform_fails(self):
        self.workflow['jobs']['raw-corpus']['runs-on'] = 'windows-latest'
        with self.assertRaisesRegex(ValueError, 'unsupported OS'):
            runner.expand(self.workflow)

    def test_dependencies_are_not_ignored(self):
        self.workflow['jobs']['raw-corpus']['needs'] = 'missing-job'
        with self.assertRaisesRegex(ValueError, 'unknown job dependency'):
            runner.expand(self.workflow)

    def test_browser_e2e_waits_for_other_jobs(self):
        needs = self.workflow['jobs']['browser-e2e']['needs']
        self.assertEqual(set(needs), set(self.workflow['jobs']) - {'browser-e2e'})

    def test_empty_matrix_cannot_silently_skip_checks(self):
        self.workflow['jobs']['lighthouse']['strategy']['matrix']['include'] = []
        with self.assertRaisesRegex(ValueError, 'empty matrix'):
            runner.expand(self.workflow)

    def test_preflight_failure_returns_nonzero_and_writes_summary(self):
        with tempfile.TemporaryDirectory() as folder:
            reports = Path(folder)
            with patch.object(runner, 'preflight', side_effect=ValueError('stale image')):
                with patch.object(runner.signal, 'signal'):
                    result = runner.orchestrate(reports, reports)
            self.assertEqual(result, 1)
            summary = next(reports.glob('*/summary.json'))
            rows = json.loads(summary.read_text())
            self.assertEqual(rows[0]['status'], 'FAIL')
            self.assertEqual(rows[0]['error'], 'stale image')
            self.assertIn('stale image', summary.with_suffix('.md').read_text())

    def test_zero_jobs_is_not_a_success(self):
        with tempfile.TemporaryDirectory() as folder:
            reports = Path(folder)
            with patch.object(runner, 'preflight', return_value=[]):
                with patch.object(runner.signal, 'signal'):
                    self.assertEqual(runner.orchestrate(reports, reports), 1)

    def test_setup_version_drift_fails(self):
        step = {'uses': 'pnpm/action-setup@v4', 'with': {'version': '10', 'run_install': False}}
        with self.assertRaisesRegex(ValueError, 'pnpm setup'):
            runner.classify(step)

    def test_expressions_are_validated(self):
        self.assertEqual(runner.substitute('collect ${{ matrix.urls }}', {'urls': '--url=x'}), 'collect --url=x')
        with self.assertRaisesRegex(ValueError, 'Unsupported expression'):
            runner.substitute('${{ secrets.TOKEN }}', {})

    def test_conditional_checks_cannot_disappear(self):
        with self.assertRaisesRegex(ValueError, 'Unsupported conditional'):
            runner.classify({'run': 'pnpm test', 'if': 'false'})

    def test_ordinary_commands_always_run(self):
        for command in ('pnpm test', 'pnpm verify:raw-corpus', 'pnpm install --frozen-lockfile'):
            self.assertEqual(runner.classify({'run': command}), 'RUN')

    def test_api_comment_is_explicitly_hosted_only(self):
        step = next(s for s in self.workflow['jobs']['verify']['steps'] if s.get('uses') == 'actions/github-script@v7')
        self.assertEqual(runner.classify(step), 'HOSTED-ONLY')
        changed = copy.deepcopy(step)
        changed['name'] = 'Some other API action'
        with self.assertRaises(ValueError):
            runner.classify(changed)


if __name__ == '__main__':
    unittest.main()
