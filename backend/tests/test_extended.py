"""Additional planned acceptance checks. All storage is supplied by IsolatedCase."""
import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pymupdf

from tests.support import IsolatedCase, case, data, documents, ingestion, pdf_bytes, query, quiz, rag


def question():
    return {"question": "How many days?", "source_document": "notes.pdf",
            "options": [{"id": x, "text": str(n)} for x, n in zip("abcd", [17, 18, 19, 20])],
            "correct_option_id": "a", "explanation": "The notes specify 17 days."}


class ExtendedTests(IsolatedCase):
    @case("DEP-01", "Health and OpenAPI endpoints respond in the isolated installed environment.")
    def test_health_docs(self):
        statuses = [self.client.get(p).status_code for p in ["/api/health", "/docs", "/openapi.json"]]
        self.observe(statuses=statuses, scope="Installed environment, not clean installation")
        self.assertEqual(statuses, [200, 200, 200])

    @case("AUTH-08", "Password verification returns only valid=true, never recovery key or token.")
    def test_recovery_reminder_api(self):
        self.register()
        a = self.client.post("/api/auth/verify-password", json={"email": "student.test@example.com", "password": "wrong"})
        b = self.client.post("/api/auth/verify-password", json={"email": "student.test@example.com", "password": "StudyTest2026!"})
        self.observe(wrong=a.status_code, correct=b.status_code, response=b.json())
        self.assertEqual(a.status_code, 401)
        self.assertEqual(b.json(), {"valid": True})

    @case("AUTH-06", "Unknown recovery email and short replacement password do not change credentials.")
    def test_other_invalid_recovery(self):
        key = self.register().json()["recovery_key"]
        before = self.sql("SELECT password_hash FROM users")
        statuses = []
        for email, password in [("missing@example.com", "NewStudy2026!"), ("student.test@example.com", "short")]:
            r = self.client.post("/api/auth/recover", json={"email": email, "recovery_key": key, "new_password": password})
            statuses.append(r.status_code)
        self.observe(statuses=statuses, unchanged=before == self.sql("SELECT password_hash FROM users"))
        self.assertEqual(statuses, [401, 422])
        self.assertEqual(before, self.sql("SELECT password_hash FROM users"))

    @case("DOC-01", "Whitespace-only subject name is rejected.", gap=True)
    def test_blank_subject(self):
        r = self.client.post("/api/subjects", json={"name": "   "})
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 422)

    @case("DOC-04", "Valid PDF with text/plain MIME is handled consistently by content extraction.")
    def test_pdf_mime_mismatch(self):
        sid = self.subject()
        r = self.client.post(f"/api/subjects/{sid}/documents", files={"file": ("plain.pdf", pdf_bytes(), "text/plain")})
        self.observe(status=r.status_code, policy="Extension and parser; MIME allowlist not enforced")
        self.assertEqual(r.status_code, 201)
        self.assertGreater(r.json()["chunk_count"], 0)

    @case("DOC-05", "Original FYP1 requirement accepts a valid native-text PPTX.", gap=True)
    def test_promised_pptx(self):
        content = (Path(__file__).parent / "fixtures/CourseSlides.pptx").read_bytes()
        r = self.upload(self.subject(), "CourseSlides.pptx", content)
        self.observe(status=r.status_code, bytes=len(content), body=r.json())
        self.assertEqual(r.status_code, 201)

    @case("DOC-06", "Encrypted PDF is rejected without leaving an orphan file.", gap=True)
    def test_encrypted_pdf(self):
        with pymupdf.open(stream=pdf_bytes(), filetype="pdf") as doc:
            content = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="reader")
        r = self.upload(self.subject(), "encrypted.pdf", content)
        self.observe(status=r.status_code, files=[p.name for p in self.upload_dir.iterdir()], rows=self.count("documents"))
        self.assertIn(r.status_code, [400, 415, 422])
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    @case("DOC-06", "A zero-byte PDF is rejected cleanly without residual files.", gap=True)
    def test_zero_byte_pdf(self):
        r = self.upload(self.subject(), "zero.pdf", b"")
        self.observe(status=r.status_code, files=[p.name for p in self.upload_dir.iterdir()])
        self.assertIn(r.status_code, [400, 415, 422])
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    @case("DOC-08", "Deleting a subject cascades its data and preserves another subject.")
    def test_subject_cascade(self):
        sid, other = self.subject(), self.subject("Networks")
        did, other_did = self.document(sid), self.document(other)
        self.submit(sid)
        self.sql("INSERT INTO chat_history (document_id,role,content) VALUES (?, 'user', 'test')", (did,))
        r = self.client.delete(f"/api/subjects/{sid}")
        remaining = self.sql("SELECT subject_id FROM documents")
        self.observe(status=r.status_code, documents=remaining, topics=self.count("topics"), history=self.count("quiz_history"), chat=self.count("chat_history"))
        self.assertEqual(r.status_code, 204)
        self.assertEqual(remaining, [{"subject_id": other}])
        self.assertEqual(self.count("topics") + self.count("quiz_history") + self.count("chat_history"), 0)
        self.assertEqual(self.client.get(f"/api/subjects/{other}/documents/{other_did}/file").status_code, 200)

    @case("DOC-09", "Quiz submission for a nonexistent subject yields controlled 4xx without writes.", gap=True)
    def test_quiz_unknown_subject(self):
        r = self.submit(99999)
        self.observe(status=r.status_code, history=self.count("quiz_history"))
        self.assertIn(r.status_code, [400, 404, 422])
        self.assertEqual(self.count("quiz_history"), 0)

    @case("DATA-01", "Storage totals equal independently measured files without counting database twice.")
    def test_storage_accounting(self):
        (self.upload_dir / "fixture.bin").write_bytes(b"x" * 1234)
        (self.vector_dir / "fixture.bin").write_bytes(b"x" * 2345)
        expected = sum(p.stat().st_size for p in self.root.rglob("*") if p.is_file())
        body = self.client.get("/api/data/storage").json()
        self.observe(body=body, independently_measured_bytes=expected)
        self.assertEqual(body["total_bytes"], expected)
        self.assertEqual(body["database_bytes"] + body["uploads_bytes"] + body["vector_store_bytes"], expected)
        self.assertEqual(body["limit_bytes"], 5 * 1024 ** 3)

    @case("DATA-03", "Factory reset deletes rows/files and supports re-registration and immediate upload.", gap=True)
    def test_factory_reset_reuse(self):
        self.register()
        sid = self.subject()
        self.document(sid)
        self.submit(sid)
        # Verify recursive deletion targets stay inside this test's disposable root.
        for target in [data.DATA_DIR, data.CHROMA_DIR]:
            self.assertTrue(target.resolve().is_relative_to(self.root))
        r = self.client.delete("/api/data/all")
        counts = {t: self.count(t) for t in ["users", "subjects", "documents", "topics", "quiz_history"]}
        registration = self.register()
        new_sid = self.subject("After reset")
        upload = self.upload(new_sid)
        self.observe(reset=r.status_code, counts=counts, registration=registration.status_code, next_upload=upload.status_code,
                     upload_directory_exists=self.upload_dir.exists(), vectors="contract double; physical Chroma reset not validated")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(all(v == 0 for v in counts.values()))
        self.assertEqual(registration.status_code, 201)
        self.assertEqual(upload.status_code, 201)

    @case("SEC-06", "Tokens from before factory reset cannot access the replacement account.", gap=True)
    def test_reset_token_revocation(self):
        self.register()
        for target in [data.DATA_DIR, data.CHROMA_DIR]:
            self.assertTrue(target.resolve().is_relative_to(self.root))
        self.assertEqual(self.client.delete("/api/data/all").status_code, 200)
        self.register(email="replacement@example.com")
        r = self.client.get("/api/subjects")
        self.observe(old_token_status=r.status_code)
        self.assertEqual(r.status_code, 401)

    @case("SEC-05", "Traversal upload is rejected cleanly or safely normalized; adjacent sentinel is unchanged.", gap=True)
    def test_traversal_filename(self):
        sentinel = self.data_dir / "outside.pdf"
        sentinel.write_bytes(b"sentinel")
        sid = self.subject()
        results = []
        for name in ["../outside.pdf", "nested/../../outside.pdf", r"nested\..\..\outside.pdf", "C:/outside.pdf"]:
            r = self.upload(sid, name, pdf_bytes())
            results.append({"filename": name, "status": r.status_code})
        self.observe(inputs=results, sentinel_unchanged=sentinel.read_bytes() == b"sentinel", sentinel_location="data/outside.pdf adjacent to uploads", files_outside_uploads=[p.name for p in self.data_dir.iterdir() if p.is_file() and p != self.db_path])
        self.assertEqual(sentinel.read_bytes(), b"sentinel")
        self.assertTrue(all(r["status"] in [201, 400, 415, 422] for r in results), "Traversal inputs cause uncontrolled server errors")

    @case("SEC-02", "Authentication stores bcrypt hashes and API responses do not expose stored hashes or recovery key after registration.")
    def test_credential_exposure(self):
        from tests.support import security
        response = self.register()
        recovery_key = response.json()["recovery_key"]
        row = self.sql("SELECT password_hash,recovery_key_hash FROM users")[0]
        verified = security.verify_secret("StudyTest2026!", row["password_hash"]) and security.verify_secret(recovery_key, row["recovery_key_hash"])
        replies = [self.client.get("/api/auth/status").text, self.client.get("/api/subjects").text,
                   self.client.post("/api/auth/login", json={"email": "student.test@example.com", "password": "StudyTest2026!"}).text]
        leaked = any(secret in reply for secret in [recovery_key, row["password_hash"], row["recovery_key_hash"], "StudyTest2026!"] for reply in replies)
        self.observe(bcrypt_verified=verified, secrets_in_sampled_responses=leaked, scope="Test fixture only; production JWT configuration and durable logs not audited")
        self.assertTrue(verified)
        self.assertFalse(leaked)

    @case("RAG-05", "Whitespace-only questions are rejected before inference.", gap=True)
    def test_blank_question(self):
        sid = self.subject()
        did = self.document(sid)
        with patch.object(query, "answer_question", return_value={"answer": "mock", "sources": []}) as call:
            r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "   "})
        self.observe(status=r.status_code, inference_calls=call.call_count)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(call.call_count, 0)

    @case("RAG-06", "Empty provider completion is rejected without saving a false successful conversation.", gap=True)
    def test_empty_completion(self):
        sid = self.subject()
        did = self.document(sid)
        with patch.object(query, "answer_question", return_value={"answer": "", "sources": []}):
            r = self.client.post("/api/query", json={"subject_id": sid, "document_id": did, "question": "Orion?"})
        self.observe(status=r.status_code, chat_rows=self.count("chat_history"))
        self.assertEqual(r.status_code, 502)
        self.assertEqual(self.count("chat_history"), 0)

    @case("QUIZ-04", "Malformed JSON returns a controlled 502.")
    def test_quiz_invalid_json(self):
        fake = Mock()
        fake.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content="not JSON"))])
        with patch.object(rag, "_client", fake):
            r = self.client.post("/api/quiz/generate", json={"subject_id": self.subject(), "topic": "Orion"})
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 502)

    @case("QUIZ-04", "Missing generated fields produce controlled 502, not an unhandled server error.", gap=True)
    def test_quiz_missing_fields(self):
        with patch.object(quiz, "generate_quiz", return_value={"questions": [{"question": "Incomplete"}]}):
            r = self.client.post("/api/quiz/generate", json={"subject_id": self.subject(), "topic": "Orion"})
        self.observe(status=r.status_code)
        self.assertEqual(r.status_code, 502)

    @case("QUIZ-04", "Key outside options and duplicate options are rejected.", gap=True)
    def test_quiz_invalid_options(self):
        q = question()
        q["correct_option_id"] = "z"
        q["options"] = [{"id": "a", "text": "same"}] * 4
        with patch.object(quiz, "generate_quiz", return_value={"questions": [q]}):
            r = self.client.post("/api/quiz/generate", json={"subject_id": self.subject(), "topic": "Orion", "num_questions": 1})
        self.observe(status=r.status_code, generated=r.json())
        self.assertEqual(r.status_code, 502)

    @case("QUIZ-04", "Short generation is rejected or explicitly labelled partial, not silently returned as complete.", gap=True)
    def test_quiz_short_generation(self):
        with patch.object(quiz, "generate_quiz", return_value={"questions": [question()]}):
            r = self.client.post("/api/quiz/generate", json={"subject_id": self.subject(), "topic": "Orion", "num_questions": 5})
        self.observe(status=r.status_code, requested=5, returned=len(r.json().get("questions", [])), partial=r.json().get("partial"))
        self.assertTrue(r.status_code == 502 or r.json().get("partial") is True)

    @case("QUIZ-07", "Duplicate question indices must not create an inflated assessment.", gap=True)
    def test_duplicate_question_indices(self):
        answer = {"question_index": 0, "selected_option_id": "a", "correct_option_id": "a"}
        r = self.client.post("/api/quiz/submit", json={"subject_id": self.subject(), "topic": "Orion", "answers": [answer, answer]})
        self.observe(status=r.status_code, result=r.json())
        self.assertIn(r.status_code, [400, 404, 422])

    @case("PERF-04", "Injected upload write failure yields controlled error with no residue; subsequent upload succeeds.", gap=True)
    def test_write_failure(self):
        sid = self.subject()
        with patch("builtins.open", side_effect=OSError("Synthetic disk write failure")):
            r = self.upload(sid)
        files = [p.name for p in self.upload_dir.iterdir()]
        retry = self.upload(sid)
        self.observe(failure_status=r.status_code, files_after_failure=files, retry=retry.status_code)
        self.assertEqual(retry.status_code, 201)
        self.assertEqual(files, [])
        self.assertIn(r.status_code, [400, 503, 507])

    @case("PERF-04", "Failure after vector insertion does not leave orphan vectors/files.", gap=True)
    def test_partial_ingestion_failure(self):
        sid = self.subject()
        original = documents.ingest_document
        def fail_after_insert(*args):
            original(*args)
            raise OSError("Synthetic interruption after vector write")
        with patch.object(documents, "ingest_document", side_effect=fail_after_insert):
            r = self.upload(sid)
        self.observe(status=r.status_code, rows=self.count("documents"), files=[p.name for p in self.upload_dir.iterdir()], vectors=ingestion.get_collection(sid).count(), fault="Exception, not OS process termination")
        self.assertEqual(self.count("documents"), 0)
        self.assertEqual(ingestion.get_collection(sid).count(), 0)
        self.assertEqual(list(self.upload_dir.iterdir()), [])
