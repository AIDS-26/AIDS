# SIEM frontend

Place the client-facing SIEM interface here. The frontend framework is undecided;
this directory is a placeholder, not a running application.

The backend lives in `app/` and will expose the API for alerts, runs, metrics, and
rule-version history. Keep processing, database connections, and evaluation label
access in backend code. The frontend must not open SQLite files or receive the
backend `.env`. API routes and ports will be defined when the services are built.
