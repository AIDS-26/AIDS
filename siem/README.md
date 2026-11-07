# SIEM frontend

Place the client-facing SIEM interface here. The frontend framework is undecided;
this directory is a placeholder, not a running application.

The backend lives in `app/`. Run `python -m app.api --port 8000` after migrating
and importing EVE; see the root README for routes and exact-origin CORS setup.
Use `/api/datasets/{id}/alerts` for uncalculated source alerts and
`/api/runs/{id}/alerts` for completed calculated results. Source scores are null;
display “Not calculated”. Do not treat Suricata severity as an application score.
Lists return `items` and `next_after_id`; follow that cursor to retrieve all pages.
Keep processing, database connections, and evaluation label access in backend code.
The frontend must not open SQLite files or receive the backend `.env`.
