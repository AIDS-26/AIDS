# SIEM frontend

Place the client-facing SIEM interface here. The frontend framework is undecided;
this directory is a placeholder, not a running application.

The backend lives in `app/`. After migrating and importing EVE, run
`python -m scripts.manage_db score-baseline DATASET_ID --observation-seconds SECONDS`
to create a completed original-rule run, then `python -m app.api --port 8000`.
See the root README for routes and exact-origin CORS setup.
Use `/api/datasets/{id}/alerts` for uncalculated source alerts and
`/api/runs/{id}/alerts` for completed calculated results. Source scores are null;
display “Not calculated”. Do not treat Suricata severity as an application score.
Lists return `items` and `next_after_id`; follow that cursor to retrieve all pages.
Keep processing, database connections, and evaluation label access in backend code.
The frontend must not open SQLite files or receive the backend `.env`.
