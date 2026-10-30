from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    target_role: Mapped[str] = mapped_column(String(60), default="Full Stack Developer")
    gender: Mapped[str] = mapped_column(String(20), default="unspecified")
    persona_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    lessons: Mapped[list["LessonProgress"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (UniqueConstraint("user_id", "lesson_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    lesson_id: Mapped[str] = mapped_column(String(80))
    score: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="lessons")


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    problem_slug: Mapped[str] = mapped_column(String(80), index=True)
    language: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(Text)
    passed: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(30))
    runtime_ms: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TestAttempt(Base):
    __tablename__ = "test_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    test_id: Mapped[str] = mapped_column(String(80))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    integrity_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    violations: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[dict] = mapped_column(JSON, default=dict)


class AppMeta(Base):
    """Small key/value store for app bookkeeping (e.g. the hash of the last content seed)."""
    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(String(200), default="")


class ContentItem(Base):
    __tablename__ = "content_items"
    __table_args__ = (UniqueConstraint("kind", "slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    slug: Mapped[str] = mapped_column(String(120))
    data: Mapped[dict] = mapped_column(JSON)
    source: Mapped[str] = mapped_column(String(10), default="seed")  # seed | admin
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ActivitySession(Base):
    """Active (focused) time spent per area per day. The browser only counts visible-tab time."""
    __tablename__ = "activity_sessions"
    __table_args__ = (UniqueConstraint("user_id", "day", "area", "ref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    area: Mapped[str] = mapped_column(String(20))  # learn | dsa | test | interview | project | questions
    ref: Mapped[str] = mapped_column(String(120), default="")
    seconds: Mapped[int] = mapped_column(Integer, default=0)


class ProjectSubmission(Base):
    __tablename__ = "project_submissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[str] = mapped_column(String(120), index=True)
    repo_url: Mapped[str] = mapped_column(String(500), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    code: Mapped[str] = mapped_column(Text, default="")
    review: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestionAttempt(Base):
    __tablename__ = "question_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(String(120), index=True)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    role: Mapped[str] = mapped_column(String(80))
    level: Mapped[str] = mapped_column(String(30), default="Mid-level")
    persona_id: Mapped[str] = mapped_column(String(40), default="aria")
    mode: Mapped[str] = mapped_column(String(20), default="standard")  # standard | live
    context: Mapped[dict] = mapped_column(JSON, default=dict)  # e.g. the live-coding problem slug
    transcript: Mapped[list] = mapped_column(JSON, default=list)
    feedback: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------- community

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="discussion")  # question | discussion | problem | achievement
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    hackathon_id: Mapped[int | None] = mapped_column(ForeignKey("hackathons.id", ondelete="SET NULL"), nullable=True,
                                                     index=True)
    # published | pending | rejected | removed
    status: Mapped[str] = mapped_column(String(12), default="published", index=True)
    moderation: Mapped[dict] = mapped_column(JSON, default=dict)
    solution_comment_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    comment_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    author: Mapped[User] = relationship()


class Comment(Base):
    """Comments form a tree through parent_id, so replies can nest without limit."""
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"), nullable=True,
                                                  index=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="published", index=True)
    moderation: Mapped[dict] = mapped_column(JSON, default=dict)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    author: Mapped[User] = relationship()


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(10))  # post | comment
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Report(Base):
    """A member flagging a post or comment for admin review."""
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target_type: Mapped[str] = mapped_column(String(10))
    target_id: Mapped[int] = mapped_column(Integer, index=True)
    reason: Mapped[str] = mapped_column(String(300), default="")
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- hackathons

class Hackathon(Base):
    __tablename__ = "hackathons"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    tagline: Mapped[str] = mapped_column(String(240), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    rules: Mapped[str] = mapped_column(Text, default="")
    tracks: Mapped[list] = mapped_column(JSON, default=list)  # theme tracks / niches
    tech: Mapped[list] = mapped_column(JSON, default=list)
    criteria: Mapped[list] = mapped_column(JSON, default=list)  # [{criterion, weight, description}]
    prizes: Mapped[list] = mapped_column(JSON, default=list)  # [{place, reward}]; empty = no prize
    max_team_size: Mapped[int] = mapped_column(Integer, default=1)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accent: Mapped[str] = mapped_column(String(10), default="#7c5cff")
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    results_published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HackathonEnrollment(Base):
    __tablename__ = "hackathon_enrollments"
    __table_args__ = (UniqueConstraint("hackathon_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    hackathon_id: Mapped[int] = mapped_column(ForeignKey("hackathons.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    team_name: Mapped[str] = mapped_column(String(80), default="")
    track: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class HackathonSubmission(Base):
    __tablename__ = "hackathon_submissions"
    __table_args__ = (UniqueConstraint("hackathon_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    hackathon_id: Mapped[int] = mapped_column(ForeignKey("hackathons.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text, default="")
    repo_url: Mapped[str] = mapped_column(String(500), default="")
    demo_url: Mapped[str] = mapped_column(String(500), default="")
    track: Mapped[str] = mapped_column(String(80), default="")
    ai_review: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)  # final score (AI or admin override)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship()


# ---------------------------------------------------------------- interview integrity

class InterviewStrike(Base):
    """One suspected cheating event during an AI interview."""
    __tablename__ = "interview_strikes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id", ondelete="CASCADE"), index=True)
    # left_tab | paste | ai_tool_on_screen | another_person | phone | other
    kind: Mapped[str] = mapped_column(String(30))
    detail: Mapped[str] = mapped_column(String(400), default="")
    action: Mapped[str] = mapped_column(String(12), default="warning")  # warning | terminated
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class InterviewBan(Base):
    """Escalating bans from AI interviews after an interview is terminated for cheating."""
    __tablename__ = "interview_bans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[int | None] = mapped_column(ForeignKey("interview_sessions.id", ondelete="SET NULL"),
                                                   nullable=True)
    offense: Mapped[int] = mapped_column(Integer)  # counted offense number (1st, 2nd, ...)
    reason: Mapped[str] = mapped_column(String(400), default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # None = permanent
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lifted_by: Mapped[int | None] = mapped_column(Integer, nullable=True)

    user: Mapped[User] = relationship()


# ---------------------------------------------------------------- progress & gamification

class XpEvent(Base):
    """Every XP award, so weekly leagues and group leaderboards can sum XP by period."""
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class UserBadge(Base):
    __tablename__ = "user_badges"
    __table_args__ = (UniqueConstraint("user_id", "badge_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    badge_id: Mapped[str] = mapped_column(String(60))
    awarded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Certificate(Base):
    """Publicly verifiable certificate (e.g. passing a proctored mock test with clean integrity)."""
    __tablename__ = "certificates"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # random public id
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # test | hackathon
    ref: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(200))
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    integrity: Mapped[float | None] = mapped_column(Float, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class Flashcard(Base):
    """A question in a learner's spaced-repetition deck (SM-2 scheduling)."""
    __tablename__ = "flashcards"
    __table_args__ = (UniqueConstraint("user_id", "question_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[str] = mapped_column(String(120))
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    interval_days: Mapped[int] = mapped_column(Integer, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    lapses: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    last_reviewed: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FlashcardReview(Base):
    __tablename__ = "flashcard_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    flashcard_id: Mapped[int] = mapped_column(ForeignKey("flashcards.id", ondelete="CASCADE"))
    grade: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# ---------------------------------------------------------------- career

class StudyPlan(Base):
    __tablename__ = "study_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    target: Mapped[str] = mapped_column(String(60))
    target_label: Mapped[str] = mapped_column(String(120))
    weeks: Mapped[int] = mapped_column(Integer)
    hours_per_week: Mapped[int] = mapped_column(Integer)
    language: Mapped[str] = mapped_column(String(20), default="python")
    experience: Mapped[str] = mapped_column(String(12), default="mid")  # beginner | junior | mid | senior
    start_date: Mapped[date] = mapped_column(Date)
    plan: Mapped[dict] = mapped_column(JSON, default=dict)  # {weeks: [{week, focus, days: [{date, tasks: [...]}]}]}
    coach: Mapped[dict] = mapped_column(JSON, default=dict)  # AI notes per week, weak spots
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ProfileReview(Base):
    """AI review of a CV, LinkedIn profile or GitHub account."""
    __tablename__ = "profile_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # cv | linkedin | github
    target: Mapped[str] = mapped_column(String(80), default="")
    source: Mapped[str] = mapped_column(String(200), default="")  # file name, username...
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------- leagues & contests

class LeagueMembership(Base):
    """A user's league group for one week (Monday-start, UTC)."""
    __tablename__ = "league_memberships"
    __table_args__ = (UniqueConstraint("user_id", "week_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    tier: Mapped[int] = mapped_column(Integer, default=0)
    group_no: Mapped[int] = mapped_column(Integer, default=1)
    final_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(12), nullable=True)  # promoted | stayed | demoted

    user: Mapped[User] = relationship()


class Contest(Base):
    __tablename__ = "contests"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)  # personal timer once started
    problems: Mapped[list] = mapped_column(JSON, default=list)  # [{slug, points}]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContestEntry(Base):
    __tablename__ = "contest_entries"
    __table_args__ = (UniqueConstraint("contest_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    contest_id: Mapped[int] = mapped_column(ForeignKey("contests.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    score: Mapped[int] = mapped_column(Integer, default=0)
    penalty_minutes: Mapped[int] = mapped_column(Integer, default=0)
    solved: Mapped[dict] = mapped_column(JSON, default=dict)  # {slug: {minutes, wrong}}
    wrong: Mapped[dict] = mapped_column(JSON, default=dict)  # {slug: count}

    user: Mapped[User] = relationship()


# ---------------------------------------------------------------- study groups

class StudyGroup(Base):
    __tablename__ = "study_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(String(400), default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    invite_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    max_members: Mapped[int] = mapped_column(Integer, default=8)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GroupMember(Base):
    __tablename__ = "group_members"
    __table_args__ = (UniqueConstraint("group_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(10), default="member")  # owner | member
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class GroupMessage(Base):
    __tablename__ = "group_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="published")
    moderation: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class GroupChallenge(Base):
    __tablename__ = "group_challenges"
    __table_args__ = (UniqueConstraint("group_id", "week_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("study_groups.id", ondelete="CASCADE"), index=True)
    week_start: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    tasks: Mapped[list] = mapped_column(JSON, default=list)  # [{type, ref, title}]


# ---------------------------------------------------------------- debugging & code review rounds

class RoundAttempt(Base):
    __tablename__ = "round_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(10))  # debug | review
    round_id: Mapped[str] = mapped_column(String(120), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    submission: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------- daily challenge + duels

class DailySolve(Base):
    """First accepted solve of the day's shared problem (one row per user per day)."""
    __tablename__ = "daily_solves"
    __table_args__ = (UniqueConstraint("user_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    problem_slug: Mapped[str] = mapped_column(String(120))
    language: Mapped[str] = mapped_column(String(20), default="python")
    attempts: Mapped[int] = mapped_column(Integer, default=1)  # submissions up to and including the accepted one
    runtime_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    bonus_xp: Mapped[int] = mapped_column(Integer, default=0)
    solved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship()


class Duel(Base):
    """A 1v1 race on one problem. Opponent may be another user or a simulated bot (opponent_id None, bot set)."""
    __tablename__ = "duels"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)  # invite code
    problem_slug: Mapped[str] = mapped_column(String(120))
    difficulty: Mapped[str] = mapped_column(String(12), default="Medium")
    status: Mapped[str] = mapped_column(String(12), default="waiting")  # waiting | active | finished | cancelled
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    opponent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    bot: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {name, rating, solve_seconds, ...}
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=30)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    winner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user id; -1 = bot; None = draw/none
    progress: Mapped[dict] = mapped_column(JSON, default=dict)  # {str(user_id)|"bot": {passed, total, attempts, solved_at}}
    rating_change: Mapped[dict] = mapped_column(JSON, default=dict)  # {str(user_id): delta}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    creator: Mapped[User] = relationship(foreign_keys=[creator_id])
    opponent: Mapped[User | None] = relationship(foreign_keys=[opponent_id])


class DuelStats(Base):
    __tablename__ = "duel_stats"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    rating: Mapped[int] = mapped_column(Integer, default=1200)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)


class VettingRun(Base):
    """A full mock hiring pipeline for one talent network (Toptal, Turing, Lemon.io), stage by stage.

    `stages` holds one dict per stage: {key, status: locked|ready|active|passed|failed, ref, started_at, deadline,
    score, note}. Each stage links to the real interview, test attempt or project submission that decided it.
    """
    __tablename__ = "vetting_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    platform: Mapped[str] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(String(80))
    level: Mapped[str] = mapped_column(String(30), default="Mid-level")
    language: Mapped[str] = mapped_column(String(20), default="python")
    status: Mapped[str] = mapped_column(String(12), default="active")  # active | passed | failed | withdrawn
    stages: Mapped[list] = mapped_column(JSON, default=list)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------- library

class Book(Base):
    """A PDF or EPUB uploaded by an admin. The file itself is stored on disk under settings.books_dir."""
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    author: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="General", index=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    format: Mapped[str] = mapped_column(String(8))  # pdf | epub
    filename: Mapped[str] = mapped_column(String(120))  # stored name inside books_dir
    original_name: Mapped[str] = mapped_column(String(300), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover: Mapped[str | None] = mapped_column(String(120), nullable=True)  # stored cover image name
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BookProgress(Base):
    __tablename__ = "book_progress"
    __table_args__ = (UniqueConstraint("user_id", "book_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    location: Mapped[str] = mapped_column(String(500), default="")  # PDF page number or EPUB CFI
    percent: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
