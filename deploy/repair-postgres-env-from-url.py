from pathlib import Path
from urllib.parse import unquote, urlparse

env_path = Path(".env.tunnel")
pairs = {}
lines = env_path.read_text().splitlines()
for line in lines:
    if "=" in line:
        key, value = line.split("=", 1)
        pairs[key] = value

url = pairs["OPENHEALTH_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
parsed = urlparse(url)

pairs["POSTGRES_USER"] = unquote(parsed.username or "postgres")
pairs["POSTGRES_PASSWORD"] = unquote(parsed.password or pairs.get("POSTGRES_PASSWORD", ""))
pairs["POSTGRES_DB"] = (parsed.path or "/openhealth_bridge").lstrip("/")

keys = []
for line in lines:
    if "=" not in line:
        continue
    key = line.split("=", 1)[0]
    if key not in keys:
        keys.append(key)

for key in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"):
    if key not in keys:
        keys.append(key)

env_path.write_text("\n".join(f"{key}={pairs[key]}" for key in keys if key in pairs) + "\n")
Path(".env.postgres").write_text(
    "\n".join(
        f"{key}={pairs[key]}" for key in ("POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD")
    )
    + "\n",
)

print("Postgres env repaired from OPENHEALTH_DATABASE_URL.")
