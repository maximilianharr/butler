FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY frontend/ frontend/
COPY plugins/ plugins/
# settings/ and the workspace are bind-mounted at runtime, not baked in.
RUN mkdir -p /app/settings /data/content

# ponytail: runs as root inside the container; single-user box, rootful podman,
# avoids UID-mapping games on the bind mounts. Add a USER if this ever multi-tenants.
EXPOSE 8000
CMD ["uvicorn", "backend.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
