import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
const env = parseEnv(readFileSync(".env.local", "utf8"));
let matches = null;
try {
 const args = process.platform === "win32" ? ["/d","/s","/c","stripe listen --print-secret"] : ["listen","--print-secret"];
 const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "stripe";
 const output = execFileSync(command,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:20000,windowsHide:true});
 const secret = output.match(/whsec_[A-Za-z0-9]+/)?.[0];
 matches = secret ? env.STRIPE_WEBHOOK_SECRET === secret : null;
} catch {}
console.log(JSON.stringify({
 source:".env.local",
 variables:Object.keys(env).filter(name=>/stripe/i.test(name)).map(name=>({
  name,classification:/^(?:sk|rk|pk)_test_/.test(env[name])?"test":/^(?:sk|rk|pk)_live_/.test(env[name])?"live":env[name]?"not-verifiable":"absent"
 })),
 webhookSecretMatchesCLI:matches
}));
