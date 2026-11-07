CREATE TABLE label_datasets (
    sha256 TEXT PRIMARY KEY NOT NULL CHECK (length(sha256) = 64),
    event_count INTEGER NOT NULL CHECK (event_count >= 0),
    label_count INTEGER NOT NULL CHECK (label_count BETWEEN 0 AND event_count),
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE event_labels (
    dataset_sha256 TEXT NOT NULL REFERENCES label_datasets(sha256),
    source_line INTEGER NOT NULL CHECK (source_line >= 1),
    label TEXT NOT NULL CHECK (label IN ('attack', 'benign', 'unconfirmed')),
    phase TEXT,
    original_timestamp TEXT,
    provenance TEXT NOT NULL,
    metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
    PRIMARY KEY (dataset_sha256, source_line)
);
