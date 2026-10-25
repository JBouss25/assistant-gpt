import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;`);
const files = process.argv.slice(2);
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;`);
for (const f of files) {
  const sql = readFileSync(f, "utf8").replace(/^\s*--.*$/gm, "");
  for (const s of sql.split(";").map(x => x.trim()).filter(x => /^(revoke|grant)\s/i.test(x))) await db.exec(s + ";");
}
const T="11111111-1111-1111-1111-111111111111", S="22222222-2222-2222-2222-222222222222", X="33333333-3333-3333-3333-333333333333", S3="44444444-4444-4444-4444-444444444444";
await db.exec(`insert into auth.users values ('${T}','{"role":"teacher"}'),('${S}','{"role":"student"}'),('${X}','{"role":"student"}'),('${S3}','{"role":"student"}');
insert into teacher_profiles (id, subjects, levels) values ('${T}','{Maths}','{lycee}');
insert into match_requests (id, student_id, teacher_id, subject, status) values
 ('aaaaaaaa-0000-0000-0000-000000000001','${S}','${T}','Maths','accepted'),
 ('aaaaaaaa-0000-0000-0000-000000000002','${X}','${T}','Maths','pending'),
 ('aaaaaaaa-0000-0000-0000-000000000003','${S3}','${T}','Maths','accepted');`);
const R1='aaaaaaaa-0000-0000-0000-000000000001', R2='aaaaaaaa-0000-0000-0000-000000000002', R3='aaaaaaaa-0000-0000-0000-000000000003';
async function as(uid, q, p) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return { ok: true, res: await db.query(q, p) }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); }
}
const check = (n, c, r) => { console.log((c ? "PASS " : "FAIL ") + n + (!c && r?.err ? "  -> " + r.err : "")); if (!c) process.exitCode = 1; };
let r;
r = await as(S, `insert into messages (request_id, sender_id, body) values ($1,$2,'Bonjour !')`, [R1, S]); check("student messages accepted teacher", r.ok, r);
r = await as(T, `insert into messages (request_id, sender_id, body) values ($1,$2,'Bienvenue')`, [R1, T]); check("teacher replies", r.ok, r);
r = await as(T, `insert into messages (request_id, sender_id, body) values ($1,$2,'fake')`, [R1, S]); check("cannot spoof sender", !r.ok);
r = await as(X, `insert into messages (request_id, sender_id, body) values ($1,$2,'hi')`, [R2, X]); check("no messaging on pending request", !r.ok);
r = await as(X, `select * from messages`); check("outsider reads nothing", r.ok && r.res.rows.length === 0, r);
r = await as(T, `insert into messages (request_id, sender_id, body) values ($1,$2,'   ')`, [R1, T]); check("blank message rejected", !r.ok);
r = await as(S, `update messages set body='edited'`); check("messages immutable", !r.ok);
const at = "'" + new Date(Date.now() + 3*864e5).toISOString() + "'::timestamptz";
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, ${at}, 90) returning *`, [R1]);
check("student proposes 1h30", r.ok && r.res.rows[0].teacher_id === T && r.res.rows[0].proposed_by === S, r);
const L1 = r.ok && r.res.rows[0].id;
check("ends_at computed", r.ok && new Date(r.res.rows[0].ends_at) - new Date(r.res.rows[0].starts_at) === 90*60000);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() + interval '10 days', 60)`, [R1]); check("1h rejected", !r.ok);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() + interval '10 days', 150)`, [R1]); check("2h30 rejected", !r.ok);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() + interval '10 days', 100)`, [R1]); check("non-15min step rejected", !r.ok);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() - interval '1 day', 120)`, [R1]); check("past date rejected", !r.ok);
r = await as(S3, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, ${at} + interval '1 hour', 120)`, [R3]); check("teacher overlap rejected", !r.ok && /chevauche/.test(r.err), r);
r = await as(S3, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, ${at} + interval '90 minutes', 120)`, [R3]); check("back-to-back allowed", r.ok, r);
r = await as(X, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() + interval '20 days', 90)`, [R2]); check("no booking on pending request", !r.ok);
r = await as(X, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, now() + interval '20 days', 90)`, [R1]); check("outsider cannot book", !r.ok);
r = await as(S, `update lessons set status='confirmed' where id=$1`, [L1]); check("proposer cannot self-confirm", !r.ok);
r = await as(S, `update lessons set starts_at = starts_at + interval '1 day' where id=$1`, [L1]); check("cannot move a lesson", !r.ok);
r = await as(T, `update lessons set status='confirmed' where id=$1`, [L1]); check("teacher confirms", r.ok && r.res.affectedRows === 1, r);
r = await as(X, `select * from lessons`); check("outsider sees no lessons", r.ok && r.res.rows.length === 0);
r = await as(S, `update lessons set status='cancelled' where id=$1`, [L1]); check("student cancels", r.ok && r.res.affectedRows === 1, r);
r = await as(T, `update lessons set status='confirmed' where id=$1`, [L1]); check("cancelled is final", !r.ok);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, ${at}, 90)`, [R1]); check("slot free again after cancel", r.ok, r);
