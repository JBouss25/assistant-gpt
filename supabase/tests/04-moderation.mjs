import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;`);
const files = process.argv.slice(2);
for (const f of files) await db.exec(readFileSync(f, "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;`);
for (const f of files) {
  const sql = readFileSync(f, "utf8").replace(/^\s*--.*$/gm, "");
  for (const s of sql.split(";").map(x => x.trim()).filter(x => /^(revoke|grant)\s/i.test(x))) await db.exec(s + ";");
}
const T="11111111-1111-1111-1111-111111111111", S="22222222-2222-2222-2222-222222222222", X="33333333-3333-3333-3333-333333333333", R="aaaaaaaa-0000-0000-0000-000000000001";
await db.exec(`insert into auth.users values ('${T}','{"role":"teacher"}'),('${S}','{"role":"student"}'),('${X}','{"role":"student"}');
insert into teacher_profiles (id, subjects, levels) values ('${T}','{Maths}','{lycee}');
insert into match_requests (id, student_id, teacher_id, subject, status) values ('${R}','${S}','${T}','Maths','accepted');`);
async function as(uid, q, p) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return { ok: true, res: await db.query(q, p) }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); }
}
const check = (n, c, r) => { console.log((c ? "PASS " : "FAIL ") + n + (!c && r?.err ? " -> " + r.err : "")); if (!c) process.exitCode = 1; };
const future = "'" + new Date(Date.now() + 5*864e5).toISOString() + "'";
let r;
r = await as(S, `insert into messages (request_id, sender_id, body) values ($1,$2,'avant')`, [R, S]); check("message before block", r.ok, r);
r = await as(S, `select block_state($1) s`, [R]); check("state none", r.ok && r.res.rows[0].s === "none", r);
r = await as(X, `insert into blocks values ($1,$2)`, [X, T]); check("cannot block a stranger", !r.ok);
r = await as(X, `insert into reports (reporter_id, reported_id, reason) values ($1,$2,'spam spam spam')`, [X, T]); check("cannot report a stranger", !r.ok);
r = await as(T, `insert into reports (reporter_id, reported_id, request_id, reason) values ($1,$2,$3,'Propos déplacés')`, [T, S, R]); check("teacher reports student", r.ok, r);
r = await as(S, `select * from reports`); check("reported user cannot see report", r.ok && r.res.rows.length === 0);
r = await as(T, `insert into blocks values ($1,$2)`, [T, S]); check("teacher blocks student", r.ok, r);
r = await as(T, `select block_state($1) s`, [R]); check("state by_me", r.res.rows[0].s === "by_me");
r = await as(S, `select block_state($1) s`, [R]); check("state by_other", r.res.rows[0].s === "by_other");
r = await as(S, `insert into messages (request_id, sender_id, body) values ($1,$2,'après')`, [R, S]); check("blocked student cannot write", !r.ok);
r = await as(T, `insert into messages (request_id, sender_id, body) values ($1,$2,'après')`, [R, T]); check("blocker cannot write either", !r.ok);
r = await as(S, `select count(*)::int n from messages`); check("history still readable", r.res.rows[0].n === 1);
r = await as(S, `insert into lessons (request_id, starts_at, duration_minutes) values ($1, ${future}, 90)`, [R]); check("no booking when blocked", !r.ok);
r = await as(S, `insert into match_requests (student_id, teacher_id, subject) values ($1,$2,'Physique')`, [S, T]); check("no new request when blocked", !r.ok);
r = await as(S, `delete from blocks`); check("blocked user cannot lift block", r.ok && r.res.affectedRows === 0);
r = await as(T, `delete from blocks where blocked_id=$1`, [S]); check("teacher unblocks", r.ok && r.res.affectedRows === 1);
r = await as(S, `insert into messages (request_id, sender_id, body) values ($1,$2,'de nouveau')`, [R, S]); check("messaging restored", r.ok, r);
