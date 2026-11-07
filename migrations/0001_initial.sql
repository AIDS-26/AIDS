-- Append new numbered migrations; never edit an already applied migration.
CREATE TABLE datasets (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE CHECK (length(sha256) = 64),
    source_path TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id),
    source_line INTEGER NOT NULL CHECK (source_line > 0),
    timestamp TEXT NOT NULL,
    timestamp_us INTEGER NOT NULL,
    src_ip TEXT,
    dest_ip TEXT,
    signature_id INTEGER,
    signature TEXT,
    raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
    UNIQUE (dataset_id, source_line),
    UNIQUE (id, dataset_id)
);

-- Curated labels are evaluation metadata, not runtime scoring inputs.
CREATE TABLE event_labels (
    event_id INTEGER PRIMARY KEY REFERENCES events(id),
    label TEXT NOT NULL CHECK (label IN ('attack', 'benign', 'unconfirmed')),
    phase TEXT,
    original_timestamp TEXT,
    provenance TEXT NOT NULL
);

CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(id),
    mode TEXT NOT NULL CHECK (mode IN ('baseline', 'tuned')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    rule_version TEXT NOT NULL,
    rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
    budget_per_hour REAL CHECK (budget_per_hour > 0),
    observation_seconds REAL NOT NULL CHECK (observation_seconds > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    UNIQUE (id, dataset_id)
);

CREATE TABLE alerts (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id),
    group_key TEXT NOT NULL,
    attack_type TEXT NOT NULL,
    service TEXT NOT NULL,
    first_timestamp_us INTEGER NOT NULL,
    last_timestamp_us INTEGER NOT NULL CHECK (last_timestamp_us >= first_timestamp_us),
    base_score INTEGER NOT NULL CHECK (base_score BETWEEN 1 AND 10),
    score INTEGER NOT NULL CHECK (score BETWEEN base_score AND 10),
    severity TEXT GENERATED ALWAYS AS (
        CASE WHEN score >= 8 THEN 'High'
             WHEN score >= 5 THEN 'Medium' ELSE 'Low' END
    ) STORED,
    UNIQUE (id, run_id)
);

-- Composite foreign keys prevent linking a run to another dataset's evidence.
CREATE TABLE alert_events (
    alert_id INTEGER NOT NULL,
    event_id INTEGER NOT NULL,
    run_id INTEGER NOT NULL,
    dataset_id INTEGER NOT NULL,
    PRIMARY KEY (alert_id, event_id),
    FOREIGN KEY (alert_id, run_id) REFERENCES alerts(id, run_id),
    FOREIGN KEY (run_id, dataset_id) REFERENCES runs(id, dataset_id),
    FOREIGN KEY (event_id, dataset_id) REFERENCES events(id, dataset_id)
);

CREATE TABLE evaluations (
    id INTEGER PRIMARY KEY,
    baseline_run_id INTEGER NOT NULL,
    tuned_run_id INTEGER NOT NULL,
    dataset_id INTEGER NOT NULL,
    iteration INTEGER NOT NULL CHECK (iteration BETWEEN 1 AND 3),
    alert_reduction REAL NOT NULL CHECK (alert_reduction <= 1),
    attack_groups_total INTEGER NOT NULL CHECK (attack_groups_total > 0),
    attack_groups_retained INTEGER NOT NULL
        CHECK (attack_groups_retained BETWEEN 0 AND attack_groups_total),
    benign_groups_raised INTEGER NOT NULL CHECK (benign_groups_raised >= 0),
    details_json TEXT NOT NULL CHECK (json_valid(details_json)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (baseline_run_id != tuned_run_id),
    FOREIGN KEY (baseline_run_id, dataset_id) REFERENCES runs(id, dataset_id),
    FOREIGN KEY (tuned_run_id, dataset_id) REFERENCES runs(id, dataset_id),
    UNIQUE (tuned_run_id, iteration)
);

CREATE INDEX events_replay_idx ON events(dataset_id, timestamp_us, source_line);
CREATE INDEX events_signature_idx ON events(dataset_id, signature_id);
CREATE INDEX runs_dataset_idx ON runs(dataset_id, mode, created_at);
CREATE INDEX alerts_dashboard_idx ON alerts(run_id, score DESC, last_timestamp_us DESC);
CREATE INDEX alert_events_event_idx ON alert_events(event_id);
