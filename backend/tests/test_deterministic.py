"""Requirement-linked checks; failures expose defects, not expected successes."""
import asyncio
import io
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

import jwt
from fastapi import HTTPException, UploadFile

from tests.support import (IsolatedCase, case, config, database, documents, ingestion,
                           mastery, pdf_bytes, query, quiz, rag, security)


class AuthenticationTests(IsolatedCase):
    @case("AUTH-01", "First registration creates one bcrypt-protected account and one-time key.")
    def test_first_registration_and_hashes(self):
        self.assertFalse(self.client.get("/api/auth/status").json()["account_exists"])
        r = self.register()
        self.assertEqual(r.status_code, 201)
        key = r.json()["recovery_key"]
        self.assertRegex(key, r"^EDUSYNC-(?:[A-Z0-9]{4}-){2}[A-Z0-9]{4}$")
        row = self.sql("SELECT * FROM users")[0]
        self.assertEqual(row["id"], 1)
        self.assertTrue(row["password_hash"].startswith("$2"))
        self.assertTrue(security.verify_secret("StudyTest2026!", row["password_hash"]))
        self.assertTrue(security.verify_secret(key, row["recovery_key_hash"]))
        self.assertNotEqual(key, row["recovery_key_hash"])
        self.observe(status=r.status_code, user_count=self.count("users"), bcrypt_verified=True)

    @case("AUTH-02", "Second registration is rejected with 403 and leaves exactly one account.")
    def test_second_registration(self):
        self.assertEqual(self.register().status_code, 201)
        r = self.register(email="second@example.com")
        self.observe(status=r.status_code, user_count=self.count("users"))
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.count("users"), 1)

    @case("AUTH-03", "Invalid email, empty username, 7-char password and 129-char password return 422.")
    def test_registration_schema(self):
        for changes in [{"email": "bad"}, {"username": ""}, {"username": "x" * 65},
                        {"password": "Short1!"}, {"password": "x" * 129}]:
            r = self.register(**changes)
            self.observe(field=list(changes)[0], length=len(next(iter(changes.values()))), status=r.status_code)
            self.assertEqual(r.status_code, 422)
        self.assertEqual(self.count("users"), 0)

    @case("AUTH-03", "Whitespace-only username must be rejected.", gap=True)
    def test_whitespace_username_rejected(self):
        r = self.register(username="   ")
        self.observe(status=r.status_code, users=self.count("users"))
        self.assertEqual(r.status_code, 422, "Whitespace username was accepted")

    @case("AUTH-03", "A valid 128-character mixed password must not produce a server error.", gap=True)
    def test_maximum_password_length(self):
        r = self.register(password="Ab1!" * 32)
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 201, "Schema-allowed 128-character password failed")

    @case("AUTH-04", "Valid/case-normalized login succeeds; wrong credentials return identical generic 401.")
    def test_login(self):
        self.register()
        good = self.client.post("/api/auth/login", json={"email": "STUDENT.TEST@example.com", "password": "StudyTest2026!"})
        wrong = self.client.post("/api/auth/login", json={"email": "student.test@example.com", "password": "wrong"})
        unknown = self.client.post("/api/auth/login", json={"email": "unknown@example.com", "password": "wrong"})
        self.observe(valid=good.status_code, wrong=wrong.status_code, unknown=unknown.status_code)
        self.assertEqual(good.status_code, 200)
        self.assertEqual(security.decode_session_token(good.json()["access_token"]), 1)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(wrong.json(), unknown.json())

    @case("AUTH-05", "Valid recovery changes password without external HTTP.")
    def test_recovery(self):
        key = self.register().json()["recovery_key"]
        r = self.client.post("/api/auth/recover", json={"email": "student.test@example.com", "recovery_key": key, "new_password": "NewStudy2026!"})
        self.assertEqual(r.status_code, 200)
        statuses = []
        for password in ["StudyTest2026!", "NewStudy2026!"]:
            statuses.append(self.client.post("/api/auth/login", json={"email": "student.test@example.com", "password": password}).status_code)
        self.observe(recovery_status=r.status_code, old_new_login_statuses=statuses)
        self.assertEqual(statuses, [401, 200])

    @case("AUTH-06", "Wrong recovery key returns 401 without changing the password hash.")
    def test_bad_recovery(self):
        self.register()
        before = self.sql("SELECT password_hash FROM users")[0]
        r = self.client.post("/api/auth/recover", json={"email": "student.test@example.com", "recovery_key": "EDUSYNC-AAAA-BBBB-CCCC", "new_password": "NewStudy2026!"})
        self.observe(status=r.status_code, password_unchanged=before == self.sql("SELECT password_hash FROM users")[0])
        self.assertEqual(r.status_code, 401)
        self.assertEqual(before, self.sql("SELECT password_hash FROM users")[0])

    @case("AUTH-07", "All protected route patterns reject a missing bearer token before changing data.")
    def test_protected_routes_without_token(self):
        self.client.headers.pop("Authorization")
        checked = []
        for route_path, methods in self.client.app.openapi()["paths"].items():
            if not route_path.startswith("/api/") or route_path.startswith("/api/auth/") or route_path == "/api/health":
                continue
            path = route_path.replace("{subject_id}", "1").replace("{document_id}", "1")
            for method in methods:
                r = self.client.request(method, path, json={})
                checked.append(f"{method} {path}: {r.status_code}")
                self.assertEqual(r.status_code, 401, checked[-1])
        self.observe(endpoints=checked)
        self.assertGreaterEqual(len(checked), 18)

    @case("AUTH-07", "Malformed, invalid-signature and expired tokens each return 401.")
    def test_invalid_tokens(self):
        now = datetime.now(timezone.utc)
        expired = jwt.encode({"sub": "1", "exp": now - timedelta(minutes=1)}, config.JWT_SECRET, algorithm="HS256")
        tampered = jwt.encode({"sub": "1", "exp": now + timedelta(minutes=1)}, "different-test-signing-secret-123456", algorithm="HS256")
        statuses = [self.client.get("/api/subjects", headers={"Authorization": "Bearer " + t}).status_code
                    for t in ["malformed", expired, tampered]]
        self.observe(statuses=statuses)
        self.assertEqual(statuses, [401, 401, 401])

    @case("SEC-06", "Pre-recovery token should no longer access protected data.", gap=True)
    def test_recovery_revokes_old_session(self):
        key = self.register().json()["recovery_key"]
        self.client.post("/api/auth/recover", json={"email": "student.test@example.com", "recovery_key": key, "new_password": "NewStudy2026!"})
        r = self.client.get("/api/subjects", headers={"Authorization": "Bearer " + self.token})
        self.observe(old_token_status=r.status_code)
        self.assertEqual(r.status_code, 401, "Old token remains authorized after recovery")


class DocumentTests(IsolatedCase):
    @case("DOC-01", "Valid subject created; duplicate is 409; invalid empty and oversized names are 422.")
    def test_subject_validation(self):
        self.subject()
        values = [("Software Engineering", 409), ("", 422), ("x" * 81, 422), ("x" * 80, 201)]
        for name, expected in values:
            r = self.client.post("/api/subjects", json={"name": name})
            self.observe(name_length=len(name), status=r.status_code)
            self.assertEqual(r.status_code, expected)

    @case("DOC-02", "Real PDF extraction yields correct metadata and a byte-identical authenticated file.")
    def test_valid_pdf(self):
        sid = self.subject()
        content = pdf_bytes()
        r = self.upload(sid, content=content)
        self.assertEqual(r.status_code, 201)
        doc = r.json()
        self.assertEqual((doc["page_count"], doc["status"], doc["file_size_bytes"]), (1, "vectorized", len(content)))
        self.assertGreater(doc["chunk_count"], 0)
        file = self.client.get(f"/api/subjects/{sid}/documents/{doc['id']}/file")
        self.assertEqual(file.content, content)
        self.observe(metadata=doc, byte_identical=True, vector_client="contract double")

    @case("DOC-03", "Valid PDFs below/equal to 10 MiB accepted; one byte above returns 413 without writes.")
    def test_file_size_boundaries(self):
        sid = self.subject()
        base = pdf_bytes()
        for delta, expected in [(-1, 201), (0, 201), (1, 413)]:
            size = config.MAX_UPLOAD_BYTES + delta
            payload = base + b" " * (size - len(base))
            before = self.count("documents")
            r = self.upload(sid, name=f"boundary{delta}.pdf", content=payload)
            self.observe(bytes=size, status=r.status_code)
            self.assertEqual(r.status_code, expected, r.text)
            self.assertEqual(self.count("documents"), before + int(expected == 201))
        self.assertFalse(list(self.upload_dir.glob("__tmp_*")))

    @case("DOC-03", "Streaming byte enforcement rejects an oversized UploadFile even without declared size.")
    def test_stream_limit_without_declared_size(self):
        sid = self.subject()
        file = UploadFile(filename="stream.pdf", file=io.BytesIO(b"x" * (config.MAX_UPLOAD_BYTES + 1)), size=None)
        conn = database._connect()
        try:
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(documents.upload_document(sid, file, conn, 1))
            self.assertEqual(caught.exception.status_code, 413)
            self.assertEqual(self.count("documents"), 0)
            self.assertEqual(list(self.upload_dir.iterdir()), [])
            self.observe(status=413, temp_files=0, closed=file.file.closed)
        finally:
            conn.close()

    @case("DOC-04", "Unsupported extension returns 415 with no document/file creation.")
    def test_unsupported_extension(self):
        sid = self.subject()
        r = self.upload(sid, name="bad.txt", content=b"plain text")
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 415)
        self.assertEqual(self.count("documents"), 0)
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    @case("DOC-06", "Malformed PDF leaves no orphan file after failed ingestion.", gap=True)
    def test_corrupt_pdf_cleanup(self):
        sid = self.subject()
        r = self.upload(sid, content=b"not a PDF")
        files = [p.name for p in self.upload_dir.iterdir()]
        self.observe(status=r.status_code, document_rows=self.count("documents"), files=files)
        self.assertGreaterEqual(r.status_code, 400)
        self.assertEqual(files, [], "Failed ingestion left an orphan uploaded file")

    @case("DOC-06", "PDF with no extractable text is not marked vectorized.", gap=True)
    def test_empty_pdf_not_vectorized(self):
        sid = self.subject()
        r = self.upload(sid, content=pdf_bytes(""))
        self.observe(status=r.status_code, body=r.json())
        self.assertFalse(r.status_code == 201 and r.json()["status"] == "vectorized", "Zero-chunk PDF reported successful vectorization")

    @case("DOC-07", "Uploading the same filename does not overwrite the first document silently.", gap=True)
    def test_duplicate_filename_integrity(self):
        sid = self.subject()
        first = pdf_bytes("Version A is a unique original document with enough text to extract.")
        r1 = self.upload(sid, content=first)
        second = self.upload(sid, content=pdf_bytes("Version B has different facts and must not replace A silently."))
        served = self.client.get(f"/api/subjects/{sid}/documents/{r1.json()['id']}/file")
        self.observe(second_status=second.status_code, original_preserved=served.content == first, rows=self.count("documents"))
        self.assertTrue(served.content == first, "Original record now serves the second file")

    @case("DOC-08", "Document deletion removes file, rows and vector entries while preserving a sibling.")
    def test_delete_document(self):
        sid = self.subject()
        did = self.document(sid)
        sibling = self.upload(sid, name="sibling.pdf").json()["id"]
        self.sql("INSERT INTO chat_history(document_id,role,content) VALUES (?, 'user','test')", (did,))
        r = self.client.delete(f"/api/subjects/{sid}/documents/{did}")
        self.assertEqual(r.status_code, 204)
        self.assertEqual(self.count("documents"), 1)
        self.assertEqual(self.count("chat_history"), 0)
        self.assertFalse((self.upload_dir / f"subj{sid}_notes.pdf").exists())
        rows = ingestion.get_collection(sid).rows.values()
        self.assertTrue(all(v[1]["document_id"] == sibling for v in rows))
        self.observe(status=r.status_code, surviving_documents=1, chat_rows=0)

    @case("DOC-09", "Mismatched subject/document cannot be read or deleted; unknown subject upload is 404.")
    def test_id_mismatch(self):
        sid = self.subject()
        other = self.subject("Networks")
        did = self.document(other)
        path = f"/api/subjects/{sid}/documents/{did}"
        statuses = [self.client.get(path + "/file").status_code, self.client.delete(path).status_code,
                    self.client.get(path + "/chat").status_code, self.upload(999).status_code]
        self.observe(statuses=statuses)
        self.assertEqual(statuses, [404] * 4)
        self.assertEqual(self.count("documents"), 1)

    @case("DOC-10", "Upload at already exceeded subject quota must be rejected before ingestion.", gap=True)
    def test_storage_quota(self):
        sid = self.subject()
        with patch.object(documents, "estimate_subject_storage_mb", return_value=101.0):
            r = self.upload(sid)
        self.observe(status=r.status_code, rows=self.count("documents"), simulated_usage_mb=101)
        self.assertIn(r.status_code, [409, 413, 507], "Quota does not prevent another upload")


class IngestionTests(IsolatedCase):
    @case("ING-01", "Chunking honors 800 characters, 120 overlap and removal of <=20-character fragments.")
    def test_chunking(self):
        text = "".join(chr(65 + i % 26) for i in range(2000))
        chunks = ingestion.chunk_text(text)
        self.assertEqual([len(c) for c in chunks], [800, 800, 640])
        self.assertEqual(chunks[0][-120:], chunks[1][:120])
        self.assertEqual(ingestion.chunk_text("x" * 20), [])
        self.assertEqual(ingestion.chunk_text("x" * 21), ["x" * 21])
        self.observe(chunk_lengths=[len(c) for c in chunks], overlap=120)

    @case("ING-02", "Ingestion sends unique IDs and matching document metadata to vector-store contract.")
    def test_metadata(self):
        sid = self.subject()
        did = self.document(sid)
        rows = ingestion.get_collection(sid).rows
        self.assertGreater(len(rows), 0)
        for index, (identifier, (text, metadata)) in enumerate(rows.items()):
            self.assertEqual(identifier, f"doc{did}_chunk{index}")
            self.assertEqual(metadata, {"document_id": did, "filename": "notes.pdf", "chunk_index": index})
            self.assertIn("17 days", text)
        self.observe(chunk_count=len(rows), vector_client="contract double; no embeddings evaluated")

    @case("ING-03", "Retrieval passes subject collection and document filter correctly to vector store.")
    def test_retrieval_scope(self):
        sid = self.subject()
        other = self.subject("Networks")
        did = self.document(sid)
        self.document(other)
        chunks = ingestion.retrieve_relevant_chunks(sid, "Orion", document_ids=[did])
        self.assertTrue(chunks)
        self.assertEqual(ingestion.get_collection(sid).queries[-1]["where"], {"document_id": did})
        self.assertEqual(ingestion.get_collection(other).queries, [])
        self.observe(selected_document=did, other_subject_queries=0)

    @case("ING-04", "Two selected documents receive three retrieval slots each when top_k is five.")
    def test_balanced_retrieval(self):
        col = ingestion.get_collection(1)
        for did in [1, 2]:
            col.add([f"{did}-{i}" for i in range(4)], ["enough content"] * 4,
                    [{"document_id": did, "filename": f"doc{did}.pdf"}] * 4)
        chunks = ingestion.retrieve_relevant_chunks(1, "topic", top_k=5, document_ids=[1, 2])
        self.assertEqual(len(chunks), 6)
        self.assertEqual([q["n_results"] for q in col.queries], [3, 3])
        self.assertEqual({c["filename"] for c in chunks}, {"doc1.pdf", "doc2.pdf"})
        self.observe(returned_chunks=len(chunks), per_document_quota=3)


class QuizMasteryTests(IsolatedCase):
    @case("MST-01", "EWMA returns independently calculated values 28,67,66,65.")
    def test_ewma(self):
        pairs = [(0, 80, 28.0), (60, 80, 67.0), (80, 40, 66.0), (100, 0, 65.0)]
        for previous, latest, expected in pairs:
            actual = mastery.update_mastery(previous, latest)
            self.observe(previous=previous, latest=latest, result=actual)
            self.assertEqual(actual, expected)

    @case("MST-02", "Three perfect attempts produce 35,57.8,72.6 and weakness true,true,false.")
    def test_cold_start(self):
        sid = self.subject()
        rows = [self.submit(sid, "abcda").json() for _ in range(3)]
        self.observe(mastery=[r["mastery_score"] for r in rows], weak=[r["is_weak"] for r in rows])
        self.assertEqual([r["mastery_score"] for r in rows], [35.0, 57.8, 72.6])
        self.assertEqual([r["is_weak"] for r in rows], [True, True, False])
        self.assertEqual(self.count("quiz_history"), 3)
        self.assertEqual(self.count("topics"), 1)

    @case("MST-03", "Weak threshold is strictly below 60; analytics tiers split at 60 and 80.")
    def test_mastery_boundaries(self):
        sid = self.subject()
        for value in [59.9, 60.0, 79.9, 80.0]:
            self.assertEqual(mastery.is_weak_topic(value), value < 60)
            self.sql("INSERT INTO topics(subject_id,name,mastery_score,is_weak) VALUES (?,?,?,?)", (sid, str(value), value, int(value < 60)))
        r = self.client.get("/api/analytics/overview").json()
        self.observe(weak=r["weak_count"], good=r["good_count"], strong=r["strong_count"])
        self.assertEqual((r["weak_count"], r["good_count"], r["strong_count"]), (1, 2, 1))

    @case("MST-04", "Same named topics in different subjects remain independent.")
    def test_topic_isolation(self):
        sid = self.subject()
        other = self.subject("Networks")
        self.submit(sid, "abcda", "Shared")
        self.submit(other, "xxxxx", "Shared")
        self.submit(sid, "abcda", "Shared")
        rows = self.sql("SELECT subject_id,mastery_score FROM topics ORDER BY subject_id")
        self.observe(rows=rows)
        self.assertEqual([r["mastery_score"] for r in rows], [57.8, 0.0])

    @case("MST-06", "Database failure after mastery update rolls back both mastery and history.")
    def test_submission_rollback(self):
        sid = self.subject()
        self.submit(sid)
        before = self.sql("SELECT mastery_score FROM topics")
        self.sql("CREATE TRIGGER fail_history BEFORE INSERT ON quiz_history BEGIN SELECT RAISE(ABORT, 'injected failure'); END")
        r = self.submit(sid, "abcda")
        self.observe(status=r.status_code, mastery_unchanged=before == self.sql("SELECT mastery_score FROM topics"), history_count=self.count("quiz_history"))
        self.assertEqual(r.status_code, 500)
        self.assertEqual(before, self.sql("SELECT mastery_score FROM topics"))
        self.assertEqual(self.count("quiz_history"), 1)

    @case("QUIZ-06", "Four correct or four correct plus blank yield 80%; empty list returns 400.")
    def test_grading(self):
        sid = self.subject()
        for selected in ["abcdb", "abcd "]:
            r = self.submit(sid, selected)
            self.observe(result=r.json())
            self.assertEqual(r.status_code, 200)
            self.assertEqual((r.json()["score"], r.json()["correct_count"], r.json()["total_count"]), (80.0, 4, 5))
        r = self.client.post("/api/quiz/submit", json={"subject_id": sid, "topic": "Empty", "answers": []})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.count("quiz_history"), 2)

    @case("QUIZ-02", "Question counts outside 1-20 return 422 before inference.")
    def test_question_count_validation(self):
        with patch.object(quiz, "generate_quiz") as generate:
            for n in [0, 21]:
                r = self.client.post("/api/quiz/generate", json={"subject_id": 1, "topic": "x", "num_questions": n})
                self.observe(count=n, status=r.status_code)
                self.assertEqual(r.status_code, 422)
            generate.assert_not_called()

    @case("QUIZ-02", "Unsupported difficulty is rejected before generation.", gap=True)
    def test_invalid_difficulty(self):
        with patch.object(quiz, "generate_quiz", return_value={"questions": []}):
            r = self.client.post("/api/quiz/generate", json={"subject_id": 1, "topic": "x", "difficulty": "Impossible"})
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 422, "Arbitrary difficulty accepted")

    @case("QUIZ-03", "Five questions across two selected documents allocate three and two calls' questions.")
    def test_quiz_allocation(self):
        def batch(**kw):
            return [{"source_document": str(kw["doc_id"])} for _ in range(kw["doc_num_questions"])]
        with patch.object(rag, "_require_client", return_value=Mock()), patch.object(rag, "_generate_questions_for_single_doc", side_effect=batch):
            result = rag.generate_quiz(1, "topic", 5, "Mixed", [10, 20])
        sources = [q["source_document"] for q in result["questions"]]
        self.observe(source_ids=sources)
        self.assertEqual(sources, ["10", "10", "10", "20", "20"])

    @case("QUIZ-07", "A fabricated client-only quiz/key cannot be accepted as a verified assessment.", gap=True)
    def test_forged_score(self):
        sid = self.subject()
        payload = {"subject_id": sid, "topic": "Forged", "answers": [{"question_index": 0, "selected_option_id": "z", "correct_option_id": "z"}]}
        r = self.client.post("/api/quiz/submit", json=payload)
        self.observe(status=r.status_code, body=r.json())
        self.assertIn(r.status_code, [400, 404, 422], "Ungenerated question and forged answer key earned a score")

    @case("QUIZ-07", "Replaying one logical attempt does not inflate history or mastery.", gap=True)
    def test_submission_replay(self):
        sid = self.subject()
        self.submit(sid)
        self.submit(sid)
        self.observe(history_count=self.count("quiz_history"), topic=self.sql("SELECT mastery_score FROM topics"))
        self.assertEqual(self.count("quiz_history"), 1, "No attempt identity or idempotency protection")


class QueryAnalyticsTests(IsolatedCase):
    @case("RAG-07", "Successful Q&A saves ordered user/assistant records and exact sources; clear removes both.")
    def test_chat_persistence(self):
        sid = self.subject()
        did = self.document(sid)
        answer = {"answer": "17 days", "sources": [{"document": "notes.pdf", "snippet": "17 days", "score": 0.9}]}
        with patch.object(query, "answer_question", return_value=answer) as call:
            r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "How long?"})
            call.assert_called_once_with(sid, "How long?", document_ids=[did])
        self.assertEqual(r.json(), answer)
        path = f"/api/subjects/{sid}/documents/{did}/chat"
        history = self.client.get(path).json()
        self.assertEqual([r["role"] for r in history], ["user", "assistant"])
        self.assertEqual(history[1]["sources"], answer["sources"])
        self.assertEqual(self.client.delete(path).status_code, 204)
        self.assertEqual(self.client.get(path).json(), [])
        self.observe(saved_roles=[r["role"] for r in history], cleared=True, model="mocked")

    @case("RAG-06", "Provider exception produces controlled 502 and no partial saved chat.")
    def test_provider_failure(self):
        sid = self.subject()
        did = self.document(sid)
        with patch.object(query, "answer_question", side_effect=ValueError("synthetic provider error")):
            r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "How long?"})
        self.observe(status=r.status_code, chat_rows=self.count("chat_history"))
        self.assertEqual(r.status_code, 502)
        self.assertEqual(self.count("chat_history"), 0)

    @case("DEP-03", "Missing provider key yields 503; local endpoints remain available.")
    def test_missing_provider_key(self):
        sid = self.subject()
        did = self.document(sid)
        r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "How long?"})
        q = self.client.post("/api/quiz/generate", json={"subject_id": sid, "topic": "topic"})
        self.observe(query_status=r.status_code, quiz_status=q.status_code)
        self.assertEqual((r.status_code, q.status_code), (503, 503))
        self.assertEqual(self.client.get("/api/subjects").status_code, 200)

    @case("RAG-05", "Question schema rejects length 0/2001 and permits length 1/2000.")
    def test_question_boundaries(self):
        sid = self.subject()
        did = self.document(sid)
        with patch.object(query, "answer_question", return_value={"answer": "mock", "sources": []}):
            for size, expected in [(0, 422), (1, 200), (2000, 200), (2001, 422)]:
                r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "x" * size})
                self.observe(length=size, status=r.status_code)
                self.assertEqual(r.status_code, expected)

    @case("RAG-07", "RAG constructs a grounded two-message request without previous chat turns.")
    def test_prompt_construction(self):
        client = Mock()
        client.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="17 days"))])
        chunks = [{"text": "The Orion cycle lasts 17 days.", "filename": "notes.pdf", "score": 0.9}]
        with patch.object(rag, "_require_client", return_value=client), patch.object(rag, "retrieve_relevant_chunks", return_value=chunks):
            result = rag.answer_question(1, "How long?", [1])
        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertEqual([m["role"] for m in kwargs["messages"]], ["system", "user"])
        self.assertIn("17 days", kwargs["messages"][1]["content"])
        self.assertIn("notes.pdf", kwargs["messages"][1]["content"])
        self.assertEqual(kwargs["temperature"], 0.2)
        self.assertEqual(result["sources"][0]["document"], "notes.pdf")
        self.observe(message_roles=[m["role"] for m in kwargs["messages"]], temperature=kwargs["temperature"], cloud="mocked")

    @case("ANA-01", "Mastery average and quiz-score average are computed independently.")
    def test_analytics_aggregation(self):
        sid = self.subject()
        for i, score in enumerate([35, 60, 85]):
            self.sql("INSERT INTO topics(subject_id,name,mastery_score,is_weak) VALUES (?,?,?,?)", (sid, f"Topic {i}", score, int(score < 60)))
        topic = self.sql("SELECT id FROM topics ORDER BY id")[0]["id"]
        for score, correct in [(80, 4), (100, 5)]:
            self.sql("INSERT INTO quiz_history(topic_id,score,correct_count,total_count) VALUES (?,?,?,5)", (topic, score, correct))
        dashboard = self.client.get("/api/analytics/dashboard").json()
        overview = self.client.get("/api/analytics/overview").json()
        self.observe(overall_mastery=dashboard["overall_mastery"], average_quiz=overview["average_quiz_score"])
        self.assertEqual(dashboard["overall_mastery"], 60)
        self.assertEqual(overview["average_quiz_score"], 90)
        self.assertEqual([overview[k] for k in ["weak_count", "good_count", "strong_count"]], [1, 1, 1])

    @case("ANA-02", "Empty analytics contain zeros; weak list returns the ten lowest scores in order.")
    def test_empty_and_ranked_analytics(self):
        empty = self.client.get("/api/analytics/overview").json()
        self.assertEqual(empty["total_quizzes_taken"], 0)
        self.assertEqual(empty["average_quiz_score"], 0)
        sid = self.subject()
        for i in range(12):
            self.sql("INSERT INTO topics(subject_id,name,mastery_score,is_weak) VALUES (?,?,?,1)", (sid, f"Topic {i}", i))
        rows = self.client.get("/api/analytics/dashboard").json()["weak_topics"]
        self.assertEqual([r["mastery_score"] for r in rows], list(range(10)))
        self.observe(returned_weak_topics=len(rows), seeded_weak_topics=12)

    @case("ANA-03", "Study time equals logged seconds plus quiz/chat estimates; invalid durations rejected.")
    def test_study_time(self):
        sid = self.subject()
        did = self.document(sid)
        self.submit(sid)
        self.sql("INSERT INTO study_sessions(subject_id,document_id,duration_seconds) VALUES (?,?,120)", (sid, did))
        for _ in range(2):
            self.sql("INSERT INTO chat_history(document_id,role,content) VALUES (?,'user','question')", (did,))
        total = self.client.get("/api/analytics/dashboard").json()["study_time_minutes"]
        self.assertEqual(total, 6)
        for seconds in [0, 3601]:
            self.assertEqual(self.client.post("/api/analytics/study-time", json={"duration_seconds": seconds}).status_code, 422)
        self.observe(minutes=total, calculation="(120 + 150 + 2*45) / 60")

    @case("DATA-02", "Cache clearing removes chat/session rows but preserves documents, topics and quiz history.")
    def test_clear_cache(self):
        sid = self.subject()
        did = self.document(sid)
        self.submit(sid)
        self.sql("INSERT INTO study_sessions(duration_seconds) VALUES (30)")
        self.sql("INSERT INTO chat_history(document_id,role,content) VALUES (?,'user','question')", (did,))
        r = self.client.delete("/api/data/cache")
        counts = {t: self.count(t) for t in ["documents", "topics", "quiz_history", "chat_history", "study_sessions"]}
        self.observe(status=r.status_code, counts=counts)
        self.assertEqual(counts, {"documents": 1, "topics": 1, "quiz_history": 1, "chat_history": 0, "study_sessions": 0})

    @case("SEC-01", "Allowed origin receives CORS permission while an unapproved origin does not.")
    def test_cors_policy(self):
        for origin, expected in [("http://localhost:3000", 200), ("http://example.invalid", 400)]:
            r = self.client.options("/api/subjects", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
            self.observe(origin=origin, status=r.status_code)
            self.assertEqual(r.status_code, expected)
            if expected == 400:
                self.assertNotIn("access-control-allow-origin", r.headers)

    @case("SEC-04", "SQL-looking subject text is stored literally without damaging tables.")
    def test_sql_literal(self):
        name = "'; DROP TABLE topics; --"
        sid = self.subject(name)
        self.assertEqual(self.sql("SELECT name FROM subjects WHERE id=?", (sid,))[0]["name"], name)
        self.assertEqual(self.count("topics"), 0)
        self.observe(literal_preserved=True, topics_table_exists=True)

    @case("DEP-02", "SQLite initialization does not erase existing subjects or quiz attempts.")
    def test_database_reinitialization(self):
        sid = self.subject()
        self.submit(sid)
        before = self.sql("SELECT mastery_score FROM topics")
        database.init_db()
        self.assertEqual(self.count("subjects"), 1)
        self.assertEqual(self.count("quiz_history"), 1)
        self.assertEqual(before, self.sql("SELECT mastery_score FROM topics"))
        self.observe(subjects=1, history=1, mastery_preserved=True, scope="SQLite only; not full app restart")
