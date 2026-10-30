import "server-only";
import { DatabaseSync } from "node:sqlite";

export type StripeSnapshot = {
 id: string; type: string; status: string; paymentConfirmed: boolean;
 amount: number; currency: string | null; refunded?: number; relatedId?: string | null; operationId?: string;
};
type Receipt = { id: string; type: string; created: number };

export class WebhookLedger {
 private db: DatabaseSync;
 constructor(filename: string) {
  this.db = new DatabaseSync(filename);
  this.db.exec(`
   PRAGMA journal_mode=WAL;
   PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS stripe_events (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, created INTEGER NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
   );
   CREATE TABLE IF NOT EXISTS stripe_operations (
    resource_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS stripe_objects (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, last_event_created INTEGER NOT NULL, snapshot TEXT NOT NULL
   );
  `);
 }
 registerOperation(resourceId: string, operationId: string) {
  this.db.prepare("INSERT INTO stripe_operations(resource_id,operation_id) VALUES(?,?) ON CONFLICT(resource_id) DO NOTHING").run(resourceId,operationId);
  if (this.operation(resourceId)!==operationId) throw new Error("Resource already belongs to another operation");
 }
 operation(resourceId: string): string | null {
  const row=this.db.prepare("SELECT operation_id FROM stripe_operations WHERE resource_id=?").get(resourceId);
  return row ? String(row.operation_id) : null;
 }
 hasEvent(id: string): boolean {
  return this.db.prepare("SELECT 1 FROM stripe_events WHERE id=?").get(id) !== undefined;
 }
 apply(event: Receipt, snapshot: StripeSnapshot | null): boolean {
  this.db.exec("BEGIN IMMEDIATE");
  try {
   const inserted = this.db.prepare("INSERT INTO stripe_events(id,type,created) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").run(event.id,event.type,event.created);
   if (inserted.changes === 0) { this.db.exec("COMMIT"); return false; }
   if (snapshot) {
    // These successful payment states are terminal, even if two events share the same second.
    if ((event.type==="payment_intent.succeeded" || event.type==="checkout.session.completed") && !snapshot.paymentConfirmed) {
     const previous=this.object(snapshot.id);
     if (previous?.paymentConfirmed) snapshot=previous;
    }
    this.db.prepare(`
     INSERT INTO stripe_objects(id,type,last_event_created,snapshot) VALUES(?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET last_event_created=excluded.last_event_created,snapshot=excluded.snapshot
     WHERE excluded.last_event_created >= stripe_objects.last_event_created
    `).run(snapshot.id,snapshot.type,event.created,JSON.stringify(snapshot));
   }
   this.db.exec("COMMIT");
   return true;
  } catch (error) {
   this.db.exec("ROLLBACK");
   throw error;
  }
 }
 object(id: string): StripeSnapshot | null {
  const row = this.db.prepare("SELECT snapshot FROM stripe_objects WHERE id=?").get(id);
  return row ? JSON.parse(String(row.snapshot)) as StripeSnapshot : null;
 }
 eventCount(): number { return Number(this.db.prepare("SELECT count(*) AS total FROM stripe_events").get()?.total ?? 0); }
 close() { this.db.close(); }
}
