"""Tests d'API : consentement, RBAC, traçabilité, parcours de bout en bout, back-office, conformité."""
import statistics
import time

import pytest
from sqlalchemy import select

API = "/api/v1"


def student_id(client, headers):
    return client.get(f"{API}/auth/me", headers=headers).json()["id"]


# -- Consentement ---------------------------------------------------------------------------
def test_parent_sees_only_shared_scopes_and_revocation_is_immediate(client, login):
    parent = login("parent.yasmine@demo.ma")
    yasmine = login("yasmine@demo.ma")
    sid = student_id(client, yasmine)
    r = client.get(f"{API}/parent/children/{sid}/summary", headers=parent)
    assert r.status_code == 200
    body = r.json()
    assert "pistes" in body and "strengths" not in body  # « assessment » non partagé

    assert client.delete(f"{API}/students/me/consents/share_parent", headers=yasmine).status_code == 200
    t0 = time.perf_counter()
    assert client.get(f"{API}/parent/children/{sid}/summary", headers=parent).status_code == 403
    assert time.perf_counter() - t0 < 60
    client.post(f"{API}/students/me/consents", headers=yasmine, json={"kind": "share_parent", "scopes": ["profile", "pistes", "roadmap", "evidence"]})
    assert client.get(f"{API}/parent/children/{sid}/summary", headers=parent).status_code == 200


def test_parent_without_share_consent_sees_nothing(client, login):
    parent_adam = login("parent.adam@demo.ma")
    adam_id = student_id(client, login("adam@demo.ma"))
    assert client.get(f"{API}/parent/children/{adam_id}/summary", headers=parent_adam).status_code == 403
    # et un parent sans lien avec l'élève non plus
    assert client.get(f"{API}/parent/children/{adam_id}/summary", headers=login("parent.yasmine@demo.ma")).status_code == 403


# -- RBAC : cloisonnement par établissement, testé sur chaque endpoint conseiller --------------------------
COUNSELOR_STUDENT_ENDPOINTS = [
    ("get", "/counselor/students/{sid}", None),
    ("post", "/counselor/students/{sid}/notes", {"text": "test", "visibility": "counselor"}),
    ("post", "/counselor/students/{sid}/evidence/1/verify", None),
]


@pytest.mark.parametrize("method,path,payload", COUNSELOR_STUDENT_ENDPOINTS)
def test_counselor_cannot_access_other_establishment(client, login, method, path, payload):
    meknes = login("conseiller.meknes@demo.ma")
    yasmine_id = student_id(client, login("yasmine@demo.ma"))  # élève de Casablanca
    r = getattr(client, method)(API + path.format(sid=yasmine_id), headers=meknes, **({"json": payload} if payload else {}))
    assert r.status_code == 403


def test_counselor_lists_only_own_establishment(client, login):
    casa = client.get(f"{API}/counselor/cohort", headers=login("conseiller.casa@demo.ma")).json()
    names = {s["display_name"] for s in casa["students"]}
    assert "Yasmine" in names and "Adam" not in names and "Léa" not in names
    alerts = client.get(f"{API}/counselor/alerts", headers=login("conseiller.meknes@demo.ma")).json()
    assert all(a["display_name"] != "Yasmine" for a in alerts)


def test_role_isolation(client, login):
    student = login("adam@demo.ma")
    assert client.get(f"{API}/counselor/cohort", headers=student).status_code == 403
    assert client.get(f"{API}/referential/versions", headers=student).status_code == 403
    assert client.get(f"{API}/admin/stats", headers=login("conseiller.casa@demo.ma")).status_code == 403
    assert client.get(f"{API}/students/me/profile").status_code == 401


def test_student_cannot_replay_someone_else_run(client, login):
    adam_run = client.get(f"{API}/students/me/recommendations/latest", headers=login("adam@demo.ma")).json()["run_id"]
    r = client.get(f"{API}/students/me/recommendations/{adam_run}/replay", headers=login("lea@demo.fr"))
    assert r.status_code == 404


# -- Traçabilité ---------------------------------------------------------------------------------
def test_recommendation_is_replayable(client, login):
    h = login("lea@demo.fr")
    run = client.get(f"{API}/students/me/recommendations/latest", headers=h).json()
    assert run["referential_version"] and run["model_version"] and run["explanation_meta"]["status"] == "ok"
    replay = client.get(f"{API}/students/me/recommendations/{run['run_id']}/replay", headers=h).json()
    assert replay["identical"] is True


def test_gender_flip_does_not_change_output(client, login):
    """Inverser uniquement le genre stocké ne modifie ni les pistes ni les scores."""
    from app.db import SessionLocal, StudentProfile
    h = login("adam@demo.ma")
    sid = student_id(client, h)
    before = client.post(f"{API}/students/me/recommendations", headers=h).json()
    with SessionLocal() as db:
        p = db.get(StudentProfile, sid)
        p.gender = "F" if p.gender == "M" else "M"
        db.commit()
    after = client.post(f"{API}/students/me/recommendations", headers=h).json()
    assert before["items"] == after["items"]


# -- Parcours complet d'un nouvel élève de 3e (écran 9.1) ---------------------------------------------
def test_onboarding_end_to_end(client, login):
    h = login("sami@demo.ma")
    assert client.get(f"{API}/students/me/assessment/form", headers=h).status_code == 409  # onboarding d'abord
    r = client.put(f"{API}/students/me/profile", headers=h, json={"system": "MA", "level": "MA_3AC", "language": "fr", "city": "Casablanca",
                                                                  "mobility": "local", "certainty": 3})
    assert r.status_code == 200, r.text
    form = client.get(f"{API}/students/me/assessment/form", headers=h).json()
    assert form["audience"] == "college" and len(form["aptitude"]["items"]) == 3 and len(form["ai_critical"]["items"]) == 1

    responses = {"riasec": {it["id"]: (5 if it["dimension"] in "IS" else 2) for it in form["riasec"]["items"]},
                 "values": [c["id"] for c in form["values"]["cards"]],
                 "aptitude": {it["id"]: 0 for it in form["aptitude"]["items"]},
                 "ai_critical": {it["id"]: 1 for it in form["ai_critical"]["items"]}}
    assert client.put(f"{API}/students/me/assessment/draft", headers=h, json=responses).status_code == 200  # reprise possible
    assert client.get(f"{API}/students/me/assessment/draft", headers=h).json()["responses"] == responses
    assert client.post(f"{API}/students/me/assessment/submit", headers=h, json=responses).status_code == 403  # consentement requis
    client.post(f"{API}/students/me/consents", headers=h, json={"kind": "student_terms"})
    traits = client.post(f"{API}/students/me/assessment/submit", headers=h, json=responses).json()["traits"]
    assert set(traits["holland_code"][:2]) == {"I", "S"}

    client.put(f"{API}/students/me/grades", headers=h, json=[{"subject": "maths", "period": "T1", "value": 14},
                                                             {"subject": "svt", "period": "T1", "value": 16}])
    blocked = client.post(f"{API}/students/me/recommendations", headers=h)
    assert blocked.status_code == 403 and "représentant légal" in blocked.json()["detail"]

    code = client.post(f"{API}/students/me/parent-invite", headers=h, json={"contact": "+212600000000"}).json()["invite_code"]
    pr = client.post(f"{API}/auth/register-parent", json={"email": "parent.sami@demo.ma", "password": "motdepasse1", "display_name": "Parent de Sami",
                                                          "invite_code": code})
    assert pr.status_code == 200
    reco = client.post(f"{API}/students/me/recommendations", headers=h)
    assert reco.status_code == 200, reco.text
    items = reco.json()["items"]
    assert len(items) == 3 and all(len(i["occupations"]) >= 5 for i in items)
    # le parent n'a toujours rien tant que l'élève ne partage pas
    ph = {"Authorization": f"Bearer {pr.json()['token']}"}
    assert client.get(f"{API}/parent/children/{student_id(client, h)}/summary", headers=ph).status_code == 403


# -- Performance du simulateur (p95 < 1,5 s) --------------------------------------------------------
def test_simulator_latency_and_category_change(client, login):
    h = login("adam@demo.ma")
    client.post(f"{API}/students/me/recommendations", headers=h)
    times = []
    for g in [12, 13, 14, 15, 16] * 4:
        t = time.perf_counter()
        r = client.post(f"{API}/students/me/simulate", headers=h, json={"grades": {"maths": g}})
        times.append(time.perf_counter() - t)
        assert r.status_code == 200
    assert statistics.quantiles(times, n=20)[18] < 1.5
    r = client.post(f"{API}/students/me/simulate", headers=h, json={"grades": {"maths": 16}}).json()
    assert any(c["from"] == "A" and c["to"] == "B" for c in r["changes"])


def test_wishlist_balance_alert(client, login):
    h = login("adam@demo.ma")
    r = client.put(f"{API}/students/me/wishlist", headers=h, json={"A": ["PRG-MA-ENSAM-011"], "B": ["PRG-MA-EST-ENR-014"], "C": []}).json()
    assert any("sécurisée" in w for w in r["warnings"])
    alerts = client.get(f"{API}/counselor/alerts", headers=login("conseiller.meknes@demo.ma")).json()
    assert any(a["type"] == "ecart_ambition" and a["display_name"] == "Adam" for a in alerts)
    assert client.put(f"{API}/students/me/wishlist", headers=h, json={"A": ["PRG-INCONNU"]}).status_code == 422


# -- Back-office du référentiel --------------------------------------------------------------------
def test_referential_workflow(client, login):
    editor, committee = login("editeur@demo.ma"), login("comite@demo.ma")
    assert client.post(f"{API}/referential/drafts", headers=editor, json={"version": "2027.2-demo"}).status_code == 200
    v = client.get(f"{API}/referential/versions/2027.2-demo", headers=editor).json()
    occ = next(o for o in v["content"]["occupations"] if o["id"] == "OCC-ENR-TECH-03")
    occ["outlook"]["D"] = 150  # valeur invalide
    r = client.put(f"{API}/referential/versions/2027.2-demo/occupations/OCC-ENR-TECH-03", headers=editor, json=occ).json()
    assert r["validation_errors"]
    assert client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=editor, json={"to": "review"}).status_code == 200
    assert client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=committee, json={"to": "validated"}).status_code == 422
    client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=committee, json={"to": "draft_rejected", "comment": "D hors bornes"})
    occ["outlook"]["D"] = 85
    client.put(f"{API}/referential/versions/2027.2-demo/occupations/OCC-ENR-TECH-03", headers=editor, json=occ)
    client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=editor, json={"to": "review"})
    assert client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=editor, json={"to": "validated"}).status_code == 403
    assert client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=committee, json={"to": "validated"}).status_code == 200
    assert client.post(f"{API}/referential/versions/2027.2-demo/transition", headers=committee, json={"to": "published"}).status_code == 200
    # publication effective sans redéploiement
    assert client.get(f"{API}/health").json()["referential_version"] == "2027.2-demo"
    h = login("adam@demo.ma")
    run = client.post(f"{API}/students/me/recommendations", headers=h).json()
    assert run["referential_version"] == "2027.2-demo"
    # un ancien bilan reste rejouable avec sa propre version
    runs = client.get(f"{API}/students/me/recommendations", headers=h).json()
    old = next(r for r in runs if r["referential_version"] == "2027.1-demo")
    assert client.get(f"{API}/students/me/recommendations/{old['run_id']}/replay", headers=h).json()["identical"] is True


# -- Conformité --------------------------------------------------------------------------------
def test_admin_stats_k_anonymity(client, login):
    stats = client.get(f"{API}/admin/stats", headers=login("admin.casa@demo.ma")).json()
    assert stats["k"] == 10
    for g in stats["groups"]:
        assert g.get("suppressed") or g["n"] >= 10


def test_sensitive_fields_encrypted_at_rest(client, login):
    from app.db import CounselorNote, SessionLocal, TraitEstimate
    h = login("conseiller.casa@demo.ma")
    sid = student_id(client, login("yasmine@demo.ma"))
    client.post(f"{API}/counselor/students/{sid}/notes", headers=h, json={"text": "Hésite entre SVT et PC", "visibility": "counselor"})
    with SessionLocal() as db:
        note = db.scalars(select(CounselorNote)).first()
        trait = db.scalars(select(TraitEstimate)).first()
        assert "Hésite" not in note.text_enc and "riasec" not in trait.traits_enc
    # note « conseiller » invisible pour l'élève
    assert client.get(f"{API}/students/me/notes", headers=login("yasmine@demo.ma")).json() == []


def test_audit_log_is_append_only(client):
    from app.db import AuditLog, SessionLocal
    with SessionLocal() as db:
        row = db.scalars(select(AuditLog)).first()
        row.action = "falsifié"
        with pytest.raises(RuntimeError):
            db.commit()


def test_explorer_and_calendar(client, login):
    h = login("lea@demo.fr")
    occ = client.get(f"{API}/explorer/occupations/OCC-NUM-UX", headers=h).json()
    assert occ["outlook"]["transformation"] and occ["sources"] and occ["notice"]
    prog = client.get(f"{API}/explorer/programs/PRG-MA-EST-ENR-014", headers=h).json()
    assert prog["graph"]["edges"] and prog["sources"]
    cal = client.get(f"{API}/explorer/calendar", headers=h, params={"system": "FR", "level": "FR_TLE"}).json()
    assert cal[0]["date"] == "2027-01-18"


def test_login_is_throttled(client):
    for _ in range(10):
        assert client.post(f"{API}/auth/login", json={"email": "cible@demo.ma", "password": "x"}).status_code == 401
    assert client.post(f"{API}/auth/login", json={"email": "cible@demo.ma", "password": "x"}).status_code == 429


def test_official_grades_take_precedence(client, login):
    h = login("adam@demo.ma")
    r = client.put(f"{API}/students/me/grades", headers=h, json=[{"subject": "maths", "period": "T1", "value": 20},
                                                                 {"subject": "nsi", "period": "T1", "value": 15}]).json()
    assert r == {"ok": True, "count": 1, "ignored_official": 1}
    maths_t1 = [g for g in client.get(f"{API}/students/me/grades", headers=h).json() if g["subject"] == "maths" and g["period"] == "T1"]
    assert len(maths_t1) == 1 and maths_t1[0]["verified"] is True
