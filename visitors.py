#!/usr/bin/env python3
"""
Watch ClaimTrakr nginx access log for visitors.
Usage: python3 visitors.py [--exclude 1.2.3.4,5.6.7.8] [--interval 15]
"""
import argparse
import os
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta

MOUNTAIN_OFFSET = timedelta(hours=-6)  # MDT; change to -7 for MST


def to_mountain(ts_str):
    """Convert ISO timestamp from nginx log to Mountain time string."""
    try:
        dt = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
        mt = dt.astimezone(timezone(MOUNTAIN_OFFSET))
        return mt.strftime('%m/%d %I:%M %p MT')
    except Exception:
        return ts_str[:16]

LOG_FILE = "logs/nginx/access.log"
DEFAULT_EXCLUDE = {"159.26.99.77"}


def parse_log(path, exclude_ips, since=None):
    visitors = defaultdict(lambda: {"count": 0, "last_seen_raw": None, "last_seen": "", "ua": "", "pages": set()})
    try:
        with open(path) as f:
            for line in f:
                parts = line.strip().split(" | ")
                if len(parts) < 5:
                    continue
                timestamp, ip, status, request, ua = parts[0], parts[1], parts[2], parts[3], parts[4]
                if ip in exclude_ips:
                    continue
                v = visitors[ip]
                v["count"] += 1
                try:
                    ts_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                except Exception:
                    ts_dt = datetime.min.replace(tzinfo=timezone.utc)
                if since and ts_dt < since:
                    continue
                if not v["last_seen_raw"] or ts_dt > v["last_seen_raw"]:
                    v["last_seen_raw"] = ts_dt
                    v["last_seen"] = to_mountain(timestamp)
                v["ua"] = ua[:60]
                method_path = request.split(" ")
                if len(method_path) >= 2:
                    page = method_path[1].split("?")[0]
                    v["pages"].add(page)
    except FileNotFoundError:
        print(f"Log file not found: {path}")
    return visitors


def render(visitors, interval):
    os.system("clear")
    print(f"  ClaimTrakr Visitor Monitor  (refreshes every {interval}s, Ctrl+C to quit)")
    print(f"  Log: {LOG_FILE}")
    print()

    if not visitors:
        print("  No visitors yet (other than excluded IPs).")
        return

    sorted_v = sorted(visitors.items(), key=lambda x: x[1]["last_seen_raw"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)

    col_ip    = 18
    col_count = 7
    col_last  = 18
    col_ua    = 40
    col_pages = 30

    header = (
        f"  {'IP':<{col_ip}} {'Visits':>{col_count}}  {'Last Seen':<{col_last}}"
        f"  {'User Agent':<{col_ua}}  {'Top Pages':<{col_pages}}"
    )
    print(header)
    print("  " + "-" * (col_ip + col_count + col_last + col_ua + col_pages + 12))

    for i, (ip, data) in enumerate(sorted_v):
        pages = ", ".join(sorted(data["pages"])[:3])
        if len(data["pages"]) > 3:
            pages += f" +{len(data['pages'])-3}"
        line = (
            f"  {ip:<{col_ip}} {data['count']:>{col_count}}  {data['last_seen']:<{col_last}}"
            f"  {data['ua']:<{col_ua}}  {pages:<{col_pages}}"
        )
        if i == 0:
            print("\033[93m" + line + "\033[0m")
        else:
            print(line)

    print()
    total = sum(v["count"] for v in visitors.values())
    print(f"  {len(visitors)} unique visitor(s), {total} total requests")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--exclude", default="", help="Comma-separated IPs to exclude")
    parser.add_argument("--interval", type=int, default=15, help="Refresh interval in seconds")
    args = parser.parse_args()

    exclude = DEFAULT_EXCLUDE.copy()
    if args.exclude:
        exclude.update(args.exclude.split(","))

    since = datetime.now(timezone.utc)
    print(f"Watching {LOG_FILE} from {to_mountain(since.isoformat())} (excluding: {', '.join(exclude)}) ...")
    time.sleep(1)

    try:
        while True:
            visitors = parse_log(LOG_FILE, exclude, since=since)
            render(visitors, args.interval)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nDone.")


if __name__ == "__main__":
    main()
