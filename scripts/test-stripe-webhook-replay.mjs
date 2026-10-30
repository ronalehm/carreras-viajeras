import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import Stripe from "stripe";

try {
 const env=parseEnv(readFileSync(".env.local","utf8"));
 assert.match(env.STRIPE_SECRET_KEY??"",/^(sk|rk)_test_/);
 assert.match(env.STRIPE_WEBHOOK_SECRET??"",/^whsec_/);
 const stripe=new Stripe(env.STRIPE_SECRET_KEY);
 for (const type of ["payment_intent.succeeded","checkout.session.completed"]) {
  const command="stripe events list --type "+type+" --limit 1";
  const output=process.platform==="win32"
   ? execFileSync(process.env.ComSpec||"cmd.exe",["/d","/s","/c",command],{encoding:"utf8",stdio:["ignore","pipe","pipe"],windowsHide:true,timeout:20000})
   : execFileSync("stripe",["events","list","--type",type,"--limit","1"],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:20000});
  const event=JSON.parse(output).data?.[0];
  assert.ok(event,"Run stripe trigger checkout.session.completed first");
  assert.equal(event.livemode,false);
  const payload=JSON.stringify(event);
  const signature=stripe.webhooks.generateTestHeaderString({payload,secret:env.STRIPE_WEBHOOK_SECRET});
  const deliver=()=>fetch("http://127.0.0.1:3001/api/webhooks/stripe",{method:"POST",headers:{"content-type":"application/json","stripe-signature":signature},body:payload});
  const first=await deliver(); const firstBody=await first.json();
  const repeated=await deliver(); const repeatedBody=await repeated.json();
  const db=new DatabaseSync(".stripe-sandbox/webhooks.sqlite",{readOnly:true});
  const receipts=Number(db.prepare("SELECT count(*) AS total FROM stripe_events WHERE id=?").get(event.id)?.total);
  const projections=Number(db.prepare("SELECT count(*) AS total FROM stripe_objects WHERE id=?").get(event.data.object.id)?.total);
  db.close();
  console.log(JSON.stringify({eventType:type,firstStatus:first.status,firstBody,repeatedStatus:repeated.status,repeatedBody,receipts,projections}));
  assert.equal(first.status,200); assert.equal(repeated.status,200);
  assert.equal(repeatedBody.duplicate,true); assert.equal(receipts,1);
  // These CLI fixtures have no application operation and must create no payment.
  assert.equal(projections,0);
 }
} catch {
 console.error("Stripe webhook replay verification failed. Check the sanitized server diagnostics and sandbox configuration.");
 process.exitCode=1;
}
