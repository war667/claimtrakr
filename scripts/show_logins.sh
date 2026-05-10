#!/bin/sh
# Usage: ./scripts/show_logins.sh [last N lines, default 50]

cd "$(dirname "$0")/.."

LINES=${1:-50}

docker compose logs backend -t --tail="$LINES" | grep "LOGIN" | awk '{
    # Docker timestamp is first field: 2026-05-10T15:14:23.456789Z
    split($1, dt, "T")
    split(dt[1], d, "-")
    split(dt[2], t, ":")

    month_names[1]="Jan"; month_names[2]="Feb"; month_names[3]="Mar"
    month_names[4]="Apr"; month_names[5]="May"; month_names[6]="Jun"
    month_names[7]="Jul"; month_names[8]="Aug"; month_names[9]="Sep"
    month_names[10]="Oct"; month_names[11]="Nov"; month_names[12]="Dec"

    idx = index($0, "LOGIN ")
    login_info = substr($0, idx + 6)

    printf "%s %d, %d %s:%s  %s\n", month_names[d[2]+0], d[3]+0, d[1]+0, t[1], t[2], login_info
}'
