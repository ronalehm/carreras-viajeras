-- Run in a disposable local database after migrations; every fixture rolls back.
BEGIN;
SET LOCAL TIME ZONE 'America/Lima';
CREATE TEMP TABLE reward_assertions(label text NOT NULL);
CREATE FUNCTION pg_temp.reward_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',label; END IF; INSERT INTO reward_assertions VALUES(label); END $$;
DO $$
DECLARE rule uuid; newer_rule uuid; discount uuid; benefit uuid; expire_item uuid; actor text:='test_rewards_admin';
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); old_booking uuid:=gen_random_uuid(); own_booking uuid:=gen_random_uuid(); paid_booking uuid:=gen_random_uuid();
  trip uuid:=gen_random_uuid(); redemption uuid; held uuid; foreign_held uuid; expired_held uuid; request_key uuid:=gen_random_uuid(); result jsonb; violation text;
BEGIN
  INSERT INTO profiles(user_id,email) VALUES(actor,'rewards-admin@example.test');
  INSERT INTO trips(id,slug,title,city,country,race_date,distances,summary) VALUES(trip,'rewards-integration-trip','Integration race','Lima','Peru','2027-01-01',ARRAY['42K'],'Rewards test trip');
  INSERT INTO referral_codes(user_id,code) VALUES('test_rewards_owner',repeat('A',32)),('test_rewards_other',repeat('B',32));
  result:=cv_claim_referral('test_referred_a',repeat('A',32),false,gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='terms_required','claim requires terms');
  result:=cv_claim_referral('test_referred_a',repeat('A',32),true,gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='program_unavailable','no rule means no program');
  result:=cv_request_reward('test_rewards_owner',gen_random_uuid(),gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='program_unavailable','no rule blocks redemption');
  result:=cv_create_reward_rule(actor,20,NULL,current_date,NULL,'Confirm booking and first valid payment.',true); rule:=(result->>'id')::uuid;
  result:=cv_claim_referral('test_referred_a',repeat('A',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='program_unavailable','active rule without active prize cannot promise stars');
  result:=cv_create_reward_catalog(actor,NULL,'discount','Travel discount','Discount for an unpaid pending owned booking.',20,25,2,2,30,current_date,NULL,true); discount:=(result->>'id')::uuid;
  result:=cv_claim_referral('test_referred_a',repeat('A',32),true,gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='program_unavailable','stale displayed rule cannot be accepted');
  result:=cv_claim_referral('test_rewards_owner',repeat('A',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='self_referral','self referral rejected');
  result:=cv_claim_referral('test_referred_a',repeat('A',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='attributed','new attribution accepted');
  result:=cv_claim_referral('test_referred_a',repeat('A',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='unchanged' AND (SELECT count(*)=1 FROM runner_referrals WHERE referred_user_id='test_referred_a'),'claim replay is idempotent');
  result:=cv_claim_referral('test_referred_a',repeat('B',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='already_attributed','attribution cannot switch owner');
  INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,package_label,total_usd,created_by,created_at)
    VALUES(old_booking,trip,'Old runner','old@example.test','test_old_runner','Standard',500,actor,now()-interval '1 day');
  result:=cv_claim_referral('test_old_runner',repeat('A',32),true,rule);
  PERFORM pg_temp.reward_assert(result->>'code'='not_eligible','no retroactive attribution after a booking');
  INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,package_label,total_usd,created_by)
    VALUES(a,trip,'Runner A','a@example.test','test_referred_a','Standard',500,actor);
  INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(a,50,current_date,'First payment',actor);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=0,'payment alone does not qualify');
  UPDATE bookings SET status='confirmed' WHERE id=a;
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=20,'payment before confirmation credits exactly once');
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=20 AND (SELECT count(*)=1 FROM reward_ledger WHERE user_id='test_rewards_owner'),'reconcile replay creates no extra credit');
  PERFORM cv_claim_referral('test_referred_b',repeat('A',32),true,rule);
  PERFORM cv_claim_referral('test_referred_c',repeat('A',32),true,rule);
  INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,status,package_label,total_usd,created_by)
    VALUES(b,trip,'Runner B','b@example.test','test_referred_b','confirmed','Standard',500,actor),
          (c,trip,'Runner C','c@example.test','test_referred_c','confirmed','Standard',500,actor);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=20,'confirmation alone does not qualify');
  INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(b,50,current_date,'First payment',actor),(c,50,current_date,'First payment',actor);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=60,'confirmation before payment qualifies and third runner credits');
  result:=cv_create_reward_rule(actor,50,NULL,current_date,NULL,'New rules do not rewrite earlier accepted promises.',true); newer_rule:=(result->>'id')::uuid;
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=60 AND (SELECT rule_version_id=rule FROM runner_referrals WHERE referred_user_id='test_referred_a'),'rule updates keep accepted frozen amounts');
  BEGIN UPDATE reward_rule_versions SET points_per_referral=999 WHERE id=rule; RAISE EXCEPTION 'expected check'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.reward_assert((SELECT points_per_referral=20 FROM reward_rule_versions WHERE id=rule),'rule history is immutable');
  result:=cv_create_reward_catalog(actor,NULL,'benefit','Race kit','One non monetary race kit for this runner.',10,NULL,1,1,30,current_date,NULL,true); benefit:=(result->>'id')::uuid;
  result:=cv_request_reward('test_rewards_owner',discount,request_key); redemption:=(result->>'id')::uuid;
  PERFORM pg_temp.reward_assert(result->>'code'='redeemed' AND cv_reconcile_rewards('test_rewards_owner')=40,'redemption debits wallet atomically');
  result:=cv_request_reward('test_rewards_owner',discount,request_key);
  PERFORM pg_temp.reward_assert(result->>'id'=redemption::text AND cv_reconcile_rewards('test_rewards_owner')=40,'same request key debits once');
  result:=cv_request_reward('test_rewards_owner',benefit,request_key);
  PERFORM pg_temp.reward_assert(result->>'code'='idempotency_conflict','request key cannot be reused for another prize');
  result:=cv_cancel_reward('stranger',redemption);
  PERFORM pg_temp.reward_assert(result->>'code'='not_found','another runner cannot cancel redemption');
  PERFORM cv_cancel_reward('test_rewards_owner',redemption);
  PERFORM cv_cancel_reward('test_rewards_owner',redemption);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=60 AND (SELECT count(*)=1 FROM reward_ledger WHERE cause_key='refund:'||redemption),'cancel and replay refund exactly once');
  result:=cv_request_reward('test_rewards_owner',discount,gen_random_uuid()); redemption:=(result->>'id')::uuid;
  INSERT INTO bookings(id,trip_id,participant_name,participant_email,runner_user_id,package_label,total_usd,created_by)
    VALUES(own_booking,trip,'Owner runner','owner@example.test','test_rewards_owner','Standard',500,actor),
          (paid_booking,trip,'Paid owner runner','paid-owner@example.test','test_rewards_owner','Standard',500,actor);
  INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(paid_booking,50,current_date,'Payment blocks discount',actor);
  result:=cv_apply_booking_reward(actor,redemption,a);
  PERFORM pg_temp.reward_assert(result->>'code'='not_found','discount cannot cross runner ownership');
  result:=cv_apply_booking_reward(actor,redemption,paid_booking);
  PERFORM pg_temp.reward_assert(result->>'code'='booking_not_eligible','paid booking cannot be discounted');
  result:=cv_apply_booking_reward(actor,redemption,own_booking);
  PERFORM pg_temp.reward_assert(result->>'code'='applied' AND (SELECT total_usd=475 FROM bookings WHERE id=own_booking),'discount applies once to pending unpaid booking');
  result:=cv_apply_booking_reward(actor,redemption,own_booking);
  PERFORM pg_temp.reward_assert(result->>'code'='unchanged' AND (SELECT count(*)=1 FROM booking_benefits WHERE booking_id=own_booking AND kind='discount'),'discount application replay preserves one evidence');
  violation:=NULL;
  BEGIN UPDATE bookings SET total_usd=600 WHERE id=own_booking; EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS violation=CONSTRAINT_NAME; END;
  PERFORM pg_temp.reward_assert(violation='bookings_reward_price_locked' AND (SELECT total_usd=475 FROM bookings WHERE id=own_booking),'discounted price is immutable with named constraint');
  result:=cv_cancel_reward('test_rewards_owner',redemption);
  PERFORM pg_temp.reward_assert(result->>'code'='invalid_transition','applied discount cannot be refunded');
  result:=cv_assign_booking_benefit(actor,own_booking,'Hotel','Three nights of contracted accommodation.');
  PERFORM pg_temp.reward_assert(result->>'code'='assigned','contractual benefit records evidence');
  result:=cv_assign_booking_benefit(actor,own_booking,'Hotel','Three nights of contracted accommodation.');
  PERFORM pg_temp.reward_assert(result->>'code'='unchanged','repeated contractual evidence does not duplicate');
  result:=cv_request_reward('test_rewards_owner',discount,gen_random_uuid()); held:=(result->>'id')::uuid;
  UPDATE bookings SET status='cancelled' WHERE id=a;
  UPDATE booking_payments SET voided_at=now(),voided_by=actor WHERE booking_id IN(b,c);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=-40,'cancellation and voided first payments append compensating reversals');
  result:=cv_apply_booking_reward(actor,held,paid_booking);
  PERFORM pg_temp.reward_assert(result->>'code'='review_required','negative points block application of previously issued reward');
  result:=cv_request_reward('test_rewards_owner',benefit,gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='review_required','negative points block new redemption');
  PERFORM pg_temp.reward_assert((SELECT total_usd=475 FROM bookings WHERE id=own_booking),'reversal never rewrites applied discount price');
  PERFORM cv_cancel_reward('test_rewards_owner',held);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=-20,'available cancelled prize releases its reserved stars');
  UPDATE bookings SET status='confirmed' WHERE id=a;
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=0,'restored factual eligibility recredits frozen points');
  BEGIN UPDATE reward_ledger SET delta=delta+1 WHERE user_id='test_rewards_owner'; RAISE EXCEPTION 'expected check'; EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM pg_temp.reward_assert((SELECT balance=(SELECT sum(delta) FROM reward_ledger WHERE user_id='test_rewards_owner') FROM reward_accounts WHERE user_id='test_rewards_owner'),'immutable ledger reconciles exactly to persisted wallet');
  -- Fund a separate runner using a real attributed confirmed, paid booking.
  PERFORM cv_claim_referral('test_referred_d',repeat('B',32),true,newer_rule);
  INSERT INTO bookings(trip_id,participant_name,participant_email,runner_user_id,status,package_label,total_usd,created_by)
    VALUES(trip,'Runner D','d@example.test','test_referred_d','confirmed','Standard',500,actor) RETURNING id INTO b;
  INSERT INTO booking_payments(booking_id,amount_usd,paid_on,concept,recorded_by) VALUES(b,50,current_date,'First payment',actor);
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_other')=50,'second runner funded from valid referral');
  result:=cv_request_reward('test_rewards_other',discount,gen_random_uuid()); foreign_held:=(result->>'id')::uuid;
  PERFORM pg_temp.reward_assert(result->>'code'='redeemed','other runner can consume remaining inventory');
  -- Make owner eligible again, then verify global inventory and user limits.
  UPDATE booking_payments SET voided_at=NULL,voided_by=NULL WHERE booking_id=c;
  PERFORM pg_temp.reward_assert(cv_reconcile_rewards('test_rewards_owner')=20,'restored third runner restores available points');
  result:=cv_request_reward('test_rewards_owner',discount,gen_random_uuid());
  PERFORM pg_temp.reward_assert(result->>'code'='out_of_stock','inventory counts reservations across runners');
  PERFORM cv_cancel_reward('test_rewards_other',foreign_held);
  -- Expired reservation of OTHER runner must not consume stock without a revisit.
  result:=cv_create_reward_catalog(actor,NULL,'benefit','Limited kit','One limited kit with explicit expiry policy.',10,NULL,1,2,1,current_date,NULL,true); expire_item:=(result->>'id')::uuid;
  result:=cv_request_reward('test_rewards_other',expire_item,gen_random_uuid()); expired_held:=(result->>'id')::uuid;
  UPDATE reward_redemptions SET expires_at=now()-interval '1 second' WHERE id=expired_held;
  result:=cv_request_reward('test_rewards_owner',expire_item,gen_random_uuid()); held:=(result->>'id')::uuid;
  PERFORM pg_temp.reward_assert(result->>'code'='redeemed','expired reservation from absent other runner releases stock');
  PERFORM cv_reconcile_rewards('test_rewards_other');
  PERFORM cv_reconcile_rewards('test_rewards_other');
  PERFORM pg_temp.reward_assert((SELECT status='expired' FROM reward_redemptions WHERE id=expired_held) AND (SELECT count(*)=1 FROM reward_ledger WHERE cause_key='refund:'||expired_held),'expiry refunds once on owner reconciliation');
  result:=cv_fulfill_reward(actor,held);
  PERFORM pg_temp.reward_assert(result->>'code'='applied','non monetary reward can be marked delivered');
  result:=cv_fulfill_reward(actor,held);
  PERFORM pg_temp.reward_assert(result->>'code'='unchanged','non monetary delivery replay is idempotent');
END $$;
SELECT count(*) AS assertions_passed FROM reward_assertions;
ROLLBACK;
