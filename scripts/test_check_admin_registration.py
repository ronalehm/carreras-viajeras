"""Regression checks for interactive login and production-test prerequisites."""
import contextlib
import importlib.util
import io
import json
import os
import sys
from urllib.error import HTTPError
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

    def test_explicit_network_probe_reports_failure(self):
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
            with patch("sys.argv", ["qa", "--report", str(output)]), patch.object(qa, "preflight", return_value={"network": "production_unreachable", "missingEnvironment": []}), patch.object(qa, "perform") as browser, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(qa.main(), 2)
                browser.assert_not_called()
            self.assertEqual(json.loads(output.read_text(encoding="utf-8"))["passedModules"], 0)

    def test_interactive_run_uses_browser_transport_instead_of_python_health(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            with patch("sys.argv", ["qa", "--interactive-login", "--report", str(output)]), patch.object(qa, "preflight") as probe, patch.object(qa, "perform") as browser, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(qa.main(), 2)
                probe.assert_not_called()
                browser.assert_called_once()
                self.assertTrue(browser.call_args.args[2])
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["preflight"]["network"], "checked_in_browser")
            self.assertEqual(report["writesAttempted"], 0)
            self.assertFalse(report["productionRegistrationComplete"])

    def test_http_probe_does_not_echo_error_content(self):
        failure = HTTPError(qa.ORIGIN, 403, "private synthetic contents", {}, None)
        with patch.object(qa, "urlopen", side_effect=failure):
            result = qa.preflight(require_credentials=False)
        self.assertEqual(result, {"network": "production_unreachable", "reason": "http_error", "httpStatus": 403, "missingEnvironment": []})
        self.assertNotIn("private", json.dumps(result))

    def test_browser_denied_admin_proof_never_submits_forms(self):
        for status, roles, blocker in [(403, ["admin"], "admin_identity_unverified"), (401, [], "admin_identity_unverified"), (200, ["organizer"], "account_has_no_admin_role"), (200, [], "account_has_no_admin_role")]:
            with self.subTest(status=status, roles=roles):
                api = Mock()
                browser = api.chromium.launch.return_value
                context = browser.new_context.return_value
                page = context.new_page.return_value
                page.evaluate.return_value = {"status": status, "staffRoles": roles}
                module = Mock()
                module.sync_playwright.return_value.__enter__ = Mock(return_value=api)
                module.sync_playwright.return_value.__exit__ = Mock(return_value=False)
                report = {"authenticatedAsAdmin": False, "writesAttempted": 0, "preflight": {"network": "checked_in_browser"}}
                with patch.dict(sys.modules, {"playwright.sync_api": module}), patch.object(qa, "sign_in"):
                    qa.perform(report, {}, interactive_login=True)
                page.locator.assert_not_called()
                context.request.get.assert_not_called()
                self.assertIn("/api/crm/me", page.evaluate.call_args.args[0])
                self.assertEqual(report["preflight"]["network"], "browser_reached")
                self.assertEqual(report["blocker"], blocker)
                self.assertEqual(report["writesAttempted"], 0)
                self.assertFalse(report["authenticatedAsAdmin"])
                browser.close.assert_called_once()

    def test_cdp_accepts_only_loopback_without_credentials(self):
        for endpoint in ["http://127.0.0.1:9222", "http://localhost:9333/", "http://[::1]:9222"]:
            self.assertEqual(qa.local_cdp_url(endpoint), endpoint)
        for endpoint in ["http://example.test:9222", "http://0.0.0.0:9222", "http://127.0.0.1", "http://user:private@127.0.0.1:9222", "http://127.0.0.1:9222/?private=1", "http://127.0.0.1:9222/#private", "http://[broken"]:
            with self.subTest(endpoint=endpoint), self.assertRaises(qa.argparse.ArgumentTypeError):
                qa.local_cdp_url(endpoint)

    def test_cdp_reuses_session_and_closes_only_owned_test_tab(self):
        api = Mock()
        browser = api.chromium.connect_over_cdp.return_value
        context = Mock()
        browser.contexts = [context]
        page = context.new_page.return_value
        page.is_closed.return_value = False
        with qa.browser_page(api, interactive_login=True, cdp_url="http://127.0.0.1:9222") as actual:
            self.assertIs(actual, page)
            page.bring_to_front.assert_called_once()
        api.chromium.launch.assert_not_called()
        browser.new_context.assert_not_called()
        context.close.assert_not_called()
        browser.close.assert_not_called()
        page.close.assert_called_once()

    def test_cdp_does_not_close_external_browser_when_a_test_raises(self):
        api = Mock()
        browser = api.chromium.connect_over_cdp.return_value
        context = Mock()
        browser.contexts = [context]
        context.new_page.return_value.is_closed.return_value = False
        with self.assertRaises(RuntimeError):
            with qa.browser_page(api, cdp_url="http://127.0.0.1:9222"):
                raise RuntimeError("synthetic test failure")
        browser.close.assert_not_called()
        context.close.assert_not_called()
        context.new_page.return_value.close.assert_called_once()

    def test_cdp_refuses_to_replace_a_missing_existing_context(self):
        api = Mock()
        browser = api.chromium.connect_over_cdp.return_value
        browser.contexts = []
        with self.assertRaises(RuntimeError):
            with qa.browser_page(api, cdp_url="http://127.0.0.1:9222"):
                self.fail("a new session must not be substituted")
        browser.new_context.assert_not_called()
        browser.close.assert_not_called()

    def test_cdp_cli_implies_manual_login_without_environment_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "result.json"
            with patch("sys.argv", ["qa", "--cdp-url", "http://127.0.0.1:9222", "--report", str(output)]), patch.dict(os.environ, {}, clear=True), patch.object(qa, "preflight") as probe, patch.object(qa, "perform") as browser, contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(qa.main(), 2)
                probe.assert_not_called()
                self.assertEqual(browser.call_args.args[2:], (True, "http://127.0.0.1:9222"))
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["authenticationMode"], "connected_browser")
            self.assertEqual(report["writesAttempted"], 0)


if __name__ == "__main__":
    unittest.main()
