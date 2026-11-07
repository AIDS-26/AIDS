-- The migration runner exports and verifies labels in the separate label DB
-- before executing this file. No ATTACH is used during migration or ingestion.
UPDATE events SET raw_json = json_remove(raw_json, '$.demo')
WHERE json_type(raw_json, '$.demo') IS NOT NULL;
DROP TABLE event_labels;

CREATE TRIGGER events_no_demo_insert BEFORE INSERT ON events
WHEN json_type(NEW.raw_json, '$.demo') IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Demo metadata belongs in the evaluation label database');
END;
CREATE TRIGGER events_no_demo_update BEFORE UPDATE OF raw_json ON events
WHEN json_type(NEW.raw_json, '$.demo') IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'Demo metadata belongs in the evaluation label database');
END;

-- Resume compaction on the next migrate invocation if maintenance is interrupted.
CREATE TABLE database_maintenance (task TEXT PRIMARY KEY, completed_at TEXT);
INSERT INTO database_maintenance (task) VALUES ('remove_legacy_labels');
