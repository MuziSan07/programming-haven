import os
import tempfile

# Isolated database and deterministic offline AI for every test run.
# Must be set before the app is imported.
_db_dir = tempfile.mkdtemp(prefix="haven-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_dir}/test.db"
os.environ["GROQ_API_KEY"] = ""
os.environ["OLLAMA_URL"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def auth(client):
    r = client.post("/api/auth/register",
                    json={"name": "Test User", "email": "test@example.com", "password": "password123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
