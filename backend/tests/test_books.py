"""Library: admin uploads (PDF/EPUB), metadata extraction, access rules and reading progress."""

import io
import zipfile

import pytest
from pypdf import PdfWriter

from app.config import get_settings
from app.database import SessionLocal
from app.models import User

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _pdf(title="Designing Data Systems", author="Ada Writer", pages=3) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    w.add_metadata({"/Title": title, "/Author": author})
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def _epub() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        z.writestr("META-INF/container.xml", """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>""")
        z.writestr("OEBPS/content.opf", """<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Clean Interfaces</dc:title><dc:creator>Grace Coder</dc:creator>
    <dc:description>&lt;p&gt;A short book about &lt;b&gt;APIs&lt;/b&gt;.&lt;/p&gt;</dc:description>
  </metadata>
  <manifest>
    <item id="cov" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="ch1"/></spine>
</package>""")
        z.writestr("OEBPS/images/cover.png", PNG)
        z.writestr("OEBPS/ch1.xhtml", "<html><body><p>Hello</p></body></html>")
    return buf.getvalue()


@pytest.fixture
def admin(client, auth, tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "books_dir", str(tmp_path))
    with SessionLocal() as db:
        db.query(User).filter(User.email == "test@example.com").one().is_admin = True
        db.commit()
    yield auth
    with SessionLocal() as db:
        db.query(User).filter(User.email == "test@example.com").one().is_admin = False
        db.commit()


def _reader(client):
    r = client.post("/api/auth/register", json={"name": "Book Reader", "email": "reader@example.com",
                                                "password": "password123"})
    if r.status_code != 200:
        r = client.post("/api/auth/login", json={"email": "reader@example.com", "password": "password123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_upload_pdf_reads_metadata_and_streams_file(client, admin, tmp_path):
    r = client.post("/api/admin/books", headers=admin, files={"file": ("ddia.pdf", _pdf(), "application/pdf")},
                    data={"category": "System Design", "tags": "databases, Databases, scale"})
    assert r.status_code == 200, r.text
    book = r.json()
    assert book["format"] == "pdf" and book["pages"] == 3
    assert book["title"] == "Designing Data Systems" and book["author"] == "Ada Writer"
    assert book["tags"] == ["databases", "scale"] and book["cover_url"] is None
    assert len(list(tmp_path.iterdir())) == 1

    reader = _reader(client)
    listing = client.get("/api/books", headers=reader).json()
    assert any(b["id"] == book["id"] for b in listing["books"])
    assert {"name": "System Design", "count": 1} in listing["categories"]
    f = client.get(f"/api/books/{book['id']}/file", headers=reader)
    assert f.status_code == 200 and f.content.startswith(b"%PDF") and f.headers["content-type"] == "application/pdf"
    assert client.get(f"/api/books/{book['id']}/file").status_code == 401

    p = client.put(f"/api/books/{book['id']}/progress", headers=reader, json={"location": "2", "percent": 66.7})
    assert p.status_code == 200
    again = client.get("/api/books", headers=reader).json()
    assert again["continue"][0]["id"] == book["id"] and again["continue"][0]["progress"]["location"] == "2"
    assert client.get("/api/admin/books", headers=admin).json()["books"][0]["readers"] == 1

    assert client.delete(f"/api/admin/books/{book['id']}", headers=admin).json()["ok"]
    assert not list(tmp_path.iterdir())
    assert client.get(f"/api/books/{book['id']}", headers=reader).status_code == 404


def test_upload_epub_extracts_cover_and_clean_description(client, admin):
    r = client.post("/api/admin/books", headers=admin,
                    files={"file": ("clean.epub", _epub(), "application/epub+zip")}, data={"title": ""})
    assert r.status_code == 200, r.text
    book = r.json()
    assert book["format"] == "epub" and book["title"] == "Clean Interfaces" and book["author"] == "Grace Coder"
    assert book["description"] == "A short book about APIs."
    cover = client.get(book["cover_url"])
    assert cover.status_code == 200 and cover.content == PNG

    upd = client.put(f"/api/admin/books/{book['id']}", headers=admin,
                     json={"title": "Clean Interfaces, 2nd ed.", "published": False}).json()
    assert upd["title"] == "Clean Interfaces, 2nd ed." and upd["published"] is False
    reader = _reader(client)
    assert client.get(f"/api/books/{book['id']}", headers=reader).status_code == 404
    assert all(b["id"] != book["id"] for b in client.get("/api/books", headers=reader).json()["books"])

    new_cover = client.post(f"/api/admin/books/{book['id']}/cover", headers=admin,
                            files={"cover": ("c.png", PNG, "image/png")})
    assert new_cover.status_code == 200 and new_cover.json()["cover_url"]


def test_upload_rejects_bad_files(client, admin, tmp_path):
    r = client.post("/api/admin/books", headers=admin, files={"file": ("notes.txt", b"just text", "text/plain")})
    assert r.status_code == 400 and "PDF and EPUB" in r.json()["detail"]
    r = client.post("/api/admin/books", headers=admin,
                    files={"file": ("x.pdf", _pdf(), "application/pdf"), "cover": ("c.txt", b"nope", "text/plain")})
    assert r.status_code == 400 and "cover" in r.json()["detail"]
    assert not list(tmp_path.iterdir())  # nothing left behind on failure
    reader = _reader(client)
    assert client.post("/api/admin/books", headers=reader,
                       files={"file": ("x.pdf", _pdf(), "application/pdf")}).status_code == 403
