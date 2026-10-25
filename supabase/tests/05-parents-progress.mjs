import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;`);
const files = process.argv.slice(2);
// Supabase accorde les droits par défaut sur les nouvelles tables avant que les migrations ne les restreignent.
for (const f of files) await db.exec(readFileSync(f, "utf8"));
const T="11111111-1111-1111-1111-111111111111", S="22222222-2222-2222-2222-222222222222", P="33333333-3333-3333-3333-333333333333", P2="44444444-4444-4444-4444-444444444444", T2="55555555-5555-5555-5555-555555555555", S2="66666666-6666-6666-6666-666666666666";
await db.exec(`insert into auth.users values ('${T}','{"role":"teacher","full_name":"Prof"}'),('${S}','{"role":"student","full_name":"Élève"}'),('${P}','{"role":"parent","full_name":"Parent"}'),('${P2}','{"role":"parent"}'),('${T2}','{"role":"teacher"}'),('${S2}','{"role":"student"}');
insert into teacher_profiles (id, subjects, levels) values ('${T}','{Maths}','{lycee}'),('${T2}','{Maths}','{lycee}');
insert into student_profiles (id, level, subjects) values ('${S}','lycee','{Maths}'),('${S2}','lycee','{Maths}');
insert into match_requests (id, student_id, teacher_id, subject, status) values ('aaaaaaaa-0000-0000-0000-000000000001','${S}','${T}','Maths','accepted');
alter table lessons disable trigger lessons_prepare;
insert into lessons (id, request_id, teacher_id, student_id, subject, starts_at, duration_minutes, ends_at, status, proposed_by) values
 ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','${T}','${S}','Maths', now()-interval '3 days', 90, now()-interval '3 days'+interval '90 min','confirmed','${S}'),
 ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','${T}','${S}','Maths', now()+interval '3 days', 90, now()+interval '3 days'+interval '90 min','confirmed','${S}'),
 ('bbbbbbbb-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','${T}','${S}','Maths', now()-interval '6 days', 90, now()-interval '6 days'+interval '90 min','proposed','${S}');
alter table lessons enable trigger lessons_prepare;`);
async function as(uid, q, p) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid}',false);`);
  try { return { ok: true, res: await db.query(q, p) }; } catch (e) { return { ok: false, err: e.message }; } finally { await db.exec("reset role"); }
}
const check = (n, c, r) => { console.log((c ? "PASS " : "FAIL ") + n + (!c && r?.err ? " -> " + r.err : "")); if (!c) process.exitCode = 1; };
const L1='bbbbbbbb-0000-0000-0000-000000000001', L2='bbbbbbbb-0000-0000-0000-000000000002', L3='bbbbbbbb-0000-0000-0000-000000000003';
let r;
r = await db.query(`select role from profiles where id='${P}'`); check("parent role at signup", r.rows[0].role === "parent");
r = await as(S, `select my_parent_code() c`); const code = r.res.rows[0].c; check("student reads own code", /^[2-9A-HJ-NP-Z]{8}$/.test(code), r);
r = await as(T, `select parent_code from student_profiles`); check("teacher cannot read parent_code", !r.ok);
r = await as(T, `select id, level from student_profiles`); check("teacher still reads connected student", r.ok && r.res.rows.length === 1, r);
r = await as(P, `select * from student_profiles`); check("parent cannot select * either", !r.ok);
r = await as(T, `select link_child($1)`, [code]); check("teacher cannot link child", !r.ok);
r = await as(P, `select link_child($1)`, ['ZZZZZZZZ']); check("wrong code rejected", !r.ok && /Code inconnu/.test(r.err), r);
r = await as(P, `select link_child($1) id`, [code.toLowerCase() + ' ']); check("parent links child (case/space tolerant)", r.ok && r.res.rows[0].id === S, r);
r = await as(P, `insert into parent_links values ($1,$2)`, [P, S2]); check("cannot link without code", !r.ok);
r = await as(P, `select full_name from profiles where id=$1`, [S]); check("parent sees child profile", r.res.rows.length === 1);
r = await as(P, `select id from profiles where id=$1`, [S2]); check("parent cannot see other students", r.res.rows.length === 0);
r = await as(S, `select full_name from profiles where id=$1`, [P]); check("child sees parent name", r.res.rows.length === 1);
r = await as(P, `select level, grade from student_profiles where id=$1`, [S]); check("parent sees child schooling", r.ok && r.res.rows.length === 1, r);
r = await as(P, `select count(*)::int n from lessons`); check("parent sees child lessons", r.res.rows[0].n === 3);
r = await as(P2, `select count(*)::int n from lessons`); check("other parent sees nothing", r.res.rows[0].n === 0);
r = await as(P, `insert into messages (request_id, sender_id, body) values ('aaaaaaaa-0000-0000-0000-000000000001',$1,'hi')`, [P]); check("parent cannot write in child's chat", !r.ok);
r = await as(T, `insert into lesson_reports (lesson_id, grade, engagement, topics) values ($1, 14.5, 4, 'Dérivées') returning student_id, subject`, [L1]); check("teacher writes report for finished lesson", r.ok && r.res.rows[0].student_id === S, r);
r = await as(T, `insert into lesson_reports (lesson_id, grade, engagement) values ($1, 12, 3)`, [L1]); check("one report per lesson", !r.ok);
r = await as(T, `insert into lesson_reports (lesson_id, grade, engagement) values ($1, 12, 3)`, [L2]); check("no report before lesson ends", !r.ok);
r = await as(T, `insert into lesson_reports (lesson_id, grade, engagement) values ($1, 12, 3)`, [L3]); check("no report on unconfirmed lesson", !r.ok);
r = await as(T2, `insert into lesson_reports (lesson_id, grade, engagement) values ($1, 12, 3)`, [L1]); check("other teacher cannot report", !r.ok);
r = await as(S, `insert into lesson_reports (lesson_id, grade, engagement) values ($1, 20, 5)`, [L1]); check("student cannot self-grade", !r.ok);
r = await as(T, `update lesson_reports set grade = 25`); check("grade capped at 20", !r.ok);
r = await as(T, `update lesson_reports set grade = 15 returning grade`); check("teacher edits own report", r.ok && Number(r.res.rows[0].grade) === 15, r);
r = await as(T, `update lesson_reports set student_id = $1`, [S2]); check("cannot reassign report", !r.ok);
for (const [who, n, label] of [[S, 1, "student"], [P, 1, "parent"], [P2, 0, "other parent"], [T2, 0, "other teacher"]]) {
  r = await as(who, `select count(*)::int n from lesson_reports`); check(`${label} report visibility`, r.res.rows[0].n === n);
}
r = await as(S, `select regenerate_parent_code() c`); check("student regenerates code", r.ok && r.res.rows[0].c !== code, r);
r = await as(P, `select count(*)::int n from parent_links`); check("existing link kept", r.res.rows[0].n === 1);
r = await as(S, `delete from parent_links where parent_id=$1`, [P]); check("child can remove parent", r.ok && r.res.affectedRows === 1, r);
r = await as(P, `select count(*)::int n from lesson_reports`); check("parent loses access after unlink", r.res.rows[0].n === 0);
