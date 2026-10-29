"""Regression checks for interactive login and production-test prerequisites."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("admin_registration", Path(__file__).with_name("check-admin-registration.py"))
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class AdminRegistrationTests(unittest.TestCase):
    def healthy_response(self):
        response = Mock()
        response.status = 200
        response.read.return_value = b'{"status":"ok"}'
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def test_interactive_preflight_does_not_require_a_password_in_environment(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(qa, "urlopen", return_value=self.healthy_response()):
            self.assertEqual(qa.preflight(require_credentials=False), {"network": "ready", "missingEnvironment": []})

    def test_automatic_login_requires_both_credentials(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(qa, "urlopen", return_value=self.healthy_response()):
            self.assertEqual(qa.preflight()["missingEnvironment"], ["QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD"])

    def test_network_failure_is_a_blocker_even_for_interactive_login(self):
        with patch.object(qa, "urlopen", side_effect=OSError("synthetic network failure")):
            self.assertEqual(qa.preflight(require_credentials=False)["network"], "production_unreachable")

    def test_interactive_login_never_reads_or_fills_credentials(self):
        page = Mock()
        with patch.dict(os.environ, {}, clear=True), contextlib.redirect_stdout(io.StringIO()):
            qa.sign_in(page, interactive_login=True)
        page.locator.assert_not_called()
        destination = page.wait_for_url.call_args.args[0]
        self.assertRegex(qa.ORIGIN + "/crm", destination)
        self.assertIsNone(destination.fullmatch(qa.ORIGIN + "/crm/acceso"))
        self.assertEqual(page.wait_for_url.call_args.kwargs["timeout"], 300000)

    def test_successful_preflight_does_not_start_browser_or_claim_registration(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            with patch("sys.argv", ["qa", "--interactive-login", "--preflight", "--report", str(output)]), patch.object(qa, "preflight", return_value={"network": "ready", "missingEnvironment": []}), patch.object(qa, "perform") as browser, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(qa.main(), 0)
                browser.assert_not_called()
            result = json.loads(output.read_text(encoding="utf-8"))
            self.assertFalse(result["productionRegistrationComplete"])
            self.assertFalse(result["authenticatedAsAdmin"])
            self.assertEqual(result["writesAttempted"], 0)
            self.assertEqual(set(result["results"]), set(qa.MODULES))

    def test_failed_preflight_never_starts_browser(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            with patch("sys.argv", ["qa", "--interactive-login", "--report", str(output)]), patch.object(qa, "preflight", return_value={"network": "production_unreachable", "missingEnvironment": []}), patch.object(qa, "perform") as browser, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(qa.main(), 2)
                browser.assert_not_called()
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["passedModules"], 0)


if __name__ == "__main__":
    unittest.main()
