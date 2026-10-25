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
const T="11111111-1111-1111-1111-111111111111", S="22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users values ('${T}','{"role":"teacher"}'),('${S}','{"role":"student"}');
insert into teacher_profiles (id, subjects, levels) values ('${T}','{Maths}','{lycee}');
insert into match_requests (id, student_id, teacher_id, subject, status) values ('aaaaaaaa-0000-0000-0000-000000000001','${S}','${T}','Maths','accepted');
insert into messages (request_id, sender_id, body) values ('aaaaaaaa-0000-0000-0000-000000000001','${S}','Bonjour');`);
async function as(uid, q, p) {
  await db.exec(`set role ${uid ? "authenticated" : "anon"}; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return { ok: true, res: await db.query(q, p) }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); }
}
const check = (n, c, r) => { console.log((c ? "PASS " : "FAIL ") + n + (!c && r?.err ? " -> " + r.err : "")); if (!c) process.exitCode = 1; };
let r;
r = await as(S, `select register_device('fcm-token-abcdef', 'android')`); check("register own device", r.ok, r);
r = await as(S, `insert into device_tokens (token, user_id, platform) values ('fcm-token-zzzzzz', $1, 'ios')`, [T]); check("cannot insert token for someone else", !r.ok);
r = await as(T, `select * from device_tokens`); check("cannot read others' tokens", r.ok && r.res.rows.length === 0, r);
r = await as(T, `select register_device('fcm-token-abcdef', 'android')`); check("token reassigned on account switch", r.ok, r);
r = await db.query(`select user_id from device_tokens`); check("token now belongs to teacher", r.rows[0].user_id === T);
r = await as(T, `select register_device('x', 'android')`); check("short token rejected", !r.ok);
r = await as("", `select delete_own_account()`); check("anon cannot delete accounts", !r.ok);
r = await as(S, `select delete_own_account()`); check("student deletes own account", r.ok, r);
r = await db.query(`select (select count(*) from auth.users where id='${S}')::int u, (select count(*) from profiles where id='${S}')::int p, (select count(*) from messages)::int m, (select count(*) from match_requests)::int q, (select count(*) from auth.users)::int total`);
check("cascade removed student data only", JSON.stringify(r.rows[0]) === JSON.stringify({ u: 0, p: 0, m: 0, q: 0, total: 1 }), { err: JSON.stringify(r.rows[0]) });
