import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
// Stub minimal du schéma Supabase (auth + rôles).
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
`);
await db.exec(readFileSync(process.argv[2], "utf8"));
await db.exec(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant execute on all functions in schema public, auth to anon, authenticated;`);
// Supabase accorde les privilèges par défaut ; on rejoue les revokes/grants de colonnes.
const sql = readFileSync(process.argv[2], "utf8");
for (const stmt of sql.split(";").map(s=>s.trim()).filter(s => /^(revoke|grant)/i.test(s.replace(/^--.*\n/gm,"")))) await db.exec(stmt.replace(/^--.*\n/gm,"") + ";");

const T = "11111111-1111-1111-1111-111111111111", S = "22222222-2222-2222-2222-222222222222", S2 = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users values
 ('${T}', '{"role":"teacher","full_name":"Claire Prof"}'),
 ('${S}', '{"role":"student","full_name":"Léo Élève"}'),
 ('${S2}', '{"role":"teacher","full_name":"Hack Er"}');`);
// S2 tente de se déclarer enseignant -> devient bien teacher (métadonnée), OK. Changeons: S2 est un élève.
await db.exec(`update public.profiles set role='student' where id='${S2}'`);

async function as(uid, q, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return { ok: true, res: await db.query(q, params) }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec(`reset role;`); }
}
const check = (name, cond) => { console.log((cond ? "PASS " : "FAIL ") + name); if (!cond) process.exitCode = 1; };

let r;
r = await as(T, `insert into teacher_profiles (id, headline, bio, subjects, levels, hourly_rate) values ($1,'Prof agrégée','bio', '{Mathématiques}', '{lycee}', 35)`, [T]);
check("teacher creates own profile", r.ok);
r = await as(T, `insert into teacher_profiles (id, headline, bio, subjects, levels, hourly_rate) values ($1,'x','x','{}','{}',35) on conflict (id) do update set headline=excluded.headline, bio=excluded.bio`, [T]);
check("teacher upsert works", r.ok); if(!r.ok) console.log(r.err);
r = await as(T, `update teacher_profiles set rating_avg = 5 where id = $1`, [T]);
check("teacher cannot set own rating", !r.ok);
r = await as(S, `insert into teacher_profiles (id) values ($1)`, [S]);
check("student cannot create teacher profile", !r.ok);
r = await as(S, `update profiles set role='teacher' where id=$1`, [S]);
check("cannot change own role", !r.ok);
r = await as(S, `insert into student_profiles (id, level, subjects) values ($1, 'lycee', '{Mathématiques}')`, [S]);
check("student creates own profile", r.ok);
r = await as(T, `select * from student_profiles`);
check("teacher cannot see unrelated student", r.ok && r.res.rows.length === 0);
r = await as(S, `insert into match_requests (student_id, teacher_id, subject, message) values ($1,$2,'Mathématiques','Bonjour je voudrais des cours') returning id`, [S, T]);
check("student sends request", r.ok);
const reqId = r.res.rows[0].id;
r = await as(S, `insert into match_requests (student_id, teacher_id, subject) values ($1,$2,'Mathématiques')`, [S, T]);
check("duplicate pending rejected", !r.ok && /duplicate|unique/.test(r.err));
r = await as(S2, `insert into match_requests (student_id, teacher_id, subject) values ($1,$2,'Mathématiques')`, [S, T]);
check("cannot send request as someone else", !r.ok);
r = await as(S2, `select * from match_requests`);
check("outsider sees no requests", r.ok && r.res.rows.length === 0);
r = await as(T, `select * from student_profiles`);
check("teacher sees connected student", r.ok && r.res.rows.length === 1);
r = await as(S, `insert into reviews (teacher_id, student_id, rating) values ($1,$2,5)`, [T, S]);
check("review before accepted rejected", !r.ok);
r = await as(S, `update match_requests set status='accepted' where id=$1`, [reqId]);
check("student cannot accept own request", !r.ok);
r = await as(T, `update match_requests set message='hacked' where id=$1`, [reqId]);
check("teacher cannot edit message", !r.ok);
r = await as(T, `update match_requests set status='accepted' where id=$1`, [reqId]);
check("teacher accepts", r.ok && r.res.affectedRows === 1);
r = await as(T, `update match_requests set status='declined' where id=$1`, [reqId]);
check("cannot re-process request", !r.ok);
r = await as(S, `insert into reviews (teacher_id, student_id, rating, comment) values ($1,$2,4,'Top')`, [T, S]);
check("review after accepted", r.ok);
r = await as(S, `update reviews set rating=5 where student_id=$1`, [S]);
check("student updates review", r.ok);
r = await as(S, `update reviews set teacher_id=$2 where student_id=$1`, [S, S2]);
check("cannot move review to other teacher", !r.ok);
r = await db.query(`select rating_avg, rating_count from teacher_profiles where id=$1`, [T]);
check("rating recomputed", Number(r.rows[0].rating_avg) === 5 && r.rows[0].rating_count === 1);
await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
r = await db.query(`select p.full_name, t.headline from teacher_profiles t join profiles p on p.id=t.id`);
check("anon sees published teachers", r.rows.length === 1);
r = await db.query(`select * from profiles where role='student'`);
check("anon cannot see students", r.rows.length === 0);
await db.exec(`reset role`);
