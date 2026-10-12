#!/usr/bin/env bash
# mineclash #41: Deploy ohne Match-Abbruch.
# Ablauf: Drain ausloesen -> warten bis kein Match laeuft und keine Settles
# offen sind -> neue Version holen und neu starten (docker compose).
# Upstream deploy.sh/update.sh bleiben unberuehrt.
#
# Konfiguration per Umgebung (keine Defaults fuer Hosts/Keys im Repo):
#   DEPLOY_HOST        ssh-Ziel (z. B. deploy@HOST). Leer = lokal ausfuehren.
#   DEPLOY_DIR         Verzeichnis mit docker-compose.yml auf dem Host
#   COMPOSE_SERVICE    Compose-Service des Spielservers   (Default: game)
#   HEALTH_URL         Master-Port, vom Host aus gesehen  (Default: http://127.0.0.1:3000)
#   MINECLASH_DRAIN_KEY  Secret fuer POST /api/admin/drain (= Server-Env, sonst API_KEY)
#   MAX_WAIT_MIN       Abbruch des Wartens (Default: 90, > DRAIN_MAX_MATCH_MINUTES + Puffer)
#
# Compose: Service mit `restart: "no"` oder `on-failure`; der Prozess beendet
# sich nach dem Drain selbst, `up -d` unten startet die neue Version.
set -euo pipefail

: "${DEPLOY_DIR:?DEPLOY_DIR fehlt}"
: "${MINECLASH_DRAIN_KEY:?MINECLASH_DRAIN_KEY fehlt}"
SERVICE="${COMPOSE_SERVICE:-game}"
URL="${HEALTH_URL:-http://127.0.0.1:3000}"
MAX_WAIT_MIN="${MAX_WAIT_MIN:-90}"

remote() {
    if [ -n "${DEPLOY_HOST:-}" ]; then ssh "$DEPLOY_HOST" "$1"; else sh -c "$1"; fi
}

echo "Drain starten ..."
remote "curl -fsS -X POST -H 'x-api-key: ${MINECLASH_DRAIN_KEY}' ${URL}/api/admin/drain" > /dev/null

deadline=$(($(date +%s) + MAX_WAIT_MIN * 60))
while :; do
    # Prozess weg (Health nicht erreichbar) = Drain fertig und beendet.
    if ! out=$(remote "curl -sS ${URL}/api/health" 2> /dev/null); then
        echo "Server beendet."
        break
    fi
    running=$(printf '%s' "$out" | grep -o '"runningMatches":[0-9]*' | cut -d: -f2 || true)
    pending=$(printf '%s' "$out" | grep -o '"pendingSettles":[a-z]*' | cut -d: -f2 || true)
    echo "laufende Matches: ${running:-?}, offene Settles: ${pending:-?}"
    if [ "${running:-1}" = "0" ] && [ "${pending:-true}" = "false" ]; then
        break
    fi
    if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "Zeitlimit beim Warten, Abbruch (Server laeuft weiter im Drain)." >&2
        exit 1
    fi
    sleep 15
done

echo "Neue Version starten ..."
remote "cd '${DEPLOY_DIR}' && docker compose pull ${SERVICE} && docker compose up -d ${SERVICE}"
echo "Fertig."
