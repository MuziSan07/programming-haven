"""Grant (or revoke) admin rights: python -m app.make_admin someone@example.com [--revoke]"""

import sys

from sqlalchemy import select

from .database import SessionLocal
from .migrate import upgrade
from .models import User


def main(argv: list[str]) -> int:
    emails = [a.lower() for a in argv if not a.startswith("--")]
    if not emails:
        print(__doc__)
        return 1
    upgrade()
    with SessionLocal() as db:
        for email in emails:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                print(f"No user with email {email}")
                continue
            user.is_admin = "--revoke" not in argv
            print(f"{email}: admin={user.is_admin}")
        db.commit()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
