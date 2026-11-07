"""Local demo control jobs. Existing GET data routes remain read-only."""

import os
import logging
from datetime import datetime, timezone
from pathlib import Path
import threading

from app.db import PROJECT_ROOT, connect
from app.tuning.settings import tuning_settings
from app.tuning.diagnostics import failure_reason

logger = logging.getLogger(__name__)


class JobError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def _acquire(path):
    """OS lock survives threads and is released automatically on process exit."""
    try:
        stream = Path(path).with_suffix('.tuning.lock').open('a+b')
    except OSError:
        raise JobError('Unable to acquire the tuning worker lock.', 503) from None
    try:
        if os.name == 'nt':
            import msvcrt
            stream.seek(0, 2)
            if stream.tell() == 0:
                stream.write(b'0')
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        return stream
    except OSError:
        stream.close()
        raise JobError('A tuning job is already running. Wait for it to finish.', 409) from None


class TuningJobs:
    def __init__(self, path):
        self.path = path
        self._mutex = threading.RLock()
        self._jobs = {}

    def settings(self):
        settings = tuning_settings('gpt-6.1-sol')
        return {'model': settings['model'], 'ready': bool(settings['api_key']),
                'max_iterations': 3, 'evaluation_session_minutes': 10}

    def start(self, baseline_id, request_id):
        if type(baseline_id) is not int or baseline_id <= 0:
            raise JobError('Choose a completed original-rule baseline.')
        with self._mutex:
            previous = self._jobs.get(request_id)
            if previous:
                if previous['baseline_run_id'] != baseline_id:
                    raise JobError('This request ID belongs to a different baseline.', 409)
                return self.get(request_id)
            for job in self._jobs.values():
                if job['status'] == 'running':
                    if job['baseline_run_id'] == baseline_id:
                        return self.get(job['id'])
                    raise JobError('A tuning job is already running. Wait for it to finish.', 409)
            with connect(self.path, read_only=True) as db:
                run = db.execute('''SELECT r.mode,r.status,d.split FROM runs r
                    JOIN datasets d ON d.id=r.dataset_id WHERE r.id=?''', (baseline_id,)).fetchone()
                if run is None:
                    raise JobError('Baseline run not found.', 404)
                if run['mode'] != 'baseline' or run['status'] != 'completed' or run['split'] != 'tune':
                    raise JobError('Tuning requires a completed baseline from a tune dataset.')
            settings = tuning_settings('gpt-6.1-sol')
            if not settings['api_key']:
                raise JobError('Configure CODEX_API_KEY in the backend environment or root .env.', 503)
            if not isinstance(settings['model'], str) or not settings['model'].strip():
                raise JobError('Configure CODEX_MODEL in the backend environment or root .env.', 503)
            lease = _acquire(self.path)
            job = {'id': request_id, 'baseline_run_id': baseline_id, 'status': 'running',
                   'model': settings['model'], 'attempt_id': None, 'tuned_run_id': None,
                   'error': None, 'iteration': 0, 'iteration_status': 'starting', 'logs': []}
            # Bound transient status storage; durable attempts stay in SQLite.
            if len(self._jobs) >= 64:
                self._jobs.pop(next(iter(self._jobs)))
            self._jobs[request_id] = job
            thread = threading.Thread(target=self._run, args=(request_id, settings, lease), daemon=True)
            try:
                thread.start()
            except Exception:
                lease.close()
                self._jobs.pop(request_id, None)
                raise JobError('Unable to start the tuning worker.', 503) from None
            return self.get(request_id)

    def _progress(self, job_id, stage, iteration, message):
        entry = {'timestamp': datetime.now(timezone.utc).isoformat(),
                 'stage': stage, 'iteration': iteration, 'message': message}
        with self._mutex:
            job = self._jobs[job_id]
            job['logs'].append(entry)
            job['logs'] = job['logs'][-100:]
            job.update(iteration=iteration, iteration_status=stage)
        log = logger.error if stage in ('failed', 'iteration_failed') else logger.info
        log('Tuning job %s | %s | iteration %s | %s', job_id, stage, iteration, message)

    def _run(self, job_id, settings, lease):
        def created(attempt_id):
            with self._mutex:
                self._jobs[job_id]['attempt_id'] = attempt_id

        try:
            self._progress(job_id, 'preparing', 0, 'Validating policy and loading the original-rule baseline.')
            from app.tuning.model import ResponsesProposer
            from app.tuning.policy import load_document
            from app.tuning.runner import tune

            result = tune(self._jobs[job_id]['baseline_run_id'], self.path,
                          policy=load_document(PROJECT_ROOT / 'config/tuning_policy.json'),
                          proposer=ResponsesProposer(settings['model'], api_key=settings['api_key']),
                          evaluation_session_minutes=10,
                          label_provenance='Curated demo.label; signature-derived preparation, not independent ground truth',
                          output_directory=PROJECT_ROOT / 'output/tuning', on_attempt_created=created,
                          on_progress=lambda stage, iteration, message: self._progress(job_id, stage, iteration, message))
            reason = None if result['status'] == 'completed' else failure_reason(RuntimeError(result.get('error', '')))
            self._progress(job_id, result['status'], result.get('attempts', 0),
                           'Accepted rules saved. Loading synchronized replay.' if reason is None else reason)
            with self._mutex:
                self._jobs[job_id].update(status=result['status'],
                    tuned_run_id=result.get('tuned_run_id'),
                    error=reason)
        except Exception as error:
            # Provider/filesystem/credential diagnostics are never browser output.
            reason = failure_reason(error)
            self._progress(job_id, 'failed', self._jobs[job_id]['iteration'], reason)
            with self._mutex:
                self._jobs[job_id].update(status='failed', error=reason)
        finally:
            lease.close()

    def get(self, job_id):
        with self._mutex:
            if job_id not in self._jobs:
                raise JobError('Tuning job not found. Reload saved results and check Audit log after a backend restart.', 404)
            job = dict(self._jobs[job_id])
            job['logs'] = [dict(entry) for entry in job['logs']]
        if job['attempt_id'] is not None:
            with connect(self.path, read_only=True) as db:
                iteration = db.execute('''SELECT iteration,status FROM tuning_iterations
                    WHERE attempt_id=? ORDER BY iteration DESC LIMIT 1''', (job['attempt_id'],)).fetchone()
                if iteration:
                    job.update(iteration=iteration['iteration'], iteration_status=iteration['status'])
        return job
