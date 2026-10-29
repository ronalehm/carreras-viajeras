CREATE TABLE "campaign_visit_days" (
	"campaign_id" uuid NOT NULL,
	"day" date NOT NULL,
	"visits" integer NOT NULL,
	CONSTRAINT "campaign_visit_days_campaign_id_day_pk" PRIMARY KEY("campaign_id","day"),
	CONSTRAINT "campaign_visit_days_visits_chk" CHECK ("campaign_visit_days"."visits" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_visit_days" ADD CONSTRAINT "campaign_visit_days_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;