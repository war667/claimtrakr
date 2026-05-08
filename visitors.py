#!/usr/bin/env python3
"""
Watch ClaimTrakr nginx access log for visitors.
Usage: python3 visitors.py [--exclude 1.2.3.4,5.6.7.8] [--interval 15]
"""
import argparse
import os
import time
from collections import defaultdict

LOG_FILE = "logs/nginx/access.log"
DEFAULT_EXCLUDE = {"159.26.99.77"}


def parse_log(path, exclude_ips):
    visitors = defaultdict(lambda: {"count": 0, "last_seen": "", "ua": "", "pages": set()})
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
                v["last_seen"] = timestamp[:16].replace("T", " ")
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

    sorted_v = sorted(visitors.items(), key=lambda x: x[1]["count"], reverse=True)

    col_ip    = 18
    col_count = 7
    col_last  = 18
    col_pages = 25
    col_ua    = 60

    header = (
        f"  {'IP':<{col_ip}} {'Visits':>{col_count}}  {'Last Seen':<{col_last}}"
        f"  {'Top Pages':<{col_pages}}  {'User Agent':<{col_ua}}"
    )
    print(header)
    print("  " + "-" * (col_ip + col_count + col_last + col_pages + col_ua + 10))

    for ip, data in sorted_v:
        pages = ", ".join(sorted(data["pages"])[:3])
        if len(data["pages"]) > 3:
            pages += f" +{len(data['pages'])-3}"
        print(
            f"  {ip:<{col_ip}} {data['count']:>{col_count}}  {data['last_seen']:<{col_last}}"
            f"  {pages:<{col_pages}}  {data['ua']:<{col_ua}}"
        )

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

    print(f"Watching {LOG_FILE} (excluding: {', '.join(exclude)}) ...")
    time.sleep(1)

    try:
        while True:
            visitors = parse_log(LOG_FILE, exclude)
            render(visitors, args.interval)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nDone.")


if __name__ == "__main__":
    main()
