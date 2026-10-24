FROM node:22-slim AS node

FROM python:3.12-slim

# Node.js runs JavaScript submissions in the code runner (copied, so no apt mirror is needed)
COPY --from=node /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "psycopg[binary]>=3.2"

COPY app ./app

# Run as an unprivileged user so submitted code can't touch the system
RUN useradd --create-home haven
USER haven

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
