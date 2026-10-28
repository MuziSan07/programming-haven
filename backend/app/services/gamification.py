"""Badges (earned automatically from real progress) and verifiable certificates."""

import secrets
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..content import store
from ..models import (Certificate, Comment, ContestEntry, FlashcardReview, HackathonSubmission, InterviewSession,
                      LeagueMembership, LessonProgress, Post, QuestionAttempt, RoundAttempt, Submission, TestAttempt,
                      User, UserBadge, VettingRun)

# id, title, description, icon (lucide name), tier, metric, threshold
BADGES = [
    ("first-lesson", "First Steps", "Complete your first lesson", "BookOpen", "bronze", "lessons", 1),
    ("lessons-25", "Bookworm", "Complete 25 lessons", "BookOpen", "silver", "lessons", 25),
    ("lessons-100", "Polyglot", "Complete 100 lessons", "Languages", "gold", "lessons", 100),
    ("first-solve", "Hello, World", "Solve your first DSA problem", "Code", "bronze", "solved", 1),
    ("solved-25", "Problem Solver", "Solve 25 DSA problems", "Code", "silver", "solved", 25),
    ("solved-100", "Algorithm Ace", "Solve 100 DSA problems", "Code", "gold", "solved", 100),
    ("medium-25", "Medium Rare", "Solve 25 Medium problems", "Flame", "silver", "solved_medium", 25),
    ("hard-10", "Hard Mode", "Solve 10 Hard or Expert problems", "Mountain", "gold", "solved_hard", 10),
    ("streak-7", "On a Roll", "Keep a 7-day streak", "Flame", "bronze", "streak", 7),
    ("streak-30", "Unstoppable", "Keep a 30-day streak", "Flame", "gold", "streak", 30),
    ("interview-pass", "Interview Ready", "Score 70+ in an AI interview", "Mic", "silver", "interviews_passed", 1),
    ("interview-5", "Smooth Talker", "Pass 5 AI interviews", "Mic", "gold", "interviews_passed", 5),
    ("test-pass", "Certified", "Pass a proctored mock test", "ClipboardCheck", "silver", "tests_passed", 1),
    ("clean-run", "Clean Hands", "Pass a test with a perfect integrity score", "ShieldCheck", "gold", "tests_clean", 1),
    ("questions-100", "Quiz Master", "Answer 100 interview questions correctly", "MessageSquare", "silver",
     "questions_correct", 100),
    ("flashcards-100", "Memory Palace", "Review 100 flashcards", "Layers", "silver", "flashcard_reviews", 100),
    ("helper", "Helping Hand", "Have 3 comments marked as the solution", "HandHelping", "silver", "solutions_given", 3),
    ("debugger", "Bug Hunter", "Fix 3 debugging rounds", "Bug", "silver", "debug_passed", 3),
    ("reviewer", "Eagle Eye", "Score 70+ on 3 code review rounds", "ScanSearch", "silver", "review_passed", 3),
    ("contestant", "Contender", "Finish a weekly contest", "Trophy", "bronze", "contests", 1),
    ("podium", "Podium Finish", "Finish top 3 in a weekly contest", "Medal", "gold", "contest_podium", 1),
    ("hacker", "Builder", "Submit a hackathon project", "Rocket", "silver", "hackathon_submissions", 1),
    ("promoted", "Moving Up", "Get promoted in the weekly league", "TrendingUp", "bronze", "promotions", 1),
    ("final-boss", "Final Boss", "Pass a full mock vetting pipeline", "Crown", "gold", "vetting_passed", 1),
]
BADGE_BY_ID = {b[0]: b for b in BADGES}


def badge_out(b, awarded_at=None) -> dict:
    bid, title, desc, icon, tier, metric, threshold = b
    return {"id": bid, "title": title, "description": desc, "icon": icon, "tier": tier, "metric": metric,
            "threshold": threshold, "earned": awarded_at is not None,
            "awarded_at": awarded_at.isoformat() if awarded_at else None}


def _count(db: Session, stmt) -> int:
    return int(db.scalar(stmt) or 0)


def metrics(db: Session, user: User) -> dict[str, int]:
    uid = user.id
    solved_rows = db.execute(select(Submission.problem_slug).where(Submission.user_id == uid,
                                                                   Submission.status == "Accepted").distinct()).all()
    solved = {r[0] for r in solved_rows}
    problems = store.by_slug(db, "problem")
    diff = {slug: (problems.get(slug) or {}).get("difficulty") for slug in solved}
    interviews = db.scalars(select(InterviewSession).where(InterviewSession.user_id == uid,
                                                           InterviewSession.feedback.is_not(None))).all()
    tests = db.scalars(select(TestAttempt).where(TestAttempt.user_id == uid, TestAttempt.finished_at.is_not(None))).all()
    my_comment_ids = select(Comment.id).where(Comment.user_id == uid)
    return {
        "lessons": _count(db, select(func.count()).select_from(LessonProgress).where(LessonProgress.user_id == uid)),
        "solved": len(solved),
        "solved_medium": sum(1 for d in diff.values() if d == "Medium"),
        "solved_hard": sum(1 for d in diff.values() if d in ("Hard", "Expert")),
        "streak": user.streak,
        "interviews_passed": sum(1 for i in interviews if (i.feedback or {}).get("overall_score", 0) >= 70
                                 and not (i.feedback or {}).get("terminated")),
        "tests_passed": sum(1 for t in tests if (t.result or {}).get("passed")),
        "tests_clean": sum(1 for t in tests if (t.result or {}).get("passed") and (t.integrity_score or 0) >= 100),
        "questions_correct": _count(db, select(func.count(func.distinct(QuestionAttempt.question_id)))
                                    .where(QuestionAttempt.user_id == uid, QuestionAttempt.correct.is_(True))),
        "flashcard_reviews": _count(db, select(func.count()).select_from(FlashcardReview)
                                    .where(FlashcardReview.user_id == uid)),
        "solutions_given": _count(db, select(func.count()).select_from(Post)
                                  .where(Post.solution_comment_id.in_(my_comment_ids))),
        "debug_passed": _count(db, select(func.count(func.distinct(RoundAttempt.round_id)))
                               .where(RoundAttempt.user_id == uid, RoundAttempt.kind == "debug",
                                      RoundAttempt.passed.is_(True))),
        "review_passed": _count(db, select(func.count(func.distinct(RoundAttempt.round_id)))
                                .where(RoundAttempt.user_id == uid, RoundAttempt.kind == "review",
                                       RoundAttempt.passed.is_(True))),
        "contests": _count(db, select(func.count()).select_from(ContestEntry).where(ContestEntry.user_id == uid)),
        "contest_podium": contest_podiums(db, uid),
        "hackathon_submissions": _count(db, select(func.count()).select_from(HackathonSubmission)
                                        .where(HackathonSubmission.user_id == uid)),
        "promotions": _count(db, select(func.count()).select_from(LeagueMembership)
                             .where(LeagueMembership.user_id == uid, LeagueMembership.outcome == "promoted")),
        "vetting_passed": _count(db, select(func.count()).select_from(VettingRun)
                                 .where(VettingRun.user_id == uid, VettingRun.status == "passed")),
    }


def contest_podiums(db: Session, user_id: int) -> int:
    """Number of finished contests where the user placed top 3."""
    from ..models import Contest
    from .contests import finished, standings

    total = 0
    for entry in db.scalars(select(ContestEntry).where(ContestEntry.user_id == user_id)):
        contest = db.get(Contest, entry.contest_id)
        if contest and finished(contest):
            total += user_id in [row["user"]["id"] for row in standings(db, contest)[:3]]
    return total


def evaluate(db: Session, user: User) -> list[dict]:
    """Award any newly earned badges. Returns the new ones."""
    owned = set(db.scalars(select(UserBadge.badge_id).where(UserBadge.user_id == user.id)))
    m = metrics(db, user)
    new = []
    for b in BADGES:
        if b[0] not in owned and m.get(b[5], 0) >= b[6]:
            row = UserBadge(user_id=user.id, badge_id=b[0])
            db.add(row)
            new.append(badge_out(b, awarded_at=row.awarded_at or date.today()))
    if new:
        db.commit()
    return new


# ---------------------------------------------------------------- certificates

def issue_certificate(db: Session, user: User, kind: str, ref: str, title: str, score: float | None = None,
                      integrity: float | None = None, meta: dict | None = None) -> Certificate:
    """One certificate per (user, kind, ref); a better score updates the existing one."""
    cert = db.scalar(select(Certificate).where(Certificate.user_id == user.id, Certificate.kind == kind,
                                               Certificate.ref == ref))
    if cert is None:
        cert = Certificate(id=secrets.token_urlsafe(12), user_id=user.id, kind=kind, ref=ref, title=title,
                           score=score, integrity=integrity, meta=meta or {})
        db.add(cert)
    elif score is not None and (cert.score or 0) < score:
        cert.score, cert.integrity, cert.meta = score, integrity, meta or cert.meta
    return cert


def cert_out(cert: Certificate, include_owner: bool = True) -> dict:
    issued = cert.issued_at
    return {"id": cert.id, "kind": cert.kind, "ref": cert.ref, "title": cert.title, "score": cert.score,
            "integrity": cert.integrity, "meta": cert.meta, "issued_at": issued.isoformat(),
            "issue_year": issued.year, "issue_month": issued.month,
            **({"holder": cert.user.name} if include_owner else {})}


def review_streak(db: Session, user_id: int) -> int:
    """Consecutive days (ending today or yesterday) with at least one flashcard review."""
    days = {d.date() if hasattr(d, "date") else d for d in db.scalars(
        select(FlashcardReview.created_at).where(FlashcardReview.user_id == user_id)
        .order_by(FlashcardReview.id.desc()).limit(2000))}
    day = date.today()
    if day not in days:
        day -= timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= timedelta(days=1)
    return streak
