"""Register labelled QA fixtures through the production UI using a real admin login.

No database access, role impersonation, publishing, payments, traces or cookie exports.
Requires Python Playwright and Chromium. Sign in directly in an interactive browser
or supply credentials through secure environment variables.
"""
import argparse
from contextlib import contextmanager
import json
import os
import re
import ssl
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import urlopen
from uuid import uuid4
from zoneinfo import ZoneInfo

ORIGIN = "https://carreras-viajeras.mentec.dev"
MODULES = ["patrocinadores", "viajes", "campañas", "ofertas", "reservas", "contenidos", "recompensas"]
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def fixtures(tag, today):
    note = f"Prueba QA {tag}. No publicar, activar ni comercializar."
    return {
        "patrocinadores": {"name": f"QA Marca {tag}", "slug": f"marca-{tag}", "description": note},
        "viajes": {"title": f"QA Viaje {tag}", "slug": f"viaje-{tag}", "city": "Lima", "country": "Perú", "raceDate": (today + timedelta(days=180)).isoformat(), "distances": "10K", "summary": note, "notes": note},
        "campañas": {"code": tag, "name": f"QA Campaña {tag}", "channel": "other", "eventName": "Prueba interna QA"},
        "ofertas": {"name": f"QA Oferta {tag}", "totalPriceUsd": "100", "discountUsd": "0", "depositOptionsUsd": "", "validFrom": today.isoformat(), "conditions": note, "termsVersion": tag},
        "reservas": {"participantName": f"QA Runner {tag}", "participantEmail": f"{tag}@example.test", "packageLabel": "QA sin contratación real", "distance": "10K", "totalUsd": "100", "internalNote": note},
        "contenidos": {"title": f"QA Noticia {tag}", "slug": f"noticia-{tag}", "category": "news", "summary": note, "body": note},
        "regla": {"pointsPerReferral": "1", "maxReferralsPerRunner": "1", "validFrom": today.isoformat(), "terms": note},
        "premio": {"title": f"QA Premio {tag}", "description": note, "kind": "benefit", "costStars": "1", "stock": "1", "maxPerRunner": "1", "redemptionDays": "1", "validFrom": today.isoformat()},
    }


def preflight(require_credentials=True):
    missing = [key for key in ["QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD"] if require_credentials and not os.environ.get(key)]
    result = {"network": "ready", "missingEnvironment": missing}
    try:
        with urlopen(ORIGIN + "/api/health", timeout=15) as response:
            if response.status != 200 or json.load(response).get("status") != "ok":
                result.update(network="health_failed", reason="unexpected_health_response")
    except HTTPError as error:
        result.update(network="production_unreachable", reason="http_error", httpStatus=error.code)
    except URLError as error:
        result.update(network="production_unreachable", reason="tls_certificate" if isinstance(error.reason, ssl.SSLCertVerificationError) else "network_error")
    except (OSError, ValueError):
        result.update(network="production_unreachable", reason="network_or_health_response_error")
    return result


def proxy_settings():
    value = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if not value:
        return None
    parsed = urlparse(value)
    proxy = {"server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port or 80}"}
    if parsed.username:
        proxy["username"] = unquote(parsed.username)
    if parsed.password:
        proxy["password"] = unquote(parsed.password)
    return proxy


def sign_in(page, interactive_login=False):
    destination = re.compile(re.escape(ORIGIN) + r"/crm/?(?:[?#].*)?$")
    if interactive_login:
        print("Inicia sesión con tu cuenta admin en la ventana de Clerk. Tienes cinco minutos.", flush=True)
        page.wait_for_url(destination, timeout=300000)
        return
    page.locator('input[name="identifier"]').fill(os.environ["QA_ADMIN_EMAIL"])
    password = page.locator('input[name="password"]')
    if not password.is_visible():
        page.get_by_role("button", name=re.compile(r"^(Continuar|Continue)$")).click()
    password.wait_for(state="visible")
    password.fill(os.environ["QA_ADMIN_PASSWORD"])
    password.locator("xpath=ancestor::form").locator('button[type="submit"]').click()
    page.wait_for_url(destination)


def local_cdp_url(value):
    try:
        parsed = urlparse(value)
        valid = (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "::1", "localhost"}
                 and parsed.port is not None and 1 <= parsed.port <= 65535
                 and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
                 and parsed.username is None and parsed.password is None)
    except ValueError:
        valid = False
    if not valid:
        raise argparse.ArgumentTypeError("Usa una dirección CDP local, por ejemplo http://127.0.0.1:9222.")
    return value


@contextmanager
def browser_page(playwright, interactive_login=False, cdp_url=None):
    browser = None
    page = None
    try:
        if cdp_url:
            # Reuse the user's already authenticated context. Do not copy cookies
            # or create a fresh context that would lose the existing session.
            browser = playwright.chromium.connect_over_cdp(cdp_url, no_defaults=True)
            if not browser.contexts:
                raise RuntimeError("El navegador conectado no tiene un contexto disponible.")
            context = browser.contexts[0]
        else:
            chromium_path = os.environ.get("QA_CHROMIUM_PATH", "/usr/bin/chromium")
            options = {"headless": not interactive_login, "proxy": proxy_settings()}
            if Path(chromium_path).is_file():
                options["executable_path"] = chromium_path
            browser = playwright.chromium.launch(**options)
            context = browser.new_context(locale="es-PE", timezone_id="America/Lima", ignore_https_errors=False)
        # A new test tab keeps the user's existing tabs untouched.
        page = context.new_page()
        if cdp_url:
            page.bring_to_front()
        yield page
    finally:
        if cdp_url:
            if page is not None and not page.is_closed():
                page.close()
        elif browser is not None:
            browser.close()


def perform(report, data, interactive_login=False, cdp_url=None):
    from playwright.sync_api import expect, sync_playwright

    with sync_playwright() as playwright, browser_page(playwright, interactive_login, cdp_url) as page:
        page.set_default_timeout(25000)
        try:
            page.goto(ORIGIN + "/crm/acceso", wait_until="domcontentloaded")
            sign_in(page, interactive_login)
            # Use Chromium's network and cookies for the proof too. Playwright's
            # separate HTTP client can have different TLS/proxy behaviour on Windows.
            identity = page.evaluate("""async () => {
                const response = await fetch('/api/crm/me', {credentials: 'same-origin', cache: 'no-store'});
                const data = response.ok ? await response.json() : {};
                return {status: response.status, staffRoles: Array.isArray(data.staffRoles) ? data.staffRoles : []};
            }""")
            report["preflight"]["network"] = "browser_reached"
            if identity["status"] != 200:
                report["blocker"] = "admin_identity_unverified"
                report["adminIdentityHttpStatus"] = identity["status"]
                return
            roles = identity["staffRoles"]
            if not any(role in roles for role in ["admin", "super_admin"]):
                report["blocker"] = "account_has_no_admin_role"
                return
            report["authenticatedAsAdmin"] = True
        except Exception:
            # Login failures may include passwords, tokens or account data in call logs.
            report["blocker"] = "login_failed_or_requires_interactive_verification"
            return

        trip_id = None

        def form_for(button):
            return page.locator("form").filter(has=page.get_by_role("button", name=button, exact=True))

        def fill(form, values):
            for name, value in values.items():
                control = form.locator(f'[name="{name}"]')
                if control.evaluate("element => element.tagName") == "SELECT":
                    control.select_option(value)
                else:
                    control.fill(value)

        def saved_detail(module, path, button, values, expected_path, field, expected):
            result = report["results"][module]
            page.goto(ORIGIN + path, wait_until="domcontentloaded")
            form = form_for(button)
            fill(form, values)
            result["submitted"] = True
            report["writesAttempted"] += 1
            form.get_by_role("button", name=button, exact=True).click()
            page.wait_for_url(re.compile(re.escape(ORIGIN + expected_path) + UUID + r"$"))
            detail_url = page.url
            page.reload(wait_until="domcontentloaded")
            if field:
                expect(page.locator(f'[name="{field}"]')).to_have_value(expected)
            else:
                expect(page.get_by_role("heading", name=expected, exact=True)).to_be_visible()
            result.update(status="passed", references=[detail_url], persistence="verified_after_reload")
            return urlparse(detail_url).path.rsplit("/", 1)[1]

        for module in MODULES:
            result = report["results"][module]
            try:
                if module in ["campañas", "ofertas", "reservas"] and not trip_id:
                    result.update(status="blocked", reason="qa_trip_was_not_created")
                    continue
                if module == "patrocinadores":
                    saved_detail(module, "/crm/admin/patrocinadores/nuevo", "Crear patrocinador", data[module], "/crm/admin/patrocinadores/", "name", data[module]["name"])
                elif module == "viajes":
                    created_trip_id = saved_detail(module, "/crm/viajes/nuevo", "Crear viaje", data[module], "/crm/viajes/", "title", data[module]["title"])
                    expect(page.get_by_text("Borrador", exact=True).first).to_be_visible()
                    trip_id = created_trip_id
                elif module == "campañas":
                    saved_detail(module, "/crm/campanas", "Crear campaña", {**data[module], "tripId": trip_id}, "/crm/campanas/", None, data[module]["name"])
                elif module == "ofertas":
                    saved_detail(module, "/crm/ofertas/nueva", "Crear oferta", {"tripId": trip_id, **data[module]}, "/crm/ofertas/", "name", data[module]["name"])
                    expect(page.get_by_text("Borrador", exact=True).first).to_be_visible()
                elif module == "reservas":
                    saved_detail(module, "/crm/reservas/nueva", "Crear reserva", {"tripId": trip_id, **data[module]}, "/crm/reservas/", "participantName", data[module]["participantName"])
                    expect(page.get_by_text("Pendiente de confirmación", exact=True).first).to_be_visible()
                elif module == "contenidos":
                    saved_detail(module, "/crm/contenidos/nuevo", "Guardar borrador", data[module], "/crm/contenidos/", "title", data[module]["title"])
                    expect(page.get_by_role("status").filter(has_text="Borrador")).to_be_visible()
                elif module == "recompensas":
                    result["parts"] = []
                    for name, button, message in [("regla", "Crear versión de regla", "Versión de regla creada."), ("premio", "Crear versión de premio", "Versión del premio creada.")]:
                        page.goto(ORIGIN + "/crm/recompensas", wait_until="domcontentloaded")
                        form = form_for(button)
                        fill(form, data[name])
                        form.locator('[name="active"]').uncheck()
                        result["submitted"] = True
                        report["writesAttempted"] += 1
                        form.get_by_role("button", name=button, exact=True).click()
                        expect(form.get_by_role("status")).to_have_text(message)
                        page.reload(wait_until="domcontentloaded")
                        marker = data[name]["terms"] if name == "regla" else data[name]["title"]
                        # Verify an inactive persisted entry in history, not form fields.
                        article = page.locator("article").filter(has_text=marker)
                        expect(article).to_have_count(1)
                        expect(article).to_contain_text("Inactiva")
                        result["parts"].append({"type": name, "status": "passed", "active": False})
                    result.update(status="passed", references=[ORIGIN + "/crm/recompensas"], persistence="verified_after_reload")
            except Exception:
                # A submitted action can have committed even if verification times out.
                # Never retry an ambiguous write; the QA prefix identifies it for inspection.
                result.update(status="failed", reason="ui_or_persistence_check_failed", persistence="unknown_if_submitted")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="Print synthetic fixtures; does not visit or write to production.")
    parser.add_argument("--preflight", action="store_true", help="Check connectivity and credential presence without logging in or writing.")
    parser.add_argument("--report", default="test-results/admin-registration.json")
    parser.add_argument("--interactive-login", action="store_true", help="Open a visible browser and let you sign in directly with Clerk, including verification codes.")
    parser.add_argument("--cdp-url", type=local_cdp_url, help="Connect to a Chrome/Edge test profile already opened locally, e.g. http://127.0.0.1:9222. Keeps the external browser open.")
    args = parser.parse_args()
    interactive_login = args.interactive_login or bool(args.cdp_url)
    now = datetime.now(ZoneInfo("America/Lima"))
    tag = "qa-" + now.strftime("%Y%m%d-%H%M%S") + "-" + uuid4().hex[:6]
    data = fixtures(tag, now.date())
    if args.plan:
        print(json.dumps({"tag": tag, "fixtures": data}, ensure_ascii=False, indent=2))
        return 0
    report = {"origin": ORIGIN, "timestamp": now.isoformat(), "tag": tag, "authenticatedAsAdmin": False, "writesAttempted": 0, "results": {name: {"status": "not_run", "submitted": False} for name in MODULES}}
    report["authenticationMode"] = "connected_browser" if args.cdp_url else "interactive_browser" if interactive_login else "environment"
    if interactive_login and not args.preflight:
        # The browser has its own TLS trust, proxy and cookies. A failed Python
        # health request does not establish that this browser cannot reach Clerk.
        # No forms are submitted until the real browser session proves admin access.
        report["preflight"] = {"network": "checked_in_browser", "missingEnvironment": []}
        ready = True
    else:
        report["preflight"] = preflight(require_credentials=not interactive_login)
        ready = report["preflight"]["network"] == "ready" and not report["preflight"]["missingEnvironment"]
    if ready and not args.preflight:
        try:
            perform(report, data, interactive_login, args.cdp_url)
        except Exception:
            report["blocker"] = "browser_execution_unavailable"
    else:
        report["blocker"] = "prerequisites_missing" if not ready else "preflight_only"
    report["passedModules"] = sum(row["status"] == "passed" for row in report["results"].values())
    report["productionRegistrationComplete"] = report["passedModules"] == len(MODULES)
    output = Path(args.report)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(output), "passedModules": report["passedModules"], "writesAttempted": report["writesAttempted"], "blocker": report.get("blocker")}, ensure_ascii=False))
    return 0 if report["productionRegistrationComplete"] or (args.preflight and ready) else 2


if __name__ == "__main__":
    sys.exit(main())
