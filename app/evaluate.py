"""Trusted read-only label access and offline scorecard construction."""

from contextlib import contextmanager
from pathlib import Path

from app.db import connect, database_path
from app.labels import resolve_label_path


@contextmanager
def evaluation_connection(path: str | Path | None = None, *, labels_path: str | Path | None = None):
    """Only evaluation attaches ground truth, read-only, on a fresh connection.

    This is data separation, not an OS security boundary. Runtime tools must not
    be given this file or the original labeled EVE source. No multi-file writes.
    """
    main = Path(path).resolve() if path is not None else database_path()
    target = resolve_label_path(main, labels_path)
    if not target.is_file():
        raise FileNotFoundError("Evaluation labels are missing; import the labeled source first")
    with connect(main, read_only=True) as connection:
        connection.execute("ATTACH DATABASE ? AS ground_truth", (target.as_uri() + "?mode=ro",))
        connection.execute("PRAGMA query_only = ON")
        connection.execute("BEGIN")
        missing = connection.execute("""SELECT d.id FROM datasets d
            LEFT JOIN ground_truth.label_datasets l ON l.sha256 = d.sha256
            WHERE l.sha256 IS NULL OR l.event_count != d.event_count LIMIT 1""").fetchone()
        if missing:
            raise ValueError("Label store does not match runtime datasets; reimport the original sources")
        yield connection


def load_scorecard(events, dataset_id, path=None, *, labels_path=None,
                   manifest=None, session_minutes=None, provenance=None):
    """Only this trusted access layer reads individual labels. No model input.

    A supplied manifest partitions the attack-labeled baseline event IDs. The
    alternative, explicitly configured demo sessions, is curated-label retention
    and must never be described as independent detection ground truth.
    """
    import hashlib
    import json
    from app.tuning.policy import exact_object
    from app.tuning.scorecard import Scorecard, define_attack_groups

    if manifest is not None and session_minutes is not None:
        raise ValueError('Choose evaluation manifest or fixed demo sessions')
    with evaluation_connection(path, labels_path=labels_path) as db:
        dataset = db.execute('SELECT sha256, split FROM datasets WHERE id=?', (dataset_id,)).fetchone()
        if dataset is None:
            raise LookupError('Dataset not found')
        if dataset['split'] != 'tune':
            raise ValueError('Offline tuning requires dataset split=tune; heldout labels cannot enter tuning')
        rows = db.execute('''SELECT e.id, l.label, l.provenance FROM events e
            JOIN ground_truth.event_labels l ON l.source_line=e.source_line
            AND l.dataset_sha256=? WHERE e.dataset_id=?''', (dataset['sha256'], dataset_id)).fetchall()
    labels = {r['id']: r['label'] for r in rows}
    if set(labels) != {e['id'] for e in events}:
        raise ValueError('Missing evaluation labels for baseline events')
    if manifest is not None:
        exact_object(manifest, {'dataset_sha256', 'provenance', 'groups'}, 'evaluation manifest')
        if manifest['dataset_sha256'] != dataset['sha256']:
            raise ValueError('Evaluation manifest dataset hash mismatch')
        groups, provenance = manifest['groups'], manifest['provenance']
        digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        definition = {'method': 'operator-manifest', 'sha256': digest}
    elif session_minutes is not None:
        groups = define_attack_groups(events, labels, silence_minutes=session_minutes)
        definition = {'method': 'fixed-evaluation-sessions', 'silence_minutes': session_minutes,
                      'key': ['source', 'target', 'attack_type'], 'boundary': 'gap >= silence starts a new group',
                      'warning': 'Operator-approved demo assumption. Revisit if retention hides distinct incidents.'}
    else:
        groups, definition = None, {'method': 'unavailable'}
    sources = sorted({r['provenance'] for r in rows})
    full_provenance = json.dumps({'operator': provenance, 'stored_sources': sources}, sort_keys=True)
    if not provenance or not isinstance(provenance, str) or not provenance.strip():
        raise ValueError('Supply evaluation label/group provenance')
    return Scorecard(events, labels, groups, provenance=full_provenance, definition=definition)
