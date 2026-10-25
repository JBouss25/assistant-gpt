-- Données de démonstration (supabase db reset). Mot de passe des comptes : mentora-demo
-- Ne pas exécuter en production.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'claire.dubois@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Claire Dubois"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Lyon', onboarded = true where id = '00000000-0000-4000-8000-000000000001';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000001', 'Agrégée de physique-chimie, colleuse en PCSI', 'Professeure agrégée depuis 12 ans, j''enseigne en lycée et interroge en PCSI. J''aide les élèves à structurer leur raisonnement, à maîtriser la mécanique et la thermodynamique et à gagner en confiance avant les concours.', '{"Physique-Chimie","Mathématiques"}', '{"lycee","cpge"}', 45, 'both', 12, 'Agrégation de physique-chimie, ENS Lyon', '{"mon_evening","wed_afternoon","sat_morning","sat_afternoon"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'karim.haddad@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Karim Haddad"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Paris', onboarded = true where id = '00000000-0000-4000-8000-000000000002';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000002', 'Ingénieur centralien, maths du lycée au supérieur', 'Ingénieur de formation, je donne des cours de mathématiques depuis 8 ans. Ma méthode : des fiches synthétiques, beaucoup d''exercices types bac et concours, et un suivi hebdomadaire de la progression.', '{"Mathématiques","NSI / Informatique"}', '{"lycee","cpge","universite"}', 50, 'online', 8, 'Diplôme d''ingénieur Centrale Paris', '{"tue_evening","thu_evening","sun_afternoon"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'ines.moreau@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Inès Moreau"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Bordeaux', onboarded = true where id = '00000000-0000-4000-8000-000000000003';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000003', 'Docteure en biologie, SVT et méthodologie', 'Docteure en biologie cellulaire, j''accompagne lycéens et étudiants de licence en SVT. J''insiste sur la méthodologie : prise de notes, schémas-bilans, gestion du temps en examen.', '{"SVT","Méthodologie"}', '{"lycee","universite"}', 35, 'both', 6, 'Doctorat de biologie, Université de Bordeaux', '{"wed_afternoon","fri_evening","sat_morning"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'thomas.lefevre@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Thomas Lefèvre"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Lille', onboarded = true where id = '00000000-0000-4000-8000-000000000004';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000004', 'Professeur certifié de français, spécialiste du bac', 'Professeur de lettres en collège et lycée, je prépare au brevet et aux épreuves anticipées de français : commentaire, dissertation, oral. Cours vivants, méthodes claires.', '{"Français","Philosophie"}', '{"college","lycee"}', 30, 'both', 10, 'CAPES de lettres modernes', '{"mon_evening","wed_morning","wed_afternoon"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'sarah.benali@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Sarah Benali"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Marseille', onboarded = true where id = '00000000-0000-4000-8000-000000000005';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000005', 'Enseignante d''anglais bilingue, du collège à la fac', 'Bilingue franco-britannique, j''enseigne l''anglais avec une approche communicative. Préparation aux certifications (TOEIC, IELTS), au bac et aux oraux de concours.', '{"Anglais","Espagnol"}', '{"college","lycee","universite"}', 32, 'online', 7, 'Master LLCER anglais, CELTA', '{"tue_evening","thu_afternoon","sat_afternoon","sun_morning"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'julien.martin@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Julien Martin"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Toulouse', onboarded = true where id = '00000000-0000-4000-8000-000000000006';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000006', 'Étudiant en M2 de maths, soutien collège & lycée', 'Étudiant en master de mathématiques appliquées, je propose un soutien patient et bienveillant pour reprendre les bases et préparer le brevet ou le bac. Premier cours d''évaluation offert.', '{"Mathématiques","Physique-Chimie"}', '{"college","lycee"}', 22, 'in_person', 3, 'Licence de mathématiques', '{"mon_afternoon","wed_afternoon","fri_afternoon","sat_morning"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'elodie.garnier@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Élodie Garnier"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Nantes', onboarded = true where id = '00000000-0000-4000-8000-000000000007';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000007', 'Professeure de SES et d''économie', 'Professeure agrégée de sciences économiques et sociales, j''accompagne les lycéens en SES et les étudiants en économie (L1-L2) : dissertation, analyse de documents, maths appliquées.', '{"SES","Économie","Histoire-Géographie"}', '{"lycee","universite","cpge"}', 40, 'both', 9, 'Agrégation de SES', '{"tue_evening","wed_afternoon","sat_morning"}');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000008', 'authenticated', 'authenticated', 'antoine.rousseau@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"teacher","full_name":"Antoine Rousseau"}', now(), now(), '', '', '', '');
update public.profiles set city = 'Grenoble', onboarded = true where id = '00000000-0000-4000-8000-000000000008';
insert into public.teacher_profiles (id, headline, bio, subjects, levels, hourly_rate, mode, years_experience, diplomas, availability)
values ('00000000-0000-4000-8000-000000000008', 'Ingénieur logiciel, NSI et informatique de prépa', 'Développeur et ancien élève de MP2I, j''enseigne la programmation (Python, OCaml, C) et l''algorithmique : NSI au lycée, informatique de prépa et projets universitaires.', '{"NSI / Informatique","Mathématiques"}', '{"lycee","cpge","universite"}', 42, 'online', 5, 'Diplôme d''ingénieur Ensimag', '{"mon_evening","thu_evening","sun_afternoon","sun_evening"}');

-- ---------------------------------------------------------------------------
-- Famille de démonstration : Léa (élève de Terminale) et Sophie, sa mère.
-- Léa suit la physique-chimie avec Claire Dubois et les maths avec Karim Haddad.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'lea.bernard@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"student","full_name":"Léa Bernard"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated', 'sophie.bernard@demo.mentora.fr', extensions.crypt('mentora-demo', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"role":"parent","full_name":"Sophie Bernard"}', now(), now(), '', '', '', '');

update public.profiles set city = 'Lyon', onboarded = true
where id in ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201');

insert into public.student_profiles (id, level, grade, subjects, goals, budget_max, mode, availability, parent_code)
values ('00000000-0000-4000-8000-000000000101', 'lycee', 'Terminale', '{"Mathématiques","Physique-Chimie"}',
        'Réussir le bac avec mention et intégrer une prépa PCSI.', 50, 'both', '{"mon_evening","wed_afternoon","sat_morning"}', 'DEMO2026');

insert into public.parent_links (parent_id, student_id)
values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101');

insert into public.match_requests (id, student_id, teacher_id, subject, message, score, status) values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 'Bonjour, je voudrais progresser en mécanique avant le bac.', 99, 'accepted'),
  ('00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000002', 'Mathématiques', 'Bonjour, j''ai besoin d''aide en analyse.', 92, 'accepted');

insert into public.messages (request_id, sender_id, body, created_at) values
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Bonjour Léa ! On commence par la mécanique ?', now() - interval '60 days'),
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000101', 'Oui parfait, merci !', now() - interval '60 days' + interval '2 hours');

-- Cours passés (hebdomadaires) et un cours à venir : on contourne les contrôles « date future ».
alter table public.lessons disable trigger lessons_prepare;
alter table public.lesson_reports disable trigger lesson_reports_prepare;

with plan(n, req, teacher, subject, weeks_ago, minutes, grade, engagement, topics, homework) as (values
  (1, '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 9, 90, 9.0, 3, 'Cinématique : vitesse et accélération', 'Exercices 12 à 15 p. 84'),
  (2, '00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002', 'Mathématiques', 8, 120, 11.0, 4, 'Limites de suites', 'Fiche méthode n° 3'),
  (3, '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 7, 90, 10.5, 4, 'Lois de Newton', 'Refaire l''exercice du parachutiste'),
  (4, '00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002', 'Mathématiques', 6, 90, 11.5, 3, 'Dérivées et variations', ''),
  (5, '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 5, 120, 12.0, 4, 'Mouvement dans un champ uniforme', 'Sujet de bac 2025, partie A'),
  (6, '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 3, 90, 13.5, 5, 'Énergie mécanique', ''),
  (7, '00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002', 'Mathématiques', 2, 120, 13.5, 4, 'Fonction exponentielle', 'Exercices 40 à 44'),
  (8, '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', 'Physique-Chimie', 1, 90, 14.5, 5, 'Mouvement des satellites, lois de Kepler', 'Préparer le DS de vendredi')
),
inserted as (
  insert into public.lessons (id, request_id, teacher_id, student_id, subject, starts_at, duration_minutes, ends_at, note, status, proposed_by)
  select ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, req::uuid, teacher::uuid, '00000000-0000-4000-8000-000000000101',
         subject, date_trunc('day', now()) - make_interval(weeks => weeks_ago) + interval '15 hours', minutes,
         date_trunc('day', now()) - make_interval(weeks => weeks_ago) + interval '15 hours' + make_interval(mins => minutes),
         '', 'confirmed', '00000000-0000-4000-8000-000000000101'
  from plan
  returning id, teacher_id, student_id, subject, starts_at
)
insert into public.lesson_reports (lesson_id, teacher_id, student_id, subject, lesson_date, grade, engagement, topics, homework, comment)
select i.id, i.teacher_id, i.student_id, i.subject, i.starts_at, p.grade, p.engagement, p.topics, p.homework,
       case when p.n = 8 then 'Très bon cours, Léa gagne en autonomie. Continuer à rédiger proprement.' else '' end
from inserted i join plan p on ('00000000-0000-4000-a000-' || lpad(p.n::text, 12, '0'))::uuid = i.id;

-- Cours terminé il y a 2 jours, sans compte-rendu (à rédiger par Claire), et cours à venir.
insert into public.lessons (id, request_id, teacher_id, student_id, subject, starts_at, duration_minutes, ends_at, note, status, proposed_by) values
  ('00000000-0000-4000-a000-000000000009', '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Physique-Chimie',
   date_trunc('day', now()) - interval '2 days' + interval '17 hours', 90, date_trunc('day', now()) - interval '2 days' + interval '18 hours 30 minutes', '', 'confirmed', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-a000-000000000010', '00000000-0000-4000-9000-000000000002', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000101', 'Mathématiques',
   date_trunc('day', now()) + interval '5 days' + interval '14 hours 30 minutes', 120, date_trunc('day', now()) + interval '5 days' + interval '16 hours 30 minutes', 'Révisions DS', 'confirmed', '00000000-0000-4000-8000-000000000101');

alter table public.lessons enable trigger lessons_prepare;
alter table public.lesson_reports enable trigger lesson_reports_prepare;

-- ---------------------------------------------------------------------------
-- Outil de test (base locale uniquement, jamais en production) : crée un cours
-- confirmé déjà terminé, utilisé par e2e/famille.spec.ts. Réservé à la clé secrète.
-- ---------------------------------------------------------------------------
create or replace function public.e2e_insert_past_lesson(p_request uuid, p_starts timestamptz, p_ends timestamptz)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  req public.match_requests;
  new_id uuid;
begin
  select * into req from public.match_requests where id = p_request;
  alter table public.lessons disable trigger lessons_prepare;
  insert into public.lessons (request_id, teacher_id, student_id, subject, starts_at, duration_minutes, ends_at, status, proposed_by)
  values (req.id, req.teacher_id, req.student_id, req.subject, p_starts,
          (extract(epoch from p_ends - p_starts) / 60)::int, p_ends, 'confirmed', req.student_id)
  returning id into new_id;
  alter table public.lessons enable trigger lessons_prepare;
  return new_id;
end;
$$;
revoke execute on function public.e2e_insert_past_lesson(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.e2e_insert_past_lesson(uuid, timestamptz, timestamptz) to service_role;
