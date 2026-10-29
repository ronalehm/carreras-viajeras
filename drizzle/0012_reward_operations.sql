-- Transactional rewards API. Security invoker: no elevated privileges or dynamic SQL.
-- Each function is a single Neon HTTP statement; row locks and subsequent VOLATILE
-- PL/pgSQL commands see committed state after waiting, rather than stale CTE snapshots.
CREATE FUNCTION cv_lock_reward_account(p_user text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_user IS NULL OR char_length(p_user) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'invalid reward account' USING ERRCODE='22023'; END IF;
  INSERT INTO reward_accounts(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM reward_accounts WHERE user_id=p_user FOR UPDATE;
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_reward_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'reward history is immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER reward_ledger_immutable BEFORE UPDATE OR DELETE ON reward_ledger FOR EACH ROW EXECUTE FUNCTION cv_reward_immutable();
--> statement-breakpoint
CREATE FUNCTION cv_expire_rewards(p_user text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r reward_redemptions%ROWTYPE; refund integer;
BEGIN
  PERFORM cv_lock_reward_account(p_user);
  FOR r IN SELECT * FROM reward_redemptions WHERE user_id=p_user AND status='available' AND expires_at<=clock_timestamp() ORDER BY id FOR UPDATE LOOP
    UPDATE reward_redemptions SET status='expired',cancelled_at=now() WHERE id=r.id;
    refund:=NULL;
    INSERT INTO reward_ledger(user_id,kind,delta,cause_key,redemption_id,description)
      VALUES(p_user,'redemption_refund',r.cost_stars,'refund:'||r.id,r.id,'Estrellas liberadas por vencimiento del canje')
      ON CONFLICT(cause_key) DO NOTHING RETURNING delta INTO refund;
    IF refund IS NOT NULL THEN UPDATE reward_accounts SET balance=balance+refund,updated_at=now() WHERE user_id=p_user; END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_reconcile_rewards(p_user text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE r runner_referrals%ROWTYPE; points integer; wanted integer; change integer; booking uuid; next_version integer; result bigint;
BEGIN
  PERFORM cv_lock_reward_account(p_user);
  PERFORM cv_expire_rewards(p_user);
  FOR r IN SELECT * FROM runner_referrals WHERE referrer_user_id=p_user ORDER BY referred_user_id FOR UPDATE LOOP
    SELECT points_per_referral INTO points FROM reward_rule_versions WHERE id=r.rule_version_id;
    booking:=NULL;
    -- Hold both evidence rows until this transaction ends. Payment/cancellation writers
    -- acquire the booking lock and reconcile only after committing their own operation.
    SELECT b.id INTO booking FROM bookings b JOIN booking_payments p ON p.booking_id=b.id
      WHERE b.runner_user_id=r.referred_user_id AND b.status='confirmed' AND b.created_at>=r.accepted_at
        AND p.voided_at IS NULL AND p.amount_usd>0
      ORDER BY b.created_at,b.id,p.created_at,p.id LIMIT 1 FOR SHARE OF b,p;
    wanted:=CASE WHEN booking IS NULL THEN 0 ELSE points END;
    change:=wanted-r.net_points;
    IF change<>0 THEN
      next_version:=r.eligibility_version+1;
      INSERT INTO reward_ledger(user_id,kind,delta,cause_key,referral_user_id,description)
        VALUES(p_user,CASE WHEN change>0 THEN 'referral_credit'::reward_ledger_kind ELSE 'referral_reversal'::reward_ledger_kind END,
          change,'referral:'||r.referred_user_id||':'||next_version,r.referred_user_id,
          CASE WHEN change>0 THEN 'Estrellas por referido con reserva confirmada y pago válido' ELSE 'Ajuste de estrellas por cambio de elegibilidad del referido' END);
      UPDATE reward_accounts SET balance=balance+change,updated_at=now() WHERE user_id=p_user;
      UPDATE runner_referrals SET net_points=wanted,eligibility_version=next_version,credited_booking_id=booking,
        last_qualified_at=CASE WHEN wanted>0 THEN now() ELSE last_qualified_at END WHERE referred_user_id=r.referred_user_id;
    ELSIF booking IS DISTINCT FROM r.credited_booking_id THEN
      UPDATE runner_referrals SET credited_booking_id=booking WHERE referred_user_id=r.referred_user_id;
    END IF;
  END LOOP;
  SELECT balance INTO result FROM reward_accounts WHERE user_id=p_user;
  RETURN result;
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_claim_referral(p_user text,p_code text,p_accepted boolean,p_expected_rule uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE owner text; rule reward_rule_versions%ROWTYPE; existing runner_referrals%ROWTYPE;
BEGIN
  IF NOT coalesce(p_accepted,false) THEN RETURN jsonb_build_object('status','error','code','terms_required'); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cv-referral'),hashtext(p_user));
  SELECT * INTO existing FROM runner_referrals WHERE referred_user_id=p_user;
  SELECT user_id INTO owner FROM referral_codes WHERE code=p_code AND active FOR SHARE;
  IF owner IS NULL THEN RETURN jsonb_build_object('status','error','code','invalid_code'); END IF;
  IF owner=p_user THEN RETURN jsonb_build_object('status','error','code','self_referral'); END IF;
  IF existing.referred_user_id IS NOT NULL THEN
    IF existing.referrer_user_id=owner THEN RETURN jsonb_build_object('status','success','code','unchanged'); END IF;
    RETURN jsonb_build_object('status','error','code','already_attributed');
  END IF;
  PERFORM cv_lock_reward_account(owner);
  IF EXISTS(SELECT 1 FROM bookings WHERE runner_user_id=p_user) THEN RETURN jsonb_build_object('status','error','code','not_eligible'); END IF;
  SELECT * INTO rule FROM reward_rule_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date
    AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date) LIMIT 1 FOR SHARE;
  IF rule.id IS NULL OR rule.id IS DISTINCT FROM p_expected_rule THEN RETURN jsonb_build_object('status','error','code','program_unavailable'); END IF;
  PERFORM 1 FROM reward_catalog_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date
    AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date) LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','code','program_unavailable'); END IF;
  IF rule.max_referrals_per_runner IS NOT NULL AND (SELECT count(*) FROM runner_referrals WHERE referrer_user_id=owner AND rule_version_id=rule.id)>=rule.max_referrals_per_runner THEN
    RETURN jsonb_build_object('status','error','code','referral_limit');
  END IF;
  INSERT INTO runner_referrals(referred_user_id,referrer_user_id,rule_version_id) VALUES(p_user,owner,rule.id);
  RETURN jsonb_build_object('status','success','code','attributed');
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_request_reward(p_user text,p_catalog uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE item reward_catalog_versions%ROWTYPE; old reward_redemptions%ROWTYPE; balance bigint; issued uuid; used bigint;
BEGIN
  balance:=cv_reconcile_rewards(p_user);
  SELECT * INTO old FROM reward_redemptions WHERE user_id=p_user AND request_key=p_request;
  IF old.id IS NOT NULL THEN
    IF old.catalog_version_id<>p_catalog THEN RETURN jsonb_build_object('status','error','code','idempotency_conflict'); END IF;
    RETURN jsonb_build_object('status','success','code','unchanged','id',old.id);
  END IF;
  PERFORM 1 FROM reward_rule_versions WHERE active AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','code','program_unavailable'); END IF;
  SELECT * INTO item FROM reward_catalog_versions WHERE id=p_catalog AND active
    AND valid_from<=(now() AT TIME ZONE 'America/Lima')::date
    AND (valid_until IS NULL OR valid_until>=(now() AT TIME ZONE 'America/Lima')::date) FOR UPDATE;
  IF item.id IS NULL THEN RETURN jsonb_build_object('status','error','code','reward_unavailable'); END IF;
  IF balance<item.cost_stars THEN RETURN jsonb_build_object('status','error','code',CASE WHEN balance<0 THEN 'review_required' ELSE 'insufficient_stars' END); END IF;
  SELECT count(*) INTO used FROM reward_redemptions r JOIN reward_catalog_versions c ON c.id=r.catalog_version_id
    WHERE c.catalog_key=item.catalog_key AND (r.status='applied' OR (r.status='available' AND r.expires_at>clock_timestamp())) AND r.user_id=p_user;
  IF used>=item.max_per_runner THEN RETURN jsonb_build_object('status','error','code','redemption_limit'); END IF;
  IF item.stock IS NOT NULL THEN
    SELECT count(*) INTO used FROM reward_redemptions r JOIN reward_catalog_versions c ON c.id=r.catalog_version_id
      WHERE c.catalog_key=item.catalog_key AND (r.status='applied' OR (r.status='available' AND r.expires_at>clock_timestamp()));
    IF used>=item.stock THEN RETURN jsonb_build_object('status','error','code','out_of_stock'); END IF;
  END IF;
  INSERT INTO reward_redemptions(user_id,catalog_version_id,request_key,kind,title,description,cost_stars,discount_usd,expires_at)
    VALUES(p_user,item.id,p_request,item.kind,item.title,item.description,item.cost_stars,item.discount_usd,now()+make_interval(days=>item.redemption_days)) RETURNING id INTO issued;
  INSERT INTO reward_ledger(user_id,kind,delta,cause_key,redemption_id,description)
    VALUES(p_user,'redemption',-item.cost_stars,'redeem:'||issued,issued,'Canje: '||item.title);
  UPDATE reward_accounts SET balance=reward_accounts.balance-item.cost_stars,updated_at=now() WHERE user_id=p_user;
  RETURN jsonb_build_object('status','success','code','redeemed','id',issued);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_cancel_reward(p_user text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r reward_redemptions%ROWTYPE; refund integer;
BEGIN
  PERFORM cv_reconcile_rewards(p_user);
  SELECT * INTO r FROM reward_redemptions WHERE id=p_id AND user_id=p_user FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('status','error','code','not_found'); END IF;
  IF r.status IN('cancelled','expired') THEN RETURN jsonb_build_object('status','success','code','unchanged','id',r.id); END IF;
  IF r.status<>'available' THEN RETURN jsonb_build_object('status','error','code','invalid_transition'); END IF;
  UPDATE reward_redemptions SET status='cancelled',cancelled_at=now() WHERE id=r.id;
  INSERT INTO reward_ledger(user_id,kind,delta,cause_key,redemption_id,description)
    VALUES(p_user,'redemption_refund',r.cost_stars,'refund:'||r.id,r.id,'Estrellas liberadas por cancelación del canje')
    ON CONFLICT(cause_key) DO NOTHING RETURNING delta INTO refund;
  IF refund IS NOT NULL THEN UPDATE reward_accounts SET balance=balance+refund,updated_at=now() WHERE user_id=p_user; END IF;
  RETURN jsonb_build_object('status','success','code','cancelled','id',r.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_apply_booking_reward(p_actor text,p_id uuid,p_booking uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r reward_redemptions%ROWTYPE; b bookings%ROWTYPE; owner text; balance bigint;
BEGIN
  SELECT user_id INTO owner FROM reward_redemptions WHERE id=p_id;
  IF owner IS NULL THEN RETURN jsonb_build_object('status','error','code','not_found'); END IF;
  balance:=cv_reconcile_rewards(owner);
  SELECT * INTO r FROM reward_redemptions WHERE id=p_id FOR UPDATE;
  IF r.status='applied' AND r.booking_id=p_booking THEN RETURN jsonb_build_object('status','success','code','unchanged','id',r.id); END IF;
  IF balance<0 THEN RETURN jsonb_build_object('status','error','code','review_required'); END IF;
  IF r.status<>'available' OR r.kind<>'discount' OR r.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','error','code','reward_unavailable'); END IF;
  SELECT * INTO b FROM bookings WHERE id=p_booking AND runner_user_id=owner FOR UPDATE;
  IF b.id IS NULL THEN RETURN jsonb_build_object('status','error','code','not_found'); END IF;
  IF b.status<>'pending' OR EXISTS(SELECT 1 FROM booking_payments WHERE booking_id=b.id AND voided_at IS NULL) THEN RETURN jsonb_build_object('status','error','code','booking_not_eligible'); END IF;
  IF EXISTS(SELECT 1 FROM booking_benefits WHERE booking_id=b.id AND kind='discount') THEN RETURN jsonb_build_object('status','error','code','discount_already_applied'); END IF;
  IF r.discount_usd>=b.total_usd THEN RETURN jsonb_build_object('status','error','code','discount_exceeds_total'); END IF;
  UPDATE bookings SET total_usd=b.total_usd-r.discount_usd,updated_at=now() WHERE id=b.id;
  INSERT INTO booking_benefits(booking_id,runner_user_id,kind,title,description,original_total_usd,discount_usd,final_total_usd,redemption_id,created_by)
    VALUES(b.id,owner,'discount',r.title,r.description,b.total_usd,r.discount_usd,b.total_usd-r.discount_usd,r.id,p_actor);
  UPDATE reward_redemptions SET status='applied',booking_id=b.id,applied_at=now(),applied_by=p_actor WHERE id=r.id;
  RETURN jsonb_build_object('status','success','code','applied','id',r.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_fulfill_reward(p_actor text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r reward_redemptions%ROWTYPE; owner text; balance bigint;
BEGIN
  SELECT user_id INTO owner FROM reward_redemptions WHERE id=p_id;
  IF owner IS NULL THEN RETURN jsonb_build_object('status','error','code','not_found'); END IF;
  balance:=cv_reconcile_rewards(owner);
  SELECT * INTO r FROM reward_redemptions WHERE id=p_id FOR UPDATE;
  IF r.status='applied' AND r.kind='benefit' THEN RETURN jsonb_build_object('status','success','code','unchanged','id',r.id); END IF;
  IF balance<0 THEN RETURN jsonb_build_object('status','error','code','review_required'); END IF;
  IF r.status<>'available' OR r.kind<>'benefit' OR r.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','error','code','reward_unavailable'); END IF;
  UPDATE reward_redemptions SET status='applied',applied_at=now(),applied_by=p_actor WHERE id=r.id;
  RETURN jsonb_build_object('status','success','code','applied','id',r.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_assign_booking_benefit(p_actor text,p_booking uuid,p_title text,p_description text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b bookings%ROWTYPE; existing uuid;
BEGIN
  SELECT * INTO b FROM bookings WHERE id=p_booking FOR UPDATE;
  IF b.id IS NULL OR b.runner_user_id IS NULL OR b.status='cancelled' THEN RETURN jsonb_build_object('status','error','code','booking_not_eligible'); END IF;
  SELECT id INTO existing FROM booking_benefits WHERE booking_id=b.id AND kind='contractual' AND title=p_title AND description=p_description AND created_by=p_actor LIMIT 1;
  IF existing IS NOT NULL THEN RETURN jsonb_build_object('status','success','code','unchanged','id',existing); END IF;
  INSERT INTO booking_benefits(booking_id,runner_user_id,kind,title,description,created_by)
    VALUES(b.id,b.runner_user_id,'contractual',p_title,p_description,p_actor) RETURNING id INTO existing;
  RETURN jsonb_build_object('status','success','code','assigned','id',existing);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_create_reward_rule(p_actor text,p_points integer,p_max integer,p_from date,p_until date,p_terms text,p_active boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE next_version integer; created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cv-rewards-rules'));
  IF p_active THEN UPDATE reward_rule_versions SET active=false,deactivated_at=now(),deactivated_by=p_actor WHERE active; END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM reward_rule_versions;
  INSERT INTO reward_rule_versions(version,points_per_referral,max_referrals_per_runner,valid_from,valid_until,terms,active,created_by)
    VALUES(next_version,p_points,p_max,p_from,p_until,p_terms,p_active,p_actor) RETURNING id INTO created;
  RETURN jsonb_build_object('status','success','code','created','id',created);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_create_reward_catalog(p_actor text,p_key uuid,p_kind reward_kind,p_title text,p_description text,p_cost integer,p_discount integer,p_stock integer,p_max integer,p_days integer,p_from date,p_until date,p_active boolean) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE key uuid:=coalesce(p_key,gen_random_uuid()); next_version integer; created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('cv-rewards-catalog'),hashtext(key::text));
  IF p_active THEN UPDATE reward_catalog_versions SET active=false,deactivated_at=now(),deactivated_by=p_actor WHERE catalog_key=key AND active; END IF;
  SELECT coalesce(max(version),0)+1 INTO next_version FROM reward_catalog_versions WHERE catalog_key=key;
  INSERT INTO reward_catalog_versions(catalog_key,version,kind,title,description,cost_stars,discount_usd,stock,max_per_runner,redemption_days,valid_from,valid_until,active,created_by)
    VALUES(key,next_version,p_kind,p_title,p_description,p_cost,p_discount,p_stock,p_max,p_days,p_from,p_until,p_active,p_actor) RETURNING id INTO created;
  RETURN jsonb_build_object('status','success','code','created','id',created);
END $$;
--> statement-breakpoint
CREATE FUNCTION cv_protect_reward_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_usd IS DISTINCT FROM OLD.total_usd AND EXISTS(SELECT 1 FROM booking_benefits WHERE booking_id=OLD.id AND kind='discount') THEN
    RAISE EXCEPTION 'booking reward price is immutable' USING ERRCODE='23514',CONSTRAINT='bookings_reward_price_locked';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_reward_price_guard BEFORE UPDATE OF total_usd ON bookings FOR EACH ROW EXECUTE FUNCTION cv_protect_reward_price();

--> statement-breakpoint
CREATE FUNCTION cv_reward_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'active'-'deactivated_at'-'deactivated_by') IS DISTINCT FROM (to_jsonb(OLD)-'active'-'deactivated_at'-'deactivated_by') THEN
    RAISE EXCEPTION 'reward version is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reward_rules_immutable BEFORE UPDATE OR DELETE ON reward_rule_versions FOR EACH ROW EXECUTE FUNCTION cv_reward_version_immutable();
CREATE TRIGGER reward_catalog_immutable BEFORE UPDATE OR DELETE ON reward_catalog_versions FOR EACH ROW EXECUTE FUNCTION cv_reward_version_immutable();
