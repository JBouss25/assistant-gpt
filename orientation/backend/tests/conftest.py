import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="orientation-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["APP_ENV"] = "test"
os.environ["PBKDF2_ITERATIONS"] = "1000"
os.environ["PARENTAL_CONSENT_REQUIRED"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app import seed_demo
    from app.main import app

    seed_demo.main()
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def login(client):
    cache = {}

    def _login(email: str) -> dict:
        if email not in cache:
            r = client.post("/api/v1/auth/login", json={"email": email, "password": "demo1234"})
            assert r.status_code == 200, r.text
            cache[email] = {"Authorization": f"Bearer {r.json()['token']}"}
        return cache[email]
    return _login
