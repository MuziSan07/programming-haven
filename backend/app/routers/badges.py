"""Achievement badges and verifiable certificates (public verification needs no login)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Certificate, User, UserBadge
from ..services.gamification import BADGES, badge_out, cert_out, evaluate, metrics

router = APIRouter(tags=["badges"])


@router.get("/api/badges")
def badges(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    new = evaluate(db, user)
    owned = {b.badge_id: b.awarded_at for b in db.scalars(select(UserBadge).where(UserBadge.user_id == user.id))}
    progress = metrics(db, user)
    items = [{**badge_out(b, owned.get(b[0])), "progress": min(progress.get(b[5], 0), b[6])} for b in BADGES]
    return {"badges": items, "earned": len(owned), "total": len(BADGES), "new": new}


@router.get("/api/certificates")
def certificates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    certs = db.scalars(select(Certificate).where(Certificate.user_id == user.id)
                       .order_by(Certificate.issued_at.desc())).all()
    return {"certificates": [cert_out(c) for c in certs]}


@router.get("/api/public/certificates/{cert_id}")
def verify(cert_id: str, db: Session = Depends(get_db)):
    cert = db.get(Certificate, cert_id)
    if not cert:
        raise HTTPException(404, "No certificate with this ID exists")
    return {**cert_out(cert), "valid": True, "issuer": "Programming Haven"}
