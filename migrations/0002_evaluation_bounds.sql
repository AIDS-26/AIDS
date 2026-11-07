-- Zero-attack slices are valid evaluations. Their recall is undefined (N/A),
-- not 100%; the evaluator must not use them to certify attack retention.
-- Keep the PDF's three-iteration limit in tuner policy, not storage bounds.
CREATE TABLE evaluations_new (
    id INTEGER PRIMARY KEY,
    baseline_run_id INTEGER NOT NULL,
    tuned_run_id INTEGER NOT NULL,
    dataset_id INTEGER NOT NULL,
    iteration INTEGER NOT NULL CHECK (iteration >= 1),
    alert_reduction REAL NOT NULL CHECK (alert_reduction <= 1),
    attack_groups_total INTEGER NOT NULL CHECK (attack_groups_total >= 0),
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

INSERT INTO evaluations_new (
    id, baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
    attack_groups_total, attack_groups_retained, benign_groups_raised,
    details_json, created_at
)
SELECT id, baseline_run_id, tuned_run_id, dataset_id, iteration, alert_reduction,
       attack_groups_total, attack_groups_retained, benign_groups_raised,
       details_json, created_at
FROM evaluations;

DROP TABLE evaluations;
ALTER TABLE evaluations_new RENAME TO evaluations;
