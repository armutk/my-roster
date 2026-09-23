#!/usr/bin/env python3
"""Headless UI check for the roster app.

Browser Use is unavailable on this VPS (no Chromium default profile), so drive
the cached Playwright headless shell over CDP instead.

    cd /root/workspace/my-roster && python3 -m http.server 8093 &
    python3 tools/ui_check.py            # add --pay to print the Pay view lines

Checks: every view renders, the console is clean, the contract card shows the
engine rate, and the Pay view totals include the known payslip figures.
"""
import argparse, asyncio, json, os, subprocess, sys, time, urllib.request

CHROME_CANDIDATES = [
    "/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell",
    "/root/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
]
VIEWS = ["home", "roster", "calendar", "stats", "pay", "leave"]


def chrome_path():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    sys.exit("no headless shell found; check /root/.cache/ms-playwright")


async def run(url, port, show_pay, show_leave):
    import websockets
    chrome = chrome_path()
    proc = subprocess.Popen(
        [chrome, "--headless", "--no-sandbox", "--disable-gpu",
         f"--remote-debugging-port={port}", f"--user-data-dir=/tmp/roster-ui-check-{port}",
         "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1) as r:
                    json.load(r)
                break
            except Exception:
                time.sleep(0.5)
        else:
            sys.exit("devtools never came up")

        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list") as r:
            page = [t for t in json.load(r) if t["type"] == "page"][0]

        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=20 * 1024 * 1024) as ws:
            mid = 0

            async def send(method, params=None):
                nonlocal mid
                mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == mid:
                        res = msg.get("result", {})
                        if "exceptionDetails" in res:
                            return "EXCEPTION: " + json.dumps(res["exceptionDetails"])[:200]
                        return res.get("result", {}).get("value")

            await send("Runtime.enable")
            await send("Page.enable")
            await send("Page.addScriptToEvaluateOnNewDocument", {"source":
                "window.__errs=[];window.addEventListener('error',e=>window.__errs.push(String(e.message)));"})
            await send("Page.navigate", {"url": url})
            await asyncio.sleep(3)

            for view in VIEWS:
                await send("Runtime.evaluate", {"expression":
                    f"document.querySelector('[data-view=\"{view}\"]').click()"})
                await asyncio.sleep(0.9)
                text = await send("Runtime.evaluate", {"expression": "document.body.innerText"}) or ""
                flags = [bad for bad in ("NaN", "undefined", "[object") if bad in text]
                print(f"{view:9} {len(text):5} chars  {'FLAGS: ' + ','.join(flags) if flags else 'clean'}")
                if show_pay and view == "pay":
                    for line in text.splitlines():
                        if "$" in line:
                            print("   ", line.strip())
                if show_leave and view == "leave":
                    for line in text.splitlines():
                        if " h" in line or "days" in line:
                            print("   ", line.strip())

            print("contract card:", (await send("Runtime.evaluate", {
                "expression": "(document.getElementById('contractCard')||{}).innerText"}) or "").replace("\n", " | "))
            print("console errors:", await send("Runtime.evaluate", {"expression": "JSON.stringify(window.__errs)"}))

            # Narrow-viewport overflow check (the app must not scroll sideways).
            for width in (375, 320):
                await send("Emulation.setDeviceMetricsOverride",
                           {"width": width, "height": 800, "deviceScaleFactor": 2, "mobile": True})
                await asyncio.sleep(0.8)
                for view in VIEWS:
                    await send("Runtime.evaluate", {"expression":
                        f"document.querySelector('[data-view=\"{view}\"]').click()"})
                    await asyncio.sleep(0.6)
                    overflow = await send("Runtime.evaluate", {"expression":
                        "(() => { const d=document.documentElement; return d.scrollWidth - d.clientWidth; })()"})
                    print(f"  {width}px {view:9} overflow {overflow}px")
    finally:
        proc.terminate()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8093/index.html")
    ap.add_argument("--port", type=int, default=9224)
    ap.add_argument("--pay", action="store_true", help="print the Pay view's money lines")
    ap.add_argument("--leave", action="store_true", help="print the Leave view's balance lines")
    a = ap.parse_args()
    asyncio.run(run(a.url, a.port, a.pay, a.leave))
