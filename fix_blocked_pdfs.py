import os, sys, json, time, re, urllib.parse, subprocess, hashlib, signal, random
from pathlib import Path

_TEMP = os.path.join(os.path.expanduser("~"), "pw_temp")
os.makedirs(_TEMP, exist_ok=True)
os.environ["PLAYWRIGHT_BROWSERS_PATH"]  = os.path.join(os.path.expanduser("~"), "playwright-browsers")
os.environ["PLAYWRIGHT_ARTIFACTS_PATH"] = _TEMP
os.environ["TEMP"] = os.environ["TMP"]  = _TEMP

from playwright.sync_api import sync_playwright
from pypdf import PdfReader

# playwright-stealth — optional but strongly recommended
try:
    from playwright_stealth import stealth_sync
    STEALTH_AVAILABLE = True
    print("✅ playwright-stealth loaded")
except ImportError:
    STEALTH_AVAILABLE = False
    print("⚠️  playwright-stealth not found — run: pip install playwright-stealth")

BASE_OUTPUT  = r"C:\py\output_pdfs"
VISITED_FILE = r"C:\py\visited_urls.json"
HASH_FILE    = r"C:\py\content_hashes.json"
BAD_PDF_FILE = r"C:\py\bad_pdfs.json"
STILL_BAD    = r"C:\py\still_blocked.json"

BAD_PHRASES = [
    "access denied",
    "you don't have permission",
    "you do not have permission",
    "403 forbidden",
    "permission denied",
    "request blocked",
    "security check",
    "enable javascript",
    "please enable cookies",
    "ray id",
    "incident id",
    "reference #18.",
    "reference #",
    "this page isn't available",
    "page not available",
    "edgesuite.net",
]

# Phrases that mean Akamai challenge IS running (not yet blocked, not yet clean)
CHALLENGE_PHRASES = [
    "just a moment",
    "checking your browser",
    "please wait",
    "ddos protection",
    "enable cookies",
    "verifying you",
    "one moment",
    "performance & security by",
    "ray id",          # Cloudflare
    "_bm_sz",          # Akamai cookie name sometimes in text
]

CLEANUP_CSS = """
    header, nav, footer, .nav, .cookie-banner, .modal, .overlay,
    [class*="cookie"], [class*="modal"], [class*="banner"], [class*="chat"],
    .grecaptcha-badge, #onetrust-banner-sdk, .sticky-header,
    .back-to-top, .breadcrumbs { display: none !important; }
    body { background: #fff !important; }
    .accordion-content, [aria-hidden="true"], [hidden], details > * {
        display: block !important; visibility: visible !important;
        height: auto !important; max-height: none !important;
        overflow: visible !important;
    }
    body, p, li, td { font-size: 14px !important; line-height: 1.6 !important; }
    h1 { font-size: 24px !important; color: #003366 !important; }
    h2 { font-size: 18px !important; color: #003366 !important; }
"""

# ── Ctrl+C safe exit ──────────────────────────────────────────────
_g_visited = set()
_g_hashes  = {}

def save_and_exit(sig=None, frame=None):
    print("\n\n⚠️  Ctrl+C — saving progress...")
    if _g_visited:
        json.dump(sorted(_g_visited), open(VISITED_FILE, "w"), indent=2)
    if _g_hashes:
        json.dump(_g_hashes, open(HASH_FILE, "w"), indent=2)
    print(f"   ✅ {len(_g_visited)} visited URLs saved")
    print("\n▶  Run again to resume.\n")
    sys.exit(0)

signal.signal(signal.SIGINT, save_and_exit)

# ── Helpers ───────────────────────────────────────────────────────
def force_https(url):
    url = url.strip()
    url = re.sub(r'^https?://(www\.)?', 'https://www.', url)
    return url.rstrip("/")
def extract_url_from_pdf(pdf_path):
    try:
        reader = PdfReader(str(pdf_path))
        for page in reader.pages[:2]:
            text  = page.extract_text() or ""
            match = re.search(
                r'https?://(?:www\.)?citizensbank\.com[^\s\]>"\)\n]+', text
            )
            if match:
                return force_https(match.group(0).rstrip(".,;)\n"))
    except Exception:
        pass
    return None

def get_page_text(page):
    try:
        return page.evaluate("""() => {
            const el = document.querySelector(
                'main, [role="main"], article, .content, #main-content, body'
            );
            return (el || document.body).innerText
                .replace(/\\s+/g, ' ').trim().toLowerCase();
        }""")
    except Exception:
        return ""

def is_challenge_page(page):
    """Returns True if Akamai/CF challenge is still running."""
    try:
        title = page.title().lower()
        if any(c in title for c in CHALLENGE_PHRASES):
            return True
        # Also check page body
        text = page.evaluate("""() =>
            document.body.innerText.replace(/\\s+/g,' ').trim().toLowerCase()
        """)
        return any(c in text for c in CHALLENGE_PHRASES)
    except Exception:
        return True  # Assume still loading

def is_blocked_page(page):
    """Returns blocking phrase if content is blocked, None if clean."""
    try:
        text = get_page_text(page)
        return next((ph for ph in BAD_PHRASES if ph in text), None)
    except Exception:
        return "eval_error"

def page_status(page):
    """
    Returns:
        'challenge'  — Akamai/CF JS challenge still running
        'blocked'    — Page loaded but shows access denied
        'clean'      — Page loaded with real content
        'empty'      — Page loaded but too little content
    """
    try:
        title = page.title().lower()
        if any(c in title for c in CHALLENGE_PHRASES):
            return "challenge"

        text  = get_page_text(page)

        if any(c in text for c in CHALLENGE_PHRASES):
            return "challenge"

        blocked = next((ph for ph in BAD_PHRASES if ph in text), None)
        if blocked:
            return "blocked"

        if len(text) < 80:
            return "empty"

        return "clean"

    except Exception:
        return "challenge"  # Still loading

def apply_stealth(page):
    """Apply playwright-stealth if available, otherwise manual patches."""
    if STEALTH_AVAILABLE:
        stealth_sync(page)
    else:
        page.add_init_script("""
            // Remove webdriver traces
            Object.defineProperty(navigator, 'webdriver',    { get: () => undefined });
            Object.defineProperty(navigator, 'plugins',      { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages',    { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'platform',     { get: () => 'Win32' });
            Object.defineProperty(navigator, 'vendor',       { get: () => 'Google Inc.' });
            Object.defineProperty(navigator, 'productSub',   { get: () => '20030107' });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'maxTouchPoints',      { get: () => 0 });

            // Chrome runtime
            window.chrome = {
                app: { isInstalled: false },
                runtime: {
                    onConnect: { addListener: () => {} },
                    onMessage: { addListener: () => {} },
                },
                loadTimes: () => {},
                csi:        () => {},
            };

            // Permissions API
            const origQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : origQuery(parameters);

            // Canvas noise (makes fingerprint less unique)
            const getCtx = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                const ctx = getCtx.call(this, type, ...args);
                if (type === '2d' && ctx) {
                    const origFillText = ctx.fillText.bind(ctx);
                    ctx.fillText = function(...a) {
                        ctx.shadowBlur = Math.random() * 0.01;
                        return origFillText(...a);
                    };
                }
                return ctx;
            };

            // Correct iframe window check
            Object.defineProperty(window, 'outerWidth',  { get: () => window.innerWidth });
            Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 74 });
        """)

def human_delay(min_s=0.4, max_s=1.2):
    time.sleep(random.uniform(min_s, max_s))

def human_mouse(page):
    """Simulate realistic mouse movement."""
    try:
        for _ in range(random.randint(2, 4)):
            page.mouse.move(
                random.randint(100, 900),
                random.randint(100, 600),
                steps=random.randint(5, 15)
            )
            human_delay(0.1, 0.3)
    except Exception:
        pass

# ── Wait for challenge to clear ────────────────────────────────────
def wait_for_clear(page, url_label, max_wait=25):
    """
    Smarter Akamai wait:
    - Watches for page title to CHANGE (challenge title → real title)
    - Random mouse moves during wait (looks human)
    - Returns (status, text)
    """
    start     = time.time()
    last_title = ""
    dots       = 0

    while (elapsed := time.time() - start) < max_wait:
        status = page_status(page)

        if status == "clean":
            return "clean", get_page_text(page)

        if status == "blocked":
            if elapsed < 5:
                # Might still be transitioning
                time.sleep(1.5)
                continue
            return "blocked", get_page_text(page)

        if status == "empty":
            if elapsed < 3:
                time.sleep(1.5)
                continue
            return "empty", get_page_text(page)

        # status == "challenge" — still running
        try:
            current_title = page.title()
        except Exception:
            current_title = ""

        if current_title != last_title and current_title:
            dots = 0
            print(f"\n               ⏳ Challenge: '{current_title[:40]}' ({elapsed:.0f}s)",
                  end="", flush=True)
            last_title = current_title
        else:
            dots += 1
            print(".", end="", flush=True)
            if dots % 10 == 0:
                print(f" ({elapsed:.0f}s)", end="", flush=True)

        # Random human-like mouse movement during wait
        if random.random() < 0.3:
            human_mouse(page)

        # Random scroll
        if random.random() < 0.2:
            try:
                page.evaluate(f"window.scrollTo(0, {random.randint(0, 300)})")
            except Exception:
                pass

        time.sleep(1.2)

    print(f"\n               ⏳ Timed out after {max_wait}s")
    return "timeout", get_page_text(page)

# ═════════════════════════════════════════════════════════════════
#  FALLBACK METHODS
# ═════════════════════════════════════════════════════════════════

def method_direct(page, url):
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        status, text = wait_for_clear(page, url)
        return status == "clean", page.url
    except Exception:
        return False, url

def method_via_homepage(page, url):
    try:
        print(f"\n               🔄 Method 2: homepage → target...")
        page.goto("https://www.citizensbank.com/", wait_until="networkidle", timeout=20000)
        human_delay(1.5, 3.0)
        human_mouse(page)

        # Click a random link on homepage to establish session depth
        try:
            links = page.query_selector_all("a[href*='citizensbank.com']")
            if links:
                random.choice(links[:8]).click()
                human_delay(1.5, 2.5)
        except Exception:
            pass

        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        status, text = wait_for_clear(page, url)
        return status == "clean", page.url
    except Exception:
        return False, url

def method_via_category(page, url):
    try:
        parsed   = urllib.parse.urlparse(url)
        parts    = parsed.path.strip("/").split("/")
        category = f"https://www.citizensbank.com/{parts[0]}/"

        print(f"\n               🔄 Method 3: category {parts[0]}/ → target...")
        page.goto(category, wait_until="networkidle", timeout=20000)
        human_delay(1.0, 2.5)

        # Scroll category page naturally
        ht = page.evaluate("document.body.scrollHeight")
        for fraction in [0.3, 0.6, 0.4, 0.1]:
            page.evaluate(f"window.scrollTo(0, {int(ht * fraction)})")
            human_delay(0.3, 0.7)

        # If there are 2+ path parts, try the parent as well
        if len(parts) >= 3:
            parent = f"https://www.citizensbank.com/{parts[0]}/{parts[1]}/"
            try:
                page.goto(parent, wait_until="domcontentloaded", timeout=12000)
                human_delay(1.0, 2.0)
            except Exception:
                pass

        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        status, text = wait_for_clear(page, url)
        return status == "clean", page.url
    except Exception:
        return False, url

def method_mobile_ua(browser, url):
    mobile_ctx = None
    try:
        print(f"\n               🔄 Method 4: Mobile user-agent (iPhone)...")
        mobile_ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/17.4.1 Mobile/15E148 Safari/604.1"
            ),
            viewport={"width": 390, "height": 844},
            device_scale_factor=3,
            has_touch=True,
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
                "Sec-Fetch-Site":  "none",
                "Sec-Fetch-Mode":  "navigate",
                "Sec-Fetch-Dest":  "document",
            }
        )
        if STEALTH_AVAILABLE:
            mobile_page = mobile_ctx.new_page()
            stealth_sync(mobile_page)
        else:
            mobile_page = mobile_ctx.new_page()
            mobile_page.add_init_script("""
                Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
                Object.defineProperty(navigator,'platform',{get:()=>'iPhone'});
                Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
            """)

        mobile_page.goto("https://www.citizensbank.com/", wait_until="networkidle", timeout=15000)
        human_delay(2.0, 3.5)

        mobile_page.goto(url, wait_until="domcontentloaded", timeout=25000)
        status, text = wait_for_clear(mobile_page, url, max_wait=20)

        if status == "clean":
            landed = mobile_page.url
            mobile_ctx.close()
            return True, landed, text
        mobile_ctx.close()
        return False, url, ""
    except Exception as e:
        if mobile_ctx:
            try:
                mobile_ctx.close()
            except Exception:
                pass
        return False, url, ""

def method_wayback(page, url):
    try:
        import requests as req
        print(f"\n               🔄 Method 5: Wayback Machine...")
        r    = req.get(f"http://archive.org/wayback/available?url={url}", timeout=10)
        snap = r.json().get("archived_snapshots", {}).get("closest", {})
        if not snap.get("available"):
            print(f"               ↳ No Wayback snapshot found")
            return False, url

        wb_url = snap["url"]
        ts     = snap.get("timestamp", "?")[:8]
        print(f"               ↳ Snapshot {ts}: {wb_url[-55:]}")

        page.goto(wb_url, wait_until="domcontentloaded", timeout=30000)
        human_delay(2.0, 3.5)

        text = get_page_text(page)
        # Strip Wayback toolbar noise
        text = re.sub(r'wayback machine.*?skip navigation', '', text, flags=re.IGNORECASE)

        blocked = next((ph for ph in ["access denied", "403 forbidden"] if ph in text), None)
        if not blocked and len(text) >= 80:
            return True, wb_url
        print(f"               ↳ Wayback page still blocked or empty")
        return False, url
    except Exception as e:
        print(f"               ↳ Wayback error: {e}")
        return False, url

def method_manual(page, url, item_num, total):
    """
    Method 6 — MANUAL INTERVENTION.
    Pauses script, opens URL in browser, waits for user to confirm.
    This NEVER fails — if you can see the page, you can save the PDF.
    """
    print(f"\n               🙋 Method 6: MANUAL INTERVENTION")
    print(f"               ┌─────────────────────────────────────────────────┐")
    print(f"               │  All automated methods failed for this URL.     │")
    print(f"               │                                                 │")
    print(f"               │  1. Look at the Chrome window that opened.      │")
    print(f"               │  2. Navigate to this URL manually:              │")
    print(f"               │     {url[-50:]:<50} │")
    print(f"               │  3. Wait for the page to fully load.            │")
    print(f"               │  4. Come back here and press Enter to save PDF. │")
    print(f"               │  5. Or press S + Enter to skip this URL.        │")
    print(f"               └─────────────────────────────────────────────────┘")
    print(f"               [{item_num}/{total}]  Waiting for you...")

    # Open URL in the browser automatically
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=10000)
    except Exception:
        pass

    # Bring browser window to front
    try:
        page.bring_to_front()
    except Exception:
        pass

    choice = input("\n               Press Enter to save PDF, or 's' to skip: ").strip().lower()

    if choice == "s":
        return False, url

    # Check if page is now clean after manual navigation
    status, text = wait_for_clear(page, url, max_wait=5)
    if status in ("clean", "timeout"):  # timeout = we'll try anyway
        text = get_page_text(page)
        if len(text) >= 80:
            return True, page.url
    return False, url

# ── Unified access — try all methods ─────────────────────────────
def access_url(page, browser, url, item_num, total, manual_mode):
    """
    Try Methods 1-5 automatically. If all fail, use Method 6 (manual)
    only if manual_mode is enabled.
    Returns (success, final_url, method_used)
    """
    url = force_https(url)

    print(f"               ⬇  Trying Method 1 (direct)...")
    ok, landed = method_direct(page, url)
    if ok:
        return True, landed, "direct"

    ok, landed = method_via_homepage(page, url)
    if ok:
        return True, landed, "homepage_ref"

    ok, landed = method_via_category(page, url)
    if ok:
        return True, landed, "category_ref"

    ok, landed, _ = method_mobile_ua(browser, url)
    if ok:
        # Reload in main page context for PDF generation
        try:
            page.goto(landed, wait_until="domcontentloaded", timeout=25000)
            human_delay(2, 3)
        except Exception:
            pass
        return True, landed, "mobile_ua"

    ok, landed = method_wayback(page, url)
    if ok:
        return True, landed, "wayback"

    # Method 6 — manual (only if enabled)
    if manual_mode:
        ok, landed = method_manual(page, url, item_num, total)
        if ok:
            return True, landed, "manual"

    return False, url, "all_failed"

# ── Save PDF from current page state ─────────────────────────────
def save_pdf(page, out_path, url_for_header):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    ht = page.evaluate("document.body.scrollHeight")
    for pos in [ht // 4, ht // 2, 3 * ht // 4, ht, 0]:
        page.evaluate(f"window.scrollTo(0, {pos})")
        time.sleep(0.05)

    page.evaluate("""() => {
        document.querySelectorAll('[aria-expanded="false"]')
            .forEach(el => { try { el.click() } catch(e) {} });
        document.querySelectorAll('details:not([open]) > summary')
            .forEach(el => { try { el.click() } catch(e) {} });
    }""")
    time.sleep(0.3)
    page.add_style_tag(content=CLEANUP_CSS)
    time.sleep(0.2)

    page.pdf(
        path=out_path,
        format="A4",
        print_background=True,
        scale=0.85,
        margin={"top": "15mm", "bottom": "15mm",
                "left": "12mm", "right": "12mm"},
        display_header_footer=True,
        header_template=(
            '<div style="font-size:8px;color:#666;width:100%;padding:0 12mm;'
            'display:flex;justify-content:space-between;">'
            '<span style="color:#003366;font-weight:bold;">Citizens Bank</span>'
            f'<span style="font-size:7px;color:#999">{url_for_header}</span></div>'
        ),
        footer_template=(
            '<div style="font-size:8px;color:#999;width:100%;padding:0 12mm;'
            'display:flex;justify-content:space-between;">'
            '<span>Citizens Bank Knowledge Base</span>'
            '<span>Page <span class="pageNumber"></span>'
            ' of <span class="totalPages"></span></span></div>'
        ),
    )
    return os.path.getsize(out_path) / 1024

# ── Scan PDFs ─────────────────────────────────────────────────────
def scan_pdfs():
    all_pdfs = sorted(Path(BASE_OUTPUT).rglob("*.pdf"))
    total    = len(all_pdfs)
    print(f"🔍 Scanning {total} PDFs...\n")

    bad  = []
    good = 0

    for i, pdf_path in enumerate(all_pdfs, 1):
        bar  = "█" * int(30 * i / total) + "░" * (30 - int(30 * i / total))
        name = os.path.basename(str(pdf_path))[:40]
        print(f"   [{bar}] {i:>4}/{total}  {name:<40}", end="\r", flush=True)

        try:
            reader = PdfReader(str(pdf_path))
            text   = " ".join((p.extract_text() or "") for p in reader.pages).lower()

            if len(text.strip()) < 30:
                reason = "empty_pdf"
            else:
                reason = next((ph for ph in BAD_PHRASES if ph in text), None)

            if reason:
                url   = extract_url_from_pdf(str(pdf_path))
                entry = {"path": str(pdf_path), "url": url,
                         "reason": reason,
                         "kb": round(os.path.getsize(str(pdf_path)) / 1024, 1)}
                bad.append(entry)
        except Exception:
            pass
        else:
            if not reason:
                good += 1

    print()
    bad_with_url = [b for b in bad if b["url"]]
    no_url       = [b for b in bad if not b["url"]]

    print(f"\n{'='*65}")
    print(f"  ✅  Good PDFs      : {good:>5}")
    print(f"  ❌  Bad PDFs found : {len(bad):>5}")
    print(f"  ⚠️  No URL in PDF  : {len(no_url):>5}")
    print(f"{'='*65}\n")

    if no_url:
        json.dump(no_url, open(r"C:\py\no_url_pdfs.json", "w"), indent=2)

    json.dump(bad, open(BAD_PDF_FILE, "w"), indent=2)
    return bad_with_url

# ── Main refetch loop ─────────────────────────────────────────────
def refetch(bad_pdfs, manual_mode):
    global _g_visited, _g_hashes

    CHROME_PATHS = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    exe = next((p for p in CHROME_PATHS if os.path.exists(p)), None)
    if not exe:
        print("❌ Chrome/Edge not found!"); sys.exit(1)

    _g_visited = set(json.load(open(VISITED_FILE)) if os.path.exists(VISITED_FILE) else [])
    _g_hashes  = json.load(open(HASH_FILE))         if os.path.exists(HASH_FILE)    else {}

    method_stats = {
        "direct": 0, "homepage_ref": 0, "category_ref": 0,
        "mobile_ua": 0, "wayback": 0, "manual": 0, "all_failed": 0
    }

    print(f"🚀 Launching {os.path.basename(exe)}...")
    proc = subprocess.Popen([
        exe,
        "--remote-debugging-port=9222",
        r"--user-data-dir=C:\py\chrome-debug-profile",
        "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--start-maximized",
        "--disable-blink-features=AutomationControlled",
       
    ])
    time.sleep(5)
    print("   ✅ Browser ready\n")

    fixed     = 0
    skipped   = 0
    still_bad = []

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp("http://localhost:9222")
        ctx     = browser.contexts[0] if browser.contexts else browser.new_context()
        page    = ctx.pages[0]        if ctx.pages        else ctx.new_page()

        # Apply stealth to main page
        apply_stealth(page)

        # Block analytics (speed up loads)
        try:
            ctx.route(
                re.compile(r".*(google-analytics|googletagmanager|doubleclick|hotjar|fbevents).*"),
                lambda route: route.abort()
            )
        except Exception:
            pass

        print("🍪 Warming up session cookies...")
        try:
            page.goto("https://www.citizensbank.com/", wait_until="networkidle", timeout=20000)
            human_delay(2, 4)
            human_mouse(page)

            # Browse 2-3 pages to build session history
            warm_pages = [
                "https://www.citizensbank.com/checking/overview.aspx",
                "https://www.citizensbank.com/savings/overview.aspx",
                "https://www.citizensbank.com/student/overview.aspx",
            ]
            for wp in random.sample(warm_pages, 2):
                try:
                    page.goto(wp, wait_until="domcontentloaded", timeout=12000)
                    human_delay(1.5, 2.5)
                    human_mouse(page)
                except Exception:
                    pass
            print("   ✅ Session warmed up\n")
        except Exception as e:
            print(f"   ⚠️  {e}\n")

        for i, item in enumerate(bad_pdfs, 1):
            raw_url  = item["url"]
            out_path = item["path"]
            rel      = os.path.relpath(out_path, BASE_OUTPUT)
            url      = force_https(raw_url)

            pct = i / len(bad_pdfs) * 100
            print(f"\n[{i:>4}/{len(bad_pdfs)}  {pct:5.1f}%]  {rel}")
            print(f"               🌐 {url}")

            try:
                if os.path.exists(out_path):
                    os.remove(out_path)

                success, landed_url, method = access_url(
                    page, browser, url, i, len(bad_pdfs), manual_mode
                )
                method_stats[method] = method_stats.get(method, 0) + 1

                if not success:
                    print(f"\n               ❌ All methods failed — skip")
                    still_bad.append({**item, "skip_reason": "all_failed"})
                    skipped += 1
                    time.sleep(2)
                    continue

                print(f"\n               ✅ Access OK via '{method}' → {landed_url[-50:]}")

                # Dedup
                text = get_page_text(page)
                if len(text) < 80:
                    print(f"               ⚠️  Too little content — skip")
                    still_bad.append({**item, "skip_reason": "empty"})
                    skipped += 1
                    continue

                h = hashlib.sha256(text.encode()).hexdigest()
                if h in _g_hashes:
                    print(f"               🔁 Duplicate → skip")
                    _g_visited.add(url)
                    json.dump(sorted(_g_visited), open(VISITED_FILE, "w"), indent=2)
                    skipped += 1
                    continue

                # Save PDF
                kb = save_pdf(page, out_path, url)

                if kb < 5:
                    if os.path.exists(out_path):
                        os.remove(out_path)
                    print(f"               ⚠️  PDF too small ({kb:.1f} KB) — skip")
                    still_bad.append({**item, "skip_reason": "tiny_pdf"})
                    skipped += 1
                    continue

                # Verify new PDF is clean
                try:
                    new_text  = " ".join(
                        (pg.extract_text() or "") for pg in PdfReader(out_path).pages
                    ).lower()
                    still_blk = next((ph for ph in BAD_PHRASES if ph in new_text), None)
                    if still_blk:
                        os.remove(out_path)
                        print(f"               ❌ PDF still contains '{still_blk}' — deleted")
                        still_bad.append({**item, "skip_reason": "pdf_blocked"})
                        skipped += 1
                        continue
                except Exception:
                    pass

                # Register
                _g_hashes[h]   = url
                _g_visited.add(force_https(landed_url))
                _g_visited.add(url)
                json.dump(sorted(_g_visited), open(VISITED_FILE, "w"), indent=2)
                json.dump(_g_hashes,          open(HASH_FILE,    "w"), indent=2)

                fixed += 1
                print(f"               📄 Saved {kb:.0f} KB via '{method}'  |  fixed: {fixed}")

            except Exception as e:
                print(f"               ❌ Unexpected: {e}")
                still_bad.append({**item, "skip_reason": str(e)})

            # Human-like gap between pages
            time.sleep(random.uniform(1.5, 3.0))

        browser.close()

    proc.terminate()

    if still_bad:
        json.dump(still_bad, open(STILL_BAD, "w"), indent=2)

    return fixed, skipped, still_bad, method_stats

# ── Main ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 65)
    print("  Citizens Bank — Fix Blocked PDFs  v4")
    print("  Method 1 : Direct HTTPS + stealth")
    print("  Method 2 : Homepage referrer → target")
    print("  Method 3 : Category page → target")
    print("  Method 4 : iPhone user-agent (new context)")
    print("  Method 5 : Wayback Machine archive")
    print("  Method 6 : MANUAL (you navigate in browser window)")
    print("  ✅ playwright-stealth:", "ON" if STEALTH_AVAILABLE else "OFF (pip install playwright-stealth)")
    print("  ✅ Ctrl+C saves progress")
    print("=" * 65 + "\n")

    # Manual mode prompt
    print("  Manual mode = when all 5 auto methods fail, the script")
    print("  pauses and asks YOU to navigate in the Chrome window.\n")
    manual_ans  = input("  Enable manual fallback? [Y/n]: ").strip().lower()
    manual_mode = manual_ans != "n"
    print()

    # Load or scan
    pending = None

    if os.path.exists(BAD_PDF_FILE):
        existing = json.load(open(BAD_PDF_FILE))
        visited  = set(json.load(open(VISITED_FILE)) if os.path.exists(VISITED_FILE) else [])
        pending  = [
            b for b in existing
            if b.get("url")
            and force_https(b["url"]) not in visited
            and os.path.exists(b.get("path", ""))
        ]
        print(f"  bad_pdfs.json → {len(existing)} total, {len(pending)} still pending\n")

        if not pending:
            print("  ✅ All already fixed!")
            ans = input("  Re-scan all PDFs? [y/N]: ").strip().lower()
            pending = scan_pdfs() if ans == "y" else []
        else:
            ans = input(f"  Use existing list ({len(pending)} pending)? [Y/n]: ").strip().lower()
            if ans == "n":
                pending = scan_pdfs()
    else:
        pending = scan_pdfs()

    if not pending:
        print("\n✅ Nothing to fix!"); sys.exit(0)

    print(f"\n  Ready to fix {len(pending)} PDFs.\n")
    go = input("  Start? [y/N]: ").strip().lower()
    if go != "y":
        print("  Cancelled."); sys.exit(0)

    fixed, skipped, still_bad, stats = refetch(pending, manual_mode)

    # Summary
    print(f"\n{'='*65}")
    print(f"  ✅  Fixed        : {fixed}")
    print(f"  ⏭️  Skipped      : {skipped}")
    print(f"\n  Method breakdown:")
    for m, c in stats.items():
        if c:
            print(f"    {m:<22} {c:>4}  {'█' * min(c, 35)}")
    if still_bad:
        reasons = {}
        for b in still_bad:
            r = b.get("skip_reason", "?")
            reasons[r] = reasons.get(r, 0) + 1
        print(f"\n  Skip reasons:")
        for r, c in sorted(reasons.items(), key=lambda x: -x[1]):
            print(f"    {r:<35} {c:>4}")
        print(f"\n  → {STILL_BAD}")
    print(f"{'='*65}\n")