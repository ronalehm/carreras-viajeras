// Optional native PostgreSQL checks. Never connects to DATABASE_URL or a remote database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const container = process.argv[2] || "carreras-rewards-tests";
const database = `cv_features_${process.pid}_${Date.now()}`;
const command = (args, input) => execFileSync("docker", args, { input, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
// Refuse any container other than the explicitly labelled disposable test service.
assert.equal(command(["inspect", "--format", '{{ index .Config.Labels "codex.task" }}', container]).trim(), "carreras-runner-news");
const args = ["exec", "-i", container, "psql", "-XAtq", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-P", "pager=off"];
const sql = (query) => command(args, query).trim();
const json = (query) => JSON.parse(sql(query));
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;
const checks = [];
const check = (label, predicate) => { assert.ok(predicate, label); checks.push(label); };
const sessions = new Set();
function session() {
  const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
  sessions.add(child);
  const state = { child, output: "", error: "", done: false };
  child.stdout.on("data", (chunk) => { state.output += chunk; });
  child.stderr.on("data", (chunk) => { state.error += chunk; });
  state.finished = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => { state.done = true; sessions.delete(child); if (code) reject(new Error(state.error)); else resolve(state.output); });
  });
  // Attach an early handler while the lock observation is in progress.
  state.finished.catch(() => {});
  return state;
}
async function until(predicate, label) {
  const deadline = Date.now() + 15_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await delay(50);
  }
}
// Keep transaction A open, observe B's actual lock wait in pg_stat_activity,
// then release A. This proves overlapping database transactions, not just two promises.
async function compete(first, second) {
  const a = session();
  a.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='20s'; ${first}; SELECT '__LOCK_HELD__';\n`);
  await until(() => a.output.includes("__LOCK_HELD__") || a.done, "first transaction");
  assert.ok(!a.done, a.error || "first transaction exited");
  const name = `cv_competitor_${randomUUID()}`;
  const b = session();
  b.child.stdin.end(`SET application_name=${lit(name)}; SET statement_timeout='20s'; ${second};\n`);
  await until(() => b.done || sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=${lit(database)} AND application_name=${lit(name)} AND wait_event_type='Lock');`) === "t", "competing lock");
  assert.ok(!b.done, `Competing transaction did not wait: ${b.output} ${b.error}`);
  a.child.stdin.end("COMMIT;\n");
  const [left, right] = await Promise.all([a.finished, b.finished]);
  return [left.split("\n").find((row) => row.startsWith('{"')), right.split("\n").find((row) => row.startsWith('{"'))].map((row) => row ? JSON.parse(row) : null);
}

command(["exec", container, "createdb", "-U", "postgres", "-T", "template0", database]);
try {
  const migrations = readdirSync(`${root}drizzle`).filter((name) => /^\d{4}.*\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    const source = readFileSync(`${root}drizzle/${migration}`, "utf8");
    // Two-block migrations (ALTER TYPE ... ADD VALUE): the first block autocommits, so the second
    // can use the new enum values; the second runs in its own transaction, as applied by hand.
    const [first, second] = source.split(/^.*migration:split-transaction.*$/m);
    if (second !== undefined) {
      sql(first);
      sql(`BEGIN;\n${second}\nCOMMIT;`);
    } else {
      sql(Number(migration.slice(0, 4)) >= 10 ? `BEGIN;\n${source}\nCOMMIT;` : source);
    }
  }
  check("all migrations apply on native PostgreSQL", migrations.length >= 13);
  const sequential = sql(readFileSync(new URL("fixtures/rewards.sql", import.meta.url), "utf8"));
  const assertionCount = Number(sequential.split("\n").at(-1));
  check("sequential eligibility, ownership, reversals and expiry checks", assertionCount >= 45);

  const actor = "test_concurrency_admin";
  sql(`INSERT INTO profiles(user_id,email) VALUES(${lit(actor)},'concurrency@example.test');`);
  const rule = json(`SELECT cv_create_reward_rule(${lit(actor)},100,NULL,current_date-1,NULL,'Synthetic local concurrency test rule.',true);`).id;
  const item = (cost, stock = "NULL", kind = "benefit", discount = "NULL") => json(`SELECT cv_create_reward_catalog(${lit(actor)},NULL,${lit(kind)},'Test reward','Synthetic local fixture only.',${cost},${discount},${stock},10,30,current_date-1,NULL,true);`).id;
  const seed = (user, balance) => sql(`INSERT INTO reward_accounts(user_id,balance) VALUES(${lit(user)},${balance});`);
  const redeem = (user, catalog, key = randomUUID()) => `SELECT cv_request_reward(${lit(user)},${lit(catalog)},${lit(key)})`;

  seed("same_request", 100);
  const sameItem = item(80);
  const sameKey = randomUUID();
  const [sameA, sameB] = await compete(redeem("same_request", sameItem, sameKey), redeem("same_request", sameItem, sameKey));
  check("concurrent retry returns the same redemption", sameA.id === sameB.id && sameB.code === "unchanged");
  check("concurrent retry debits only once", sql("SELECT balance FROM reward_accounts WHERE user_id='same_request';") === "20");
  check("one ledger debit for one request", sql("SELECT count(*) FROM reward_ledger WHERE user_id='same_request' AND kind='redemption';") === "1");

  seed("double_spend", 100);
  const spendItem = item(80);
  const [spendA, spendB] = await compete(redeem("double_spend", spendItem), redeem("double_spend", spendItem));
  check("concurrent separate requests cannot double spend", spendA.status === "success" && spendB.code === "insufficient_stars");
  check("double spend leaves balance consistent", sql("SELECT balance FROM reward_accounts WHERE user_id='double_spend';") === "20");

  seed("stock_a", 100); seed("stock_b", 100);
  const stockItem = item(20, "1");
  const [stockA, stockB] = await compete(redeem("stock_a", stockItem), redeem("stock_b", stockItem));
  check("different runners serialize the last inventory unit", stockA.status === "success" && stockB.code === "out_of_stock");
  check("losing inventory request keeps its stars", sql("SELECT balance FROM reward_accounts WHERE user_id='stock_b';") === "100");

  seed("cancel_race", 100);
  const held = json(`${redeem("cancel_race", item(20))};`).id;
  const cancel = `SELECT cv_cancel_reward('cancel_race',${lit(held)})`;
  const [cancelA, cancelB] = await compete(cancel, cancel);
  check("concurrent cancellation refunds exactly once", cancelA.code === "cancelled" && cancelB.code === "unchanged" && sql("SELECT balance FROM reward_accounts WHERE user_id='cancel_race';") === "100");

  const trip = randomUUID();
  const booking = randomUUID();
  sql(`INSERT INTO trips(id,slug,title,city,country,race_date,distances,summary) VALUES(${lit(trip)},'concurrency-race','Test race','Lima','Peru','2027-01-01',ARRAY['42K'],'Synthetic local fixture');
    INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,package_label,total_usd,created_by) VALUES(${lit(booking)},${lit(trip)},'Test runner','owner@example.test','discount_owner','Standard',500,${lit(actor)});`);
  seed("discount_owner", 100);
  const discount = json(`${redeem("discount_owner", item(20, "NULL", "discount", "50"))};`).id;
  const payment = `SELECT id FROM bookings WHERE id=${lit(booking)} FOR UPDATE; INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(${lit(booking)},50,current_date,'First payment',${lit(actor)})`;
  const [, applyAfterPayment] = await compete(payment, `SELECT cv_apply_booking_reward(${lit(actor)},${lit(discount)},${lit(booking)})`);
  check("discount waits for a payment and rejects a paid booking", applyAfterPayment.code === "booking_not_eligible");
  check("rejected discount never changes the booking total", sql(`SELECT total_usd FROM bookings WHERE id=${lit(booking)};`) === "500");

  // Link fixture chronology deterministically; production uses acceptance before booking creation.
  sql(`INSERT INTO referral_codes(user_id,code) VALUES('referrer_concurrent',repeat('X',32)); SELECT cv_claim_referral('referred_concurrent',repeat('X',32),true,${lit(rule)});`);
  const evidence = randomUUID();
  sql(`INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,status,package_label,total_usd,created_by,created_at) VALUES(${lit(evidence)},${lit(trip)},'Referred runner','referred@example.test','referred_concurrent','confirmed','Standard',500,${lit(actor)},clock_timestamp()); INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(${lit(evidence)},50,current_date,'First payment',${lit(actor)});`);
  const reconcile = "SELECT cv_reconcile_rewards('referrer_concurrent')";
  await compete(reconcile, reconcile);
  check("concurrent reconciliation credits a referral once", sql("SELECT count(*) FROM reward_ledger WHERE user_id='referrer_concurrent' AND kind='referral_credit';") === "1");
  check("referral account receives exactly the configured stars", sql("SELECT balance FROM reward_accounts WHERE user_id='referrer_concurrent';") === "100");

  console.log(JSON.stringify({ postgres: sql("SHOW server_version;"), migrations: migrations.length, sequentialAssertions: assertionCount, checks: checks.length, passed: checks }, null, 2));
} finally {
  for (const child of sessions) child.kill("SIGTERM");
  command(["exec", container, "dropdb", "-U", "postgres", "--force", database]);
}
