from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import User


def _user(client, name):
    email = f"{name.lower()}@example.com"
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": "password123"})
    if r.status_code == 409:
        r = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _make_admin(email):
    with SessionLocal() as db:
        db.query(User).filter(User.email == email).update({"is_admin": True})
        db.commit()


TECH_POST = {"kind": "question", "title": "Why does my Python recursion hit the limit?",
             "body": "My recursive function on a tree with 5000 nodes raises RecursionError. Should I convert "
                     "it to an iterative stack-based approach?", "tags": ["Python", "recursion", "python"]}


def test_moderation_publishes_tech_and_blocks_spam(client):
    alice = _user(client, "Alice")
    ok = client.post("/api/community/posts", json=TECH_POST, headers=alice).json()
    assert ok["status"] == "published" and ok["tags"] == ["python", "recursion"]
    spam = client.post("/api/community/posts", headers=alice, json={
        "kind": "discussion", "title": "Make money fast now", "body": "Click here to earn $500 daily, dm me for details"}).json()
    assert spam["status"] == "rejected" and spam["moderation"]["reason"]
    off = client.post("/api/community/posts", headers=alice, json={
        "kind": "discussion", "title": "My weekend trip", "body": "We went to the beach and ate ice cream all day."}).json()
    assert off["status"] == "pending"
    feed = client.get("/api/community/posts?sort=new", headers=alice).json()
    assert [p["id"] for p in feed["posts"]] == [ok["id"]]
    mine = client.get("/api/community/posts?mine=true", headers=alice).json()
    assert len(mine["posts"]) == 3


def test_threads_likes_solution_and_soft_delete(client):
    alice, bob, cara = _user(client, "Alice"), _user(client, "Bob"), _user(client, "Cara")
    post = client.post("/api/community/posts", json=TECH_POST, headers=alice).json()
    c1 = client.post(f"/api/community/posts/{post['id']}/comments", headers=bob,
                     json={"body": "Yes, use an explicit stack to avoid the recursion limit in Python."}).json()
    c2 = client.post(f"/api/community/posts/{post['id']}/comments", headers=cara,
                     json={"body": "I disagree, sys.setrecursionlimit is fine for 5000 nodes.", "parent_id": c1["id"]}).json()
    c3 = client.post(f"/api/community/posts/{post['id']}/comments", headers=bob,
                     json={"body": "It can crash the interpreter with a stack overflow though.", "parent_id": c2["id"]}).json()
    assert c3["status"] == "published"
    detail = client.get(f"/api/community/posts/{post['id']}", headers=alice).json()
    assert detail["comment_count"] == 3
    assert detail["comments"][0]["children"][0]["children"][0]["id"] == c3["id"]

    like = client.post("/api/community/like", json={"target_type": "comment", "target_id": c1["id"]}, headers=alice).json()
    assert like == {"liked": True, "like_count": 1}
    assert client.post("/api/community/like", json={"target_type": "comment", "target_id": c1["id"]},
                       headers=alice).json()["liked"] is False
    sol = client.post(f"/api/community/posts/{post['id']}/solution/{c1['id']}", headers=alice).json()
    assert sol["solution_comment_id"] == c1["id"]
    assert client.post(f"/api/community/posts/{post['id']}/solution/{c1['id']}", headers=bob).status_code == 404

    client.delete(f"/api/community/comments/{c2['id']}", headers=cara)
    detail = client.get(f"/api/community/posts/{post['id']}", headers=alice).json()
    middle = detail["comments"][0]["children"][0]
    assert middle["deleted"] and middle["children"][0]["id"] == c3["id"] and detail["comment_count"] == 2


def test_reports_hold_content_and_admin_decides(client):
    author = _user(client, "Dan")
    post = client.post("/api/community/posts", json=TECH_POST, headers=author).json()
    for name in ("R1", "R2", "R3"):
        client.post("/api/community/report", headers=_user(client, name),
                    json={"target_type": "post", "target_id": post["id"], "reason": "duplicate"})
    assert client.get(f"/api/community/posts/{post['id']}", headers=_user(client, "R1")).status_code == 404

    admin = _user(client, "Mod")
    assert client.get("/api/admin/moderation", headers=admin).status_code == 403
    _make_admin("mod@example.com")
    queue = client.get("/api/admin/moderation?status=pending", headers=admin).json()
    assert any(i["type"] == "post" and i["id"] == post["id"] and len(i["reports"]) == 3 for i in queue["items"])
    r = client.post(f"/api/admin/moderation/post/{post['id']}", headers=admin, json={"action": "approve"}).json()
    assert r["status"] == "published"
    assert client.get("/api/admin/moderation?status=reported", headers=admin).json()["stats"]["reported"] == 0


def test_hackathon_lifecycle(client):
    admin = _user(client, "Host")
    _make_admin("host@example.com")
    now = datetime.now(timezone.utc)
    body = {"slug": "haven-launch", "title": "Haven Launch Hackathon", "tagline": "Build an AI dev tool",
            "description": "Build something useful for developers.", "tracks": ["AI", "Web"],
            "criteria": [{"criterion": "Impact", "weight": 60}, {"criterion": "Execution", "weight": 40}],
            "prizes": [{"place": "1st", "reward": "$500"}], "starts_at": (now - timedelta(hours=1)).isoformat(),
            "ends_at": (now + timedelta(days=7)).isoformat(), "published": True}
    bad = client.post("/api/admin/hackathons", headers=admin, json={**body, "criteria": [{"criterion": "X", "weight": 50}]})
    assert bad.status_code == 400
    h = client.post("/api/admin/hackathons", headers=admin, json=body).json()
    assert h["phase"] == "live" and h["has_prize"]

    hacker = _user(client, "Hacker")
    assert client.post("/api/hackathons/haven-launch/submit", headers=hacker, json={
        "title": "Bug Buddy", "summary": "An AI assistant that explains Python stack traces and suggests fixes.",
        "repo_url": "https://github.com/example/bug-buddy"}).status_code == 403
    enrolled = client.post("/api/hackathons/haven-launch/enroll", headers=hacker, json={"track": "AI"}).json()
    assert enrolled["enrollment"]["track"] == "AI" and enrolled["enrolled_count"] == 1
    sub = client.post("/api/hackathons/haven-launch/submit", headers=hacker, json={
        "title": "Bug Buddy", "summary": "An AI assistant that explains Python stack traces and suggests fixes.",
        "repo_url": "https://github.com/example/bug-buddy", "track": "AI"}).json()
    assert sub["first"] and sub["submission"]["title"] == "Bug Buddy"

    parts = client.get(f"/api/admin/hackathons/{h['id']}/participants", headers=admin).json()
    assert len(parts["enrollments"]) == 1 and len(parts["submissions"]) == 1
    client.post(f"/api/admin/hackathons/{h['id']}/judge", headers=admin)  # offline: no score
    sid = parts["submissions"][0]["id"]
    client.patch(f"/api/admin/hackathons/submissions/{sid}", headers=admin, json={"score": 88})
    client.post(f"/api/admin/hackathons/{h['id']}/results", headers=admin)
    detail = client.get("/api/hackathons/haven-launch", headers=hacker).json()
    assert detail["results_published"] and detail["leaderboard"][0]["rank"] == 1


def test_deleted_post_leaves_nothing_behind(client):
    eve = _user(client, "Eve")
    post = client.post("/api/community/posts", json=TECH_POST, headers=eve).json()
    c = client.post(f"/api/community/posts/{post['id']}/comments", headers=eve,
                    json={"body": "Converting to an iterative stack fixed the recursion error."}).json()
    client.post("/api/community/like", json={"target_type": "comment", "target_id": c["id"]}, headers=eve)
    client.delete(f"/api/community/posts/{post['id']}", headers=eve)
    fresh = client.post("/api/community/posts", json={**TECH_POST, "title": "A brand new Python question"}, headers=eve).json()
    detail = client.get(f"/api/community/posts/{fresh['id']}", headers=eve).json()
    assert detail["comments"] == [] and detail["comment_count"] == 0
    from app.database import SessionLocal
    from app.models import Comment, Like
    with SessionLocal() as db:
        assert db.query(Comment).filter(Comment.id == c["id"]).count() == 0
        assert db.query(Like).filter(Like.target_type == "comment", Like.target_id == c["id"]).count() == 0
