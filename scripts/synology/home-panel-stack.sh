#!/bin/sh
# Boot-time starter for the Docker stacks on Synology DSM.
#
# At boot DSM starts every container at once and they race each other to
# register an endpoint in the docker bridge store. The losers die on the
# spot with exit 128:
#
#   driver failed programming external connectivity on endpoint
#   home-panel-api: failed to update bridge endpoint ... to store:
#   failed to update bridge store for object type
#   *bridge.bridgeEndpoint: timeout
#
# Two things make this nastier than it looks:
#
#   - `restart: unless-stopped` does NOT rescue them. The failure is in
#     the start path, not in the container process, so the restart policy
#     has nothing to restart and they stay down until someone runs
#     `up -d` by hand.
#   - Which containers lose is luck, not configuration. Publishing ports
#     is not the discriminator: on 2026-07-16 the runner published none
#     and still died, while mosquitto (also none) survived. Every
#     container on the bridge is exposed, so don't bother reasoning about
#     which ones "should" be safe — just bring everything back up.
#
# That day api, zigbee2mqtt and the runner stayed down for 18h.
#
# Install on the NAS:
#   sudo cp scripts/synology/home-panel-stack.sh /usr/local/etc/rc.d/home-panel-stack.sh
#   sudo chmod +x /usr/local/etc/rc.d/home-panel-stack.sh
#   sudo /usr/local/etc/rc.d/home-panel-stack.sh start

DOCKER=/usr/local/bin/docker
LOG=/var/log/home-panel-stack.log

# Both compose projects on this NAS lose the same race. The runner is not
# part of this repo — it is the self-hosted CI runner that deploys it —
# but it dies the same way and nothing else brings it back, and a dead
# runner means deploys silently stop happening.
DIRS='/volume1/docker/home-panel /volume1/docker/runner'

# The bridge settles well inside a minute in practice. 20 tries x 15s is
# five minutes of headroom — long enough to ride out a slow boot, short
# enough that a genuinely broken stack still gives up and says so.
ATTEMPTS=20
DELAY=15

log() { echo "$(date '+%F %T') $*" >>"$LOG"; }

wait_for_docker() {
    # rc.d can run before Container Manager is listening.
    i=0
    until "$DOCKER" info >/dev/null 2>&1; do
        i=$((i + 1))
        if [ "$i" -ge 60 ]; then
            log 'docker daemon still not responding after 5m; giving up'
            return 1
        fi
        sleep 5
    done
}

bring_up() {
    # `up -d` is idempotent: running containers are left alone and only
    # what is down gets started. It also exits non-zero when a container
    # fails to start, which is exactly the race being retried — so the
    # exit code is the whole retry condition, no output parsing needed
    # (`compose ps --format` is broken on the DSM build of compose).
    i=0
    while [ "$i" -lt "$ATTEMPTS" ]; do
        i=$((i + 1))
        if (cd "$1" && "$DOCKER" compose up -d) >>"$LOG" 2>&1; then
            log "$1: up after $i attempt(s)"
            return 0
        fi
        log "$1: attempt $i failed; retrying in ${DELAY}s"
        sleep "$DELAY"
    done
    log "$1: still down after $ATTEMPTS attempts; needs a look"
    return 1
}

start() {
    # rc.d runs synchronously at boot: do the waiting in the background so
    # a slow docker never holds up the rest of DSM coming up.
    (
        wait_for_docker || exit 1
        for d in $DIRS; do bring_up "$d"; done
    ) &
}

stop() {
    for d in $DIRS; do (cd "$d" && "$DOCKER" compose stop) >>"$LOG" 2>&1; done
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; start ;;
    status) for d in $DIRS; do (cd "$d" && "$DOCKER" compose ps); done ;;
    *) echo "Usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
