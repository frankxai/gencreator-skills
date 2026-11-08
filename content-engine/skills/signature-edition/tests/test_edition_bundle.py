import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bundle", ROOT / "scripts/edition_bundle.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class BundleTests(unittest.TestCase):
    def inputs(self):
        edition = bundle.load_json((ROOT / "examples/edition.json").read_text(encoding="utf-8"))
        brief = bundle.load_json((ROOT / "examples/brief.json").read_text(encoding="utf-8"))
        return edition, brief

    def test_export_and_verify_preserve_the_finished_work(self):
        edition, brief = self.inputs()
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "edition.zip"
            result = bundle.export(edition, brief, p)
            self.assertEqual(result["publication_state"], "draft")
            self.assertEqual(bundle.verify(p)["status"], "verified")
            with zipfile.ZipFile(p) as z:
                self.assertEqual(z.read("source.md").decode(), edition["source"]["text"])
                for a in edition["artifacts"]:
                    self.assertIn(a["content"], z.read("assets/" + a["id"] + ".md").decode())
                self.assertFalse(json.loads(z.read("review.json"))["human_identity_verified"])

    def test_repeated_exports_are_identical(self):
        edition, brief = self.inputs()
        with tempfile.TemporaryDirectory() as folder:
            a, b = [Path(folder) / x for x in ("a.zip", "b.zip")]
            bundle.export(edition, brief, a)
            bundle.export(edition, brief, b)
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_existing_work_is_not_overwritten(self):
        edition, brief = self.inputs()
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "existing.zip"
            p.write_bytes(b"existing work")
            with self.assertRaises(ValueError):
                bundle.export(edition, brief, p)
            self.assertEqual(p.read_bytes(), b"existing work")

    def test_bad_source_span_is_rejected(self):
        edition, brief = self.inputs()
        edition["artifacts"][0]["evidence"][0]["quote"] += " invented"
        with self.assertRaises(ValueError):
            bundle.check(edition, brief)

    def test_edit_invalidates_an_existing_content_confirmation(self):
        edition, brief = self.inputs()
        edition["confirmations"] = [
            {"id": a["id"], "digest": a["digest"]}
            for a in bundle.core.review(edition)["artifacts"]
        ]
        self.assertEqual(bundle.core.review(edition)["state"], "content_confirmed")
        edition["artifacts"][0]["content"] += "\nChanged."
        with self.assertRaises(ValueError):
            bundle.check(edition, brief)

    def test_unknown_rights_remain_an_unconfirmed_private_draft(self):
        edition, brief = self.inputs()
        edition["source"]["rights"] = "unknown"
        result = bundle.check(edition, brief)
        self.assertEqual(result["publication_state"], "draft")
        self.assertEqual(result["edition"]["state"], "draft")

    def test_direction_wording_cannot_change_on_only_one_axis(self):
        edition, brief = self.inputs()
        for axis in bundle.AXES:
            brief["directions"][1][axis] = brief["directions"][0][axis]
        brief["directions"][1]["language"] = "One changed field."
        with self.assertRaises(ValueError):
            bundle.check(edition, brief)

    def test_duplicate_json_and_nonfinite_numbers_fail(self):
        for raw in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.assertRaises(ValueError):
                bundle.load_json(raw)

    def test_modified_artifact_is_detected(self):
        edition, brief = self.inputs()
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "a.zip"
            bundle.export(edition, brief, p)
            with zipfile.ZipFile(p) as z:
                files = {n: z.read(n) for n in z.namelist()}
            files["assets/the-pencil-line.md"] += b"\nchanged"
            bad = Path(folder) / "bad.zip"
            with zipfile.ZipFile(bad, "w") as z:
                for name, raw in files.items():
                    z.writestr(name, raw)
            with self.assertRaises(ValueError):
                bundle.verify(bad)

    def test_traversal_and_duplicate_members_are_rejected(self):
        import warnings
        for names in [("../outside",), ("same", "same")]:
            with self.subTest(names=names), tempfile.TemporaryDirectory() as folder:
                p = Path(folder) / "bad.zip"
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", UserWarning)
                    with zipfile.ZipFile(p, "w") as z:
                        for n in names:
                            z.writestr(n, "untrusted")
                with self.assertRaises(ValueError):
                    bundle.verify(p)

    def test_cli_delivers_and_reads_back_an_actual_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / "cli.zip"
            cmd = [sys.executable, "-B", str(ROOT / "scripts/edition_bundle.py")]
            result = subprocess.run(cmd + ["export", "--edition", str(ROOT / "examples/edition.json"),
                "--brief", str(ROOT / "examples/brief.json"), "--output", str(p)],
                capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run(cmd + ["verify", str(p)], capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["status"], "verified")

    def test_web_transfer_reindexes_source_and_preserves_the_original(self):
        edition, _ = self.inputs()
        edition["source"]["text"] = "  \n" + edition["source"]["text"] + " \n"
        for a in edition["artifacts"]:
            for span in a["evidence"]:
                span["start"] += 3
                span["end"] += 3
        original = copy.deepcopy(edition)
        edition["confirmations"] = [{"id": a["id"], "digest": a["digest"]}
                                   for a in bundle.core.review(edition)["artifacts"]]
        transferred = bundle.prepare_web(edition)
        self.assertEqual(transferred["confirmations"], [])
        self.assertEqual(transferred["source"]["text"], original["source"]["text"].strip())
        self.assertEqual(edition["source"]["text"], original["source"]["text"])
        self.assertEqual(transferred["artifacts"][0]["content"], edition["artifacts"][0]["content"])
        self.assertEqual(bundle.core.review(transferred)["state"], "draft")

    def test_web_transfer_refuses_unsupported_or_duplicate_formats(self):
        for change in ("unsupported", "duplicate"):
            edition, _ = self.inputs()
            if change == "unsupported":
                edition["artifacts"][0]["channel"] = "visual-brief"
            else:
                edition["artifacts"][0]["channel"] = edition["artifacts"][1]["channel"]
            before = copy.deepcopy(edition)
            with self.assertRaises(ValueError):
                bundle.prepare_web(edition)
            self.assertEqual(edition, before)

    def test_web_transfer_keeps_existing_output_on_cli_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "keep.json"
            output.write_text("existing work")
            r = subprocess.run([sys.executable, "-B", str(ROOT / "scripts/edition_bundle.py"),
                "prepare-web", "--edition", str(ROOT / "examples/edition.json"),
                "--output", str(output)], capture_output=True, timeout=15)
            self.assertEqual(r.returncode, 2)
            self.assertEqual(output.read_text(), "existing work")


if __name__ == "__main__":
    unittest.main()
