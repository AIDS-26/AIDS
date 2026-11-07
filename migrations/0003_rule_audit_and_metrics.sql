ALTER TABLE datasets ADD COLUMN split TEXT NOT NULL DEFAULT 'unassigned'
    CHECK (split IN ('unassigned', 'tune', 'heldout'));
ALTER TABLE datasets ADD COLUMN suricata_version TEXT;
ALTER TABLE datasets ADD COLUMN et_open_version TEXT;

CREATE TABLE rule_versions (
    id TEXT PRIMARY KEY NOT NULL,
    parent_id TEXT REFERENCES rule_versions(id),
    rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
    changes_json TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(changes_json) AND json_type(changes_json) = 'array'),
    rationale TEXT NOT NULL,
    created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'approved', 'active', 'retired', 'rejected')),
    guardrail_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (guardrail_status IN ('pending', 'passed', 'failed')),
    approved_by TEXT,
    approved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (parent_id IS NULL OR parent_id != id),
    CHECK (status != 'active' OR guardrail_status = 'passed'),
    CHECK (status != 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX rule_versions_one_active_idx ON rule_versions(status) WHERE status = 'active';
CREATE INDEX rule_versions_parent_idx ON rule_versions(parent_id);

-- Preserve each historical run's actual snapshot without guessing version lineage.
INSERT INTO rule_versions (id, rules_json, rationale, created_by, status)
SELECT 'legacy/run/' || id, rules_json,
       'Migrated run snapshot; original version label: ' || rule_version,
       'migration:0003', 'retired'
FROM runs;
ALTER TABLE runs ADD COLUMN rule_version_id TEXT REFERENCES rule_versions(id);
UPDATE runs SET rule_version_id = 'legacy/run/' || id;
ALTER TABLE runs ADD COLUMN error_message TEXT;
ALTER TABLE runs ADD COLUMN error_traceback TEXT;
ALTER TABLE runs ADD COLUMN failed_at TEXT;

CREATE TRIGGER rule_version_snapshot_immutable
BEFORE UPDATE OF id, parent_id, rules_json, changes_json, rationale, created_by, created_at ON rule_versions
BEGIN
    SELECT RAISE(ABORT, 'Rule version contents are immutable; create a child version');
END;

CREATE TRIGGER runs_require_version_insert BEFORE INSERT ON runs
WHEN NEW.rule_version_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM rule_versions WHERE id = NEW.rule_version_id
    AND json(rules_json) = json(NEW.rules_json)
)
BEGIN
    SELECT RAISE(ABORT, 'Run requires a matching rule version snapshot');
END;
CREATE TRIGGER runs_require_version_update
BEFORE UPDATE OF rule_version_id, rules_json ON runs
WHEN NEW.rule_version_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM rule_versions WHERE id = NEW.rule_version_id
    AND json(rules_json) = json(NEW.rules_json)
)
BEGIN
    SELECT RAISE(ABORT, 'Run requires a matching rule version snapshot');
END;

CREATE TRIGGER runs_snapshot_immutable
BEFORE UPDATE OF dataset_id, mode, rule_version, rule_version_id, rules_json,
                 observation_seconds, budget_per_hour ON runs
BEGIN
    SELECT RAISE(ABORT, 'Run inputs are immutable; create a new replay run');
END;

CREATE TABLE rules (
    id TEXT PRIMARY KEY NOT NULL,
    attack_type TEXT NOT NULL,
    service TEXT NOT NULL,
    UNIQUE (attack_type, service)
);
CREATE TRIGGER rules_identity_immutable BEFORE UPDATE ON rules
BEGIN
    SELECT RAISE(ABORT, 'Application rule identity is immutable');
END;
INSERT INTO rules (id, attack_type, service)
SELECT 'legacy/rule/' || min(id), attack_type, service
FROM alerts GROUP BY attack_type, service;
ALTER TABLE alerts ADD COLUMN rule_id TEXT REFERENCES rules(id);
UPDATE alerts SET rule_id = (
    SELECT id FROM rules WHERE rules.attack_type = alerts.attack_type AND rules.service = alerts.service
);
ALTER TABLE alerts ADD COLUMN event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0);
UPDATE alerts SET event_count = (SELECT count(*) FROM alert_events WHERE alert_id = alerts.id);

CREATE TRIGGER alerts_require_rule_insert BEFORE INSERT ON alerts
WHEN NEW.rule_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM rules WHERE id = NEW.rule_id
    AND attack_type = NEW.attack_type AND service = NEW.service
)
BEGIN
    SELECT RAISE(ABORT, 'Alert requires a matching application rule');
END;
CREATE TRIGGER alerts_require_rule_update BEFORE UPDATE OF rule_id, attack_type, service ON alerts
WHEN NEW.rule_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM rules WHERE id = NEW.rule_id
    AND attack_type = NEW.attack_type AND service = NEW.service
)
BEGIN
    SELECT RAISE(ABORT, 'Alert requires a matching application rule');
END;
CREATE TRIGGER alerts_count_insert BEFORE INSERT ON alerts WHEN NEW.event_count != 0
BEGIN
    SELECT RAISE(ABORT, 'event_count is maintained from alert_events');
END;
CREATE TRIGGER alerts_count_update BEFORE UPDATE OF event_count ON alerts
WHEN NEW.event_count != (SELECT count(*) FROM alert_events WHERE alert_id = NEW.id)
BEGIN
    SELECT RAISE(ABORT, 'event_count is maintained from alert_events');
END;

-- NULL represents unavailable historical trajectory; never invent old scores.
ALTER TABLE alert_events ADD COLUMN n_in_window INTEGER CHECK (n_in_window >= 1);
ALTER TABLE alert_events ADD COLUMN raised_score INTEGER CHECK (raised_score BETWEEN 1 AND 10);
CREATE TRIGGER alert_events_require_trajectory BEFORE INSERT ON alert_events
WHEN NEW.n_in_window IS NULL OR NEW.raised_score IS NULL OR NEW.raised_score < (
    SELECT base_score FROM alerts WHERE id = NEW.alert_id
)
BEGIN
    SELECT RAISE(ABORT, 'New evidence requires window count and score at or above base');
END;
CREATE TRIGGER alert_events_immutable BEFORE UPDATE ON alert_events
BEGIN
    SELECT RAISE(ABORT, 'Evidence trajectory is immutable; create a new replay run');
END;
CREATE TRIGGER alert_events_count_insert AFTER INSERT ON alert_events
BEGIN
    UPDATE alerts SET event_count = event_count + 1 WHERE id = NEW.alert_id;
END;
CREATE TRIGGER alert_events_count_delete AFTER DELETE ON alert_events
BEGIN
    UPDATE alerts SET event_count = event_count - 1 WHERE id = OLD.alert_id;
END;

ALTER TABLE events ADD COLUMN dest_port INTEGER
    GENERATED ALWAYS AS (json_extract(raw_json, '$.dest_port')) VIRTUAL;
ALTER TABLE events ADD COLUMN proto TEXT
    GENERATED ALWAYS AS (json_extract(raw_json, '$.proto')) VIRTUAL;
ALTER TABLE events ADD COLUMN category TEXT
    GENERATED ALWAYS AS (json_extract(raw_json, '$.alert.category')) VIRTUAL;
ALTER TABLE events ADD COLUMN flow_id INTEGER
    GENERATED ALWAYS AS (json_extract(raw_json, '$.flow_id')) VIRTUAL;
CREATE INDEX events_dest_port_idx ON events(dataset_id, dest_port);
CREATE INDEX events_proto_idx ON events(dataset_id, proto);
CREATE INDEX events_category_idx ON events(dataset_id, category);
CREATE INDEX events_flow_idx ON events(dataset_id, flow_id);
CREATE INDEX alerts_rule_idx ON alerts(run_id, rule_id);

CREATE TABLE rule_flow_stats (
    run_id INTEGER NOT NULL REFERENCES runs(id),
    rule_id TEXT NOT NULL REFERENCES rules(id),
    window_minutes REAL NOT NULL CHECK (window_minutes > 0),
    observed_count INTEGER NOT NULL CHECK (observed_count >= 0),
    observation_seconds REAL NOT NULL CHECK (observation_seconds > 0),
    observed_per_hour REAL GENERATED ALWAYS AS (observed_count * 3600.0 / observation_seconds) VIRTUAL,
    peak_n INTEGER NOT NULL CHECK (peak_n >= 0),
    p95_n REAL NOT NULL CHECK (p95_n BETWEEN 0 AND peak_n),
    base_score INTEGER NOT NULL CHECK (base_score BETWEEN 1 AND 10),
    evidence_weight REAL NOT NULL CHECK (evidence_weight BETWEEN 0 AND 1),
    priority_weight REAL GENERATED ALWAYS AS (base_score * evidence_weight) VIRTUAL,
    allowed_share REAL CHECK (allowed_share >= 0),
    delta_gap REAL GENERATED ALWAYS AS (observed_per_hour - allowed_share) VIRTUAL,
    percentile_method TEXT NOT NULL,
    PRIMARY KEY (run_id, rule_id, window_minutes)
);
CREATE TRIGGER flow_stats_duration_insert BEFORE INSERT ON rule_flow_stats
WHEN NEW.observation_seconds != (SELECT observation_seconds FROM runs WHERE id = NEW.run_id)
BEGIN
    SELECT RAISE(ABORT, 'Flow stats must use the run observation duration');
END;
CREATE TRIGGER flow_stats_duration_update BEFORE UPDATE ON rule_flow_stats
WHEN NEW.observation_seconds != (SELECT observation_seconds FROM runs WHERE id = NEW.run_id)
BEGIN
    SELECT RAISE(ABORT, 'Flow stats must use the run observation duration');
END;

-- An empty baseline makes reduction undefined; retain old measured values.
CREATE TABLE evaluations_new (
    id INTEGER PRIMARY KEY,
    baseline_run_id INTEGER NOT NULL,
    tuned_run_id INTEGER NOT NULL,
    dataset_id INTEGER NOT NULL,
    iteration INTEGER NOT NULL CHECK (iteration >= 1),
    alert_reduction REAL CHECK (alert_reduction <= 1),
    attack_groups_total INTEGER NOT NULL CHECK (attack_groups_total >= 0),
    attack_groups_retained INTEGER NOT NULL
        CHECK (attack_groups_retained BETWEEN 0 AND attack_groups_total),
    benign_groups_raised INTEGER NOT NULL CHECK (benign_groups_raised >= 0),
    details_json TEXT NOT NULL CHECK (json_valid(details_json)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    baseline_alert_count INTEGER CHECK (baseline_alert_count >= 0),
    tuned_alert_count INTEGER CHECK (tuned_alert_count >= 0),
    attack_group_recall REAL GENERATED ALWAYS AS (
        CASE WHEN attack_groups_total > 0 THEN attack_groups_retained * 1.0 / attack_groups_total END
    ) VIRTUAL,
    CHECK (baseline_run_id != tuned_run_id),
    CHECK (baseline_alert_count IS NULL OR baseline_alert_count != 0 OR alert_reduction IS NULL),
    FOREIGN KEY (baseline_run_id, dataset_id) REFERENCES runs(id, dataset_id),
    FOREIGN KEY (tuned_run_id, dataset_id) REFERENCES runs(id, dataset_id),
    UNIQUE (tuned_run_id, iteration)
);
INSERT INTO evaluations_new (
    id, baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
    attack_groups_total, attack_groups_retained, benign_groups_raised, details_json, created_at
)
SELECT id, baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
       attack_groups_total, attack_groups_retained, benign_groups_raised, details_json, created_at
FROM evaluations;
DROP TABLE evaluations;
ALTER TABLE evaluations_new RENAME TO evaluations;

CREATE TRIGGER evaluations_matching_runs_insert BEFORE INSERT ON evaluations
WHEN NOT EXISTS (
    SELECT 1 FROM runs b JOIN runs t
    WHERE b.id = NEW.baseline_run_id AND t.id = NEW.tuned_run_id
      AND b.mode = 'baseline' AND t.mode = 'tuned'
      AND b.observation_seconds = t.observation_seconds
)
BEGIN
    SELECT RAISE(ABORT, 'Evaluation requires baseline/tuned runs with equal observation durations');
END;
CREATE TRIGGER evaluations_matching_runs_update BEFORE UPDATE ON evaluations
WHEN NOT EXISTS (
    SELECT 1 FROM runs b JOIN runs t
    WHERE b.id = NEW.baseline_run_id AND t.id = NEW.tuned_run_id
      AND b.mode = 'baseline' AND t.mode = 'tuned'
      AND b.observation_seconds = t.observation_seconds
)
BEGIN
    SELECT RAISE(ABORT, 'Evaluation requires baseline/tuned runs with equal observation durations');
END;

CREATE TABLE tuning_attempts (
    id INTEGER PRIMARY KEY,
    baseline_run_id INTEGER NOT NULL REFERENCES runs(id),
    created_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE tuning_iterations (
    id INTEGER PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES tuning_attempts(id),
    iteration INTEGER NOT NULL CHECK (iteration >= 1),
    rule_version_id TEXT REFERENCES rule_versions(id),
    evaluation_id INTEGER REFERENCES evaluations(id),
    model_name TEXT,
    report_text TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'evaluated', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (attempt_id, iteration)
);
