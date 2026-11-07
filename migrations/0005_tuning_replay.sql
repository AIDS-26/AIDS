-- Per-event floors are required when a scanner group spans multiple services.
-- Historical memberships remain unchanged; their unavailable details stay NULL.
CREATE TABLE tuned_event_scores (
    run_id INTEGER NOT NULL REFERENCES runs(id),
    event_id INTEGER NOT NULL REFERENCES events(id),
    rule_id TEXT NOT NULL REFERENCES rules(id),
    base_score INTEGER NOT NULL CHECK (base_score BETWEEN 1 AND 10),
    window_minutes REAL NOT NULL CHECK (window_minutes > 0),
    n_sat INTEGER NOT NULL CHECK (n_sat BETWEEN 2 AND 2147483647),
    alert_score INTEGER NOT NULL CHECK (alert_score BETWEEN base_score AND 10),
    PRIMARY KEY (run_id, event_id)
);
DROP TRIGGER alert_events_require_trajectory;
CREATE TRIGGER alert_events_require_trajectory BEFORE INSERT ON alert_events
WHEN NEW.n_in_window IS NULL OR NEW.raised_score IS NULL OR NEW.raised_score < COALESCE(
    (SELECT base_score FROM tuned_event_scores WHERE run_id=NEW.run_id AND event_id=NEW.event_id),
    (SELECT base_score FROM alerts WHERE id=NEW.alert_id))
BEGIN
    SELECT RAISE(ABORT, 'New evidence requires window count and score at or above its event base');
END;
CREATE TRIGGER alert_events_one_group BEFORE INSERT ON alert_events
WHEN EXISTS (SELECT 1 FROM alert_events WHERE run_id=NEW.run_id AND event_id=NEW.event_id)
BEGIN
    SELECT RAISE(ABORT, 'Each event belongs to one alert per run');
END;
CREATE TRIGGER tuned_event_scores_immutable BEFORE UPDATE ON tuned_event_scores
BEGIN
    SELECT RAISE(ABORT, 'Event scoring inputs are immutable; create a new replay');
END;
ALTER TABLE tuning_attempts ADD COLUMN policy_json TEXT CHECK (policy_json IS NULL OR json_valid(policy_json));
ALTER TABLE tuning_attempts ADD COLUMN flow_json TEXT CHECK (flow_json IS NULL OR json_valid(flow_json));
ALTER TABLE tuning_attempts ADD COLUMN outcome_json TEXT CHECK (outcome_json IS NULL OR json_valid(outcome_json));
ALTER TABLE tuning_attempts ADD COLUMN evaluation_policy_json TEXT CHECK (evaluation_policy_json IS NULL OR json_valid(evaluation_policy_json));
ALTER TABLE tuning_attempts ADD COLUMN selected_version_id TEXT REFERENCES rule_versions(id);
ALTER TABLE tuning_iterations ADD COLUMN proposal_json TEXT CHECK (proposal_json IS NULL OR json_valid(proposal_json));
ALTER TABLE tuning_iterations ADD COLUMN guardrail_json TEXT CHECK (guardrail_json IS NULL OR json_valid(guardrail_json));
ALTER TABLE tuning_iterations ADD COLUMN tuned_run_id INTEGER REFERENCES runs(id);
