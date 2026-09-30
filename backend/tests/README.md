# EduSync deterministic backend tests

Run from the repository root using the backend virtual environment:

```powershell
backend/venv/Scripts/python.exe -m pip install -r backend/requirements.txt -r backend/requirements-test.txt
backend/venv/Scripts/python.exe backend/tests/run_tests.py
```

The runner writes JSON observations and JUnit XML into `docs/testing/results`.
Use `--output-dir <directory>` to preserve a separate run. A nonzero exit code
means an assertion failed or the harness encountered an error. Known product
gaps are genuine failing acceptance checks, never hidden with expectedFailure.

## Isolation

Use a fresh Python process; do not import the application first. `support.py`
disables dotenv loading and directory creation while importing config, then
redirects paths before importing the application. Every test gets a new temporary
SQLite database and upload/vector directories. All handles are closed before
the temporary directory is removed. Test users and passwords are synthetic.

FastAPI endpoints, Pydantic validation, SQLite transactions, bcrypt, JWT handling,
PyMuPDF and the text splitter are real. ChromaDB is replaced BEFORE application
import with an in-memory contract double; no embedding model is downloaded.
Groq is disabled unless replaced with an explicit mock, and ordinary external
httpx transports are blocked. The frontend, actual Chroma search/persistence,
live LLM output, real network behavior and usability remain separate manual or
integration tests. Fake-vector tests verify orchestration, not vector quality.

Most tests mint a test token to isolate the endpoint under test. Authentication
tests separately verify registration and login. These tests do not depend on
an existing user account. They run sequentially; global monkeypatches must not
be shared across concurrent test threads/processes in one interpreter.

## Traceability and honest results

The `@case` decorator maps each automated test to a family in the Chapter 4
plan. Passing automated subchecks does NOT imply that the entire manual case
passed. For example, DEP-02 only checks SQLite reinitialization here, and SEC-01
checks CORS but does not prove a real operating-system loopback listener.

The default suite deliberately tests suspected defects without changing product
code. Review failures and fix them in a separate change, then rerun and retain
both evidence versions. Synthetic fault injection may intentionally yield a
500 response; that is expected only where the test is checking rollback behavior.

Source hashes in the evidence file identify the exact tested Python source,
including uncommitted configuration edits; the .env file is never included.

## Execution evidence from 30 September 2026

The final deterministic run is in
`docs/testing/results/2026-09-30-complete-deterministic`: 73 checks,
47 Pass, 26 Fail, zero execution errors. Failure is the expected runner exit
status on this unchanged application build. The table-only Word report and its
machine-readable case register distinguish these method counts from 68 planned
case families: 5 Pass, 20 Fail, 39 partially tested and 4 pending.

Additional opt-in integration scripts were executed separately:

- `isolated_server.py <project-tmp-directory> <port>` redirects application
  storage before importing routes, uses a test JWT secret, and reads only the
  Groq key/model from backend `.env`. Use only a fresh disposable directory.
- `run_live_checks.py <port> <new-results-directory-name>` registers synthetic
  fixtures, uploads real PDFs into real Chroma, calls the configured provider,
  and measures 30 warm requests. It makes chargeable external inference calls.
  The verified run is `2026-09-30-live-network`; earlier sandbox network errors
  are retained separately in `2026-09-30-live`.
- `offline_probe.py seed` then `offline_probe.py verify`, in separate processes,
  uses cached real embeddings with Python outbound sockets blocked. Its fixed
  temporary paths should be changed before a new historical evidence run.
- `concurrency_probe.py` measures ten health requests during a real 10 MiB
  upload to the isolated server; this is not the full parallel quiz workload.
- `docs/testing/browser_checks.cjs` and `browser_live.cjs` use bundled
  Playwright/Edge and a development frontend on 3101. API requests are bridged
  to isolated ports 8101/8102. The first script mocks quiz generation and
  supplies fixture bytes at its upload bridge; the second uses real inference.
  These scripts have fixed fixture paths and are recorded workflow probes,
  not portable default CI tests. Preserve old output directories before reuse.

Final browser evidence is in `2026-09-30-browser-verified` and
`2026-09-30-browser-live`. Earlier browser attempts are diagnostic history,
not the final verdict. Raw generated outputs remain available for independent
review; matching a literal fact or using a generated answer key does not prove
semantic correctness. Five-student studies and the human-scored AI benchmark
remain pending at the user's direction. No production source or personal study
data was changed to obtain these results.

`2026-09-30-frontend-direct/results.json` separately records direct development
frontend requests: login/dashboard returned 200, while `/study/1/1` returned
500 with `DOMMatrix is not defined`. This server-rendering failure precedes
client authentication and is distinct from successful client-side navigation.

Build the table-only Word document using a Python environment with python-docx:
`docs/testing/build_case_tables.py`. It reads the original Markdown plan and
the recorded JSON evidence, producing 68 tables with all eight required fields.
