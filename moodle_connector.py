"""
Connexion à Moodle via l'API REST Web Services.

Prérequis côté Moodle :
  - Activer les Web Services (Administration > Plugins > Web services)
  - Créer un token pour l'utilisateur (ou utiliser login/password pour en obtenir un)
  - Autoriser les fonctions nécessaires dans le service externe

Variables d'environnement :
  MOODLE_URL      URL de base de l'instance, ex. https://moodle.monecole.fr
  MOODLE_TOKEN    Token d'accès (prioritaire sur login/password)
  MOODLE_USER     Nom d'utilisateur (si pas de token)
  MOODLE_PASSWORD Mot de passe (si pas de token)
"""

import os
import requests


class MoodleClient:
    def __init__(self, url: str, token: str):
        self.base_url = url.rstrip("/")
        self.token = token
        self.rest_url = f"{self.base_url}/webservice/rest/server.php"

    # ------------------------------------------------------------------
    # Méthode générique
    # ------------------------------------------------------------------

    def call(self, function: str, **params) -> dict | list:
        """Appelle une fonction Web Service Moodle et retourne le JSON."""
        payload = {
            "wstoken": self.token,
            "wsfunction": function,
            "moodlewsrestformat": "json",
            **params,
        }
        response = requests.post(self.rest_url, data=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and "exception" in data:
            raise MoodleError(data.get("message", "Erreur Moodle inconnue"), data)
        return data

    # ------------------------------------------------------------------
    # Utilisateurs
    # ------------------------------------------------------------------

    def get_site_info(self) -> dict:
        """Informations générales sur le site et l'utilisateur connecté."""
        return self.call("core_webservice_get_site_info")

    def get_user_by_username(self, username: str) -> dict | None:
        """Retourne le profil d'un utilisateur par son login, ou None."""
        result = self.call(
            "core_user_get_users",
            **{"criteria[0][key]": "username", "criteria[0][value]": username},
        )
        users = result.get("users", [])
        return users[0] if users else None

    # ------------------------------------------------------------------
    # Cours
    # ------------------------------------------------------------------

    def get_enrolled_courses(self, user_id: int) -> list[dict]:
        """Liste des cours auxquels un utilisateur est inscrit."""
        return self.call("core_enrol_get_users_courses", userid=user_id)

    def get_all_courses(self) -> list[dict]:
        """Liste de tous les cours du site (nécessite des droits admin)."""
        return self.call("core_course_get_courses")

    def get_course_contents(self, course_id: int) -> list[dict]:
        """Sections et ressources d'un cours."""
        return self.call("core_course_get_contents", courseid=course_id)

    # ------------------------------------------------------------------
    # Devoirs / Soumissions
    # ------------------------------------------------------------------

    def get_assignments(self, course_ids: list[int]) -> list[dict]:
        """Devoirs d'une liste de cours."""
        params = {f"courseids[{i}]": cid for i, cid in enumerate(course_ids)}
        result = self.call("mod_assign_get_assignments", **params)
        return result.get("courses", [])

    def get_submissions(self, assignment_id: int) -> list[dict]:
        """Soumissions pour un devoir donné."""
        result = self.call(
            "mod_assign_get_submissions",
            **{"assignmentids[0]": assignment_id},
        )
        assignments = result.get("assignments", [])
        return assignments[0].get("submissions", []) if assignments else []


class MoodleError(Exception):
    def __init__(self, message: str, raw: dict):
        super().__init__(message)
        self.raw = raw


# ------------------------------------------------------------------
# Authentification : obtenir un token depuis login/password
# ------------------------------------------------------------------

def get_token(base_url: str, username: str, password: str, service: str = "moodle_mobile_app") -> str:
    """
    Obtient un token Moodle par login/password.
    `service` est le nom court du service externe (par défaut moodle_mobile_app).
    """
    url = base_url.rstrip("/") + "/login/token.php"
    resp = requests.post(
        url,
        data={"username": username, "password": password, "service": service},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        raise MoodleError(data["error"], data)
    return data["token"]


# ------------------------------------------------------------------
# Fabrique : construit un MoodleClient depuis les variables d'env
# ------------------------------------------------------------------

def client_from_env() -> MoodleClient:
    """
    Crée un MoodleClient en lisant les variables d'environnement.
    Priorité : MOODLE_TOKEN > MOODLE_USER + MOODLE_PASSWORD
    """
    url = os.environ.get("MOODLE_URL")
    if not url:
        raise EnvironmentError("La variable MOODLE_URL est requise.")

    token = os.environ.get("MOODLE_TOKEN")
    if not token:
        user = os.environ.get("MOODLE_USER")
        password = os.environ.get("MOODLE_PASSWORD")
        if not user or not password:
            raise EnvironmentError(
                "Définissez MOODLE_TOKEN ou (MOODLE_USER + MOODLE_PASSWORD)."
            )
        token = get_token(url, user, password)

    return MoodleClient(url, token)


# ------------------------------------------------------------------
# Utilisation en ligne de commande
# ------------------------------------------------------------------

if __name__ == "__main__":
    import json

    moodle = client_from_env()
    info = moodle.get_site_info()
    print("Connecté en tant que :", info.get("fullname"))
    print("Site :", info.get("sitename"))

    user_id = info.get("userid")
    courses = moodle.get_enrolled_courses(user_id)
    print(f"\n{len(courses)} cours trouvé(s) :")
    for c in courses:
        print(f"  [{c['id']}] {c['fullname']}")
