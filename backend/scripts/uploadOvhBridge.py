"""Upload the read-only OVH account bridge to ishyiga.net (uses backend/.env FTP settings)."""
import io
from ftplib import FTP
from pathlib import Path

root = Path(__file__).resolve().parents[1]
env = {}
for line in (root / ".env").read_text(encoding="utf-8").splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key.strip()] = value.strip()


def php_str(value):
    return "'" + str(value).replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    required = [
        "FTP_HOST",
        "FTP_USER",
        "FTP_PASSWORD",
        "ISHYIGA_OVH_QUERY_KEY",
        "ISHYIGA_MYSQL_HOST",
        "ISHYIGA_MYSQL_DATABASE",
        "ISHYIGA_MYSQL_USER",
        "DB_PASSWORD",
    ]
    missing = [name for name in required if not env.get(name)]
    if missing:
        raise SystemExit(f"Missing in .env: {', '.join(missing)}")

    bridge = root / "ovh-bridge"
    config = (
        "<?php\n"
        f"define('ASSISTANT_KEY', {php_str(env['ISHYIGA_OVH_QUERY_KEY'])});\n"
        f"define('DB_HOST', {php_str(env['ISHYIGA_MYSQL_HOST'])});\n"
        f"define('DB_NAME', {php_str(env['ISHYIGA_MYSQL_DATABASE'])});\n"
        f"define('DB_USER', {php_str(env['ISHYIGA_MYSQL_USER'])});\n"
        f"define('DB_PASS', {php_str(env['DB_PASSWORD'])});\n"
    )

    ftp = FTP()
    ftp.connect(env["FTP_HOST"], 21, timeout=40)
    ftp.login(env["FTP_USER"], env["FTP_PASSWORD"])

    def put(name, data):
        ftp.storbinary("STOR " + name, io.BytesIO(data.encode("utf-8")))

    put("ishyiga-assistant.config.php", config)
    ftp.cwd("www/ishyiga-assistant")
    put("account-query.php", (bridge / "account-query.php").read_text(encoding="utf-8"))
    put("ping.php", (bridge / "ping.php").read_text(encoding="utf-8"))
    put(".htaccess", (bridge / ".htaccess").read_text(encoding="utf-8"))
    ftp.quit()
    print("OVH bridge uploaded.")


if __name__ == "__main__":
    main()
