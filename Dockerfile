# Cloud Run image for the Python API (api/). The Next.js site still deploys on Vercel.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/ api/
CMD exec uvicorn api.index:app --host 0.0.0.0 --port ${PORT:-8080} --timeout-keep-alive 75
