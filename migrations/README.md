# Database migrations

Run `python -m scripts.manage_db migrate` from the repository root.

Add changes in increasing order: `0002_description.sql`, `0003_description.sql`, etc.
Each filename needs a unique four-digit version. End each SQL statement with a
semicolon on its own statement-ending line. Multiline statements and triggers
are supported. Do not put transaction-control statements, `VACUUM`, or journal
PRAGMAs in migrations: the runner owns the transaction.

Applied names and SHA-256 checksums are recorded in `schema_migrations`. Never edit,
rename, or remove an applied migration; add a new one. Line endings are normalized
for checksums. The runner locks migration writes, detects history changes, and
applies all pending files in one transaction. Failure rolls back schema changes
and history records together. There is no automatic destructive downgrade.

`0004_separate_labels.sql` has a trusted Python preflight in `app.labels`: export
and verify legacy ground truth to the separate label file before removing it from
the main database. The label store has its own migrations under `labels/`. A label
copy may remain if the main transaction rolls back; retry is idempotent. WAL cannot
make writes to two database files atomic. Never run `0004` manually as plain SQL.
After commit the runner compacts the main file and truncates its WAL to remove
legacy label content, with a durable maintenance task for interrupted cleanup.

Run migrations with processing and SIEM workers stopped. Applications
should use `app.db.connect()` so foreign keys and lock timeouts are always enabled.

`0005_tuning_replay.sql` adds per-event input floors and effective grouping settings
for mixed-service groups, exactly-once membership checks for new writes, and
policy/proposal/outcome links for tuning audit. Existing trajectories remain
unchanged; newly added historical JSON fields are nullable. It does not infer
past guardrail results or activate historical versions.
