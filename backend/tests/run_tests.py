"""Run from any directory: python backend/tests/run_tests.py.

Writes a reproducible JSON evidence register and JUnit XML. Exits nonzero for
real failures, including known-gap acceptance checks; never masks them as passes.
"""
import argparse
import hashlib
import importlib.metadata
import json
import platform
import subprocess
import sys
import time
import unittest
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
sys.dont_write_bytecode = True


class EvidenceResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def startTest(self, test):
        super().startTest(test)
        self.started = time.perf_counter()

    def record(self, test, status, detail=""):
        fn = getattr(test, test._testMethodName)
        # A cleanup error can follow a failed assertion. Preserve one outcome per
        # method while retaining both diagnostic messages.
        prior = next((r for r in self.records if r["test"] == test.id()), None)
        if prior:
            prior["status"] = "Error" if status == "Error" else prior["status"]
            prior["detail"] += "\n" + detail
            return
        self.records.append({"test": test.id(), "plan_id": getattr(fn, "plan_id", "UNMAPPED"),
            "description": test._testMethodName.removeprefix("test_").replace("_", " "),
            "expected": getattr(fn, "expected", ""), "gap_check": getattr(fn, "gap_check", False),
            "status": status, "duration_seconds": round(time.perf_counter() - self.started, 4),
            "observations": getattr(test, "observations", []), "detail": detail})

    def addSuccess(self, test):
        super().addSuccess(test)
        self.record(test, "Pass")

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.record(test, "Fail", self._exc_info_to_string(err, test))

    def addError(self, test, err):
        super().addError(test, err)
        self.record(test, "Error", self._exc_info_to_string(err, test))

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.record(test, "Skipped", reason)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / "docs/testing/results")
    args = parser.parse_args()
    suite = unittest.defaultTestLoader.discover(str(BACKEND / "tests"), pattern="test_*.py", top_level_dir=str(BACKEND))
    started = datetime.now(timezone.utc).isoformat()
    result = unittest.TextTestRunner(verbosity=2, resultclass=EvidenceResult).run(suite)
    versions = {}
    for package in ["fastapi", "starlette", "httpx", "pydantic", "bcrypt", "PyJWT", "PyMuPDF", "langchain-text-splitters"]:
        versions[package] = importlib.metadata.version(package)
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    except (OSError, subprocess.CalledProcessError):
        commit = "unavailable"
    hashes = {str(p.relative_to(ROOT)).replace("\\", "/"): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted((BACKEND / "app").rglob("*.py"))}
    payload = {"started_utc": started, "completed_utc": datetime.now(timezone.utc).isoformat(),
               "commit": commit, "python": sys.version.split()[0], "platform": platform.platform(),
               "dependencies": versions, "source_sha256": hashes,
               "scope": "Real FastAPI/SQLite/bcrypt/PDF/splitter/mastery; mocked cloud and vector-store contract. No browser or model-quality validation.",
               "summary": {s: sum(r["status"] == s for r in result.records) for s in ["Pass", "Fail", "Error", "Skipped"]},
               "records": result.records}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "deterministic_results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    xml = ET.Element("testsuite", name="EduSync deterministic tests", tests=str(result.testsRun),
                     failures=str(len(result.failures)), errors=str(len(result.errors)), skipped=str(len(result.skipped)))
    for record in result.records:
        node = ET.SubElement(xml, "testcase", name=record["test"], classname=record["plan_id"], time=str(record["duration_seconds"]))
        if record["status"] in {"Fail", "Error"}:
            ET.SubElement(node, "failure" if record["status"] == "Fail" else "error").text = record["detail"]
        elif record["status"] == "Skipped":
            ET.SubElement(node, "skipped").text = record["detail"]
        ET.SubElement(node, "system-out").text = json.dumps(record["observations"])
    ET.ElementTree(xml).write(args.output_dir / "deterministic_results.xml", encoding="utf-8", xml_declaration=True)
    print("Evidence:", args.output_dir)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
