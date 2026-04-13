import os, sys, json, time, re, urllib.parse, subprocess, hashlib, signal
from collections import deque
import requests
from bs4 import BeautifulSoup

# ── Must be set BEFORE playwright import ──────────────────────────
_TEMP = os.path.join(os.path.expanduser("~"), "pw_temp")
os.makedirs(_TEMP, exist_ok=True)
os.environ["PLAYWRIGHT_BROWSERS_PATH"]  = os.path.join(os.path.expanduser("~"), "playwright-browsers")
os.environ["PLAYWRIGHT_ARTIFACTS_PATH"] = _TEMP
os.environ["TEMP"] = os.environ["TMP"]  = _TEMP

from playwright.sync_api import sync_playwright

# ── File paths ────────────────────────────────────────────────────
CRAWLED_FILE = r"C:\py\crawled_urls.json"
VISITED_FILE = r"C:\py\visited_urls.json"
HASH_FILE    = r"C:\py\content_hashes.json"
BASE_OUTPUT  = r"C:\py\output_pdfs"
DOMAIN       = "www.citizensbank.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
}

# ── Global state for Ctrl+C safe exit ─────────────────────────────
_g_visited = set()
_g_hashes  = {}
_g_crawled = []

def save_and_exit(sig=None, frame=None):
    print("\n\n⚠️  Ctrl+C detected — saving progress...")
    if _g_visited:
        json.dump(sorted(_g_visited), open(VISITED_FILE, "w"), indent=2)
        print(f"   ✅ Saved {len(_g_visited)} visited URLs → {VISITED_FILE}")
    if _g_hashes:
        json.dump(_g_hashes, open(HASH_FILE, "w"), indent=2)
        print(f"   ✅ Saved {len(_g_hashes)} content hashes → {HASH_FILE}")
    if _g_crawled:
        json.dump(_g_crawled, open(CRAWLED_FILE, "w"), indent=2)
        print(f"   ✅ Saved {len(_g_crawled)} crawled URLs → {CRAWLED_FILE}")
    print("\n▶  Run the script again — it will resume from this exact point.\n")
    sys.exit(0)

signal.signal(signal.SIGINT, save_and_exit)

# ── Category map ──────────────────────────────────────────────────
CATEGORY_MAP = [
    ("/checking",                       "personal/checking_accounts"),
    ("/savings",                        "personal/savings_accounts"),
    ("/credit-cards",                   "personal/credit_cards"),
    ("/home-loans",                     "personal/home_loans"),
    ("/mortgage",                       "personal/home_loans"),
    ("/auto-loans",                     "personal/auto_loans"),
    ("/personal-loans",                 "personal/personal_loans"),
    ("/investing",                      "personal/investing"),
    ("/insurance",                      "personal/insurance"),
    ("/financial-education",            "personal/financial_education"),
    ("/learning",                       "personal/learning"),
    ("/personal",                       "personal/overview"),
    ("/student",                        "student"),
    ("/small-business/loans",           "business/loans"),
    ("/small-business/insights",        "business/insights"),
    ("/small-business",                 "business/overview"),
    ("/corporate-finance/capability",   "corporate/capabilities"),
    ("/corporate-finance/industries",   "corporate/industries"),
    ("/corporate-finance/insights",     "corporate/insights"),
    ("/corporate-finance",              "corporate/overview"),
    ("/private-banking/insights",       "private_bank/insights"),
    ("/private-banking/locations",      "private_bank/locations"),
    ("/private-banking",                "private_bank/overview"),
    ("/about-us/community",             "about_us/community"),
    ("/about-us/newsroom",              "about_us/newsroom"),
    ("/about-us",                       "about_us/overview"),
    ("/customer-service/faqs",          "support/faqs"),
    ("/customer-service",               "support/customer_service"),
    ("/mobile-and-online-banking",      "support/online_mobile_banking"),
    ("/wealth-management",              "personal/wealth_management"),
]

SKIP_PATTERNS = [
    "/login", "/logout", "/sign-in", "/sign-up", "/register",
    "/sitemap", "/search", "/404", "/error", "/_layouts",
    "/cdn-cgi", "/api/", "privacy-policy", "terms-of-use",
    "terms-and-conditions", "accessibility", "/disclosures",
    "/legal", "/locate-us", "/find-a-branch", "/homepage.aspx",
]

START_URLS = [
    # Personal
    "https://www.citizensbank.com/checking/overview.aspx",
    "https://www.citizensbank.com/savings/overview.aspx",
    "https://www.citizensbank.com/credit-cards/overview.aspx",
    "https://www.citizensbank.com/home-loans/overview.aspx",
    "https://www.citizensbank.com/student-loans/overview.aspx",
    "https://www.citizensbank.com/investing/overview.aspx",
    "https://www.citizensbank.com/insurance/overview.aspx",
    "https://www.citizensbank.com/personal-loans/overview.aspx",
    "https://www.citizensbank.com/auto-loans/overview.aspx",
    "https://www.citizensbank.com/wealth-management/overview.aspx",
    "https://www.citizensbank.com/learning/managing-your-finances.aspx",
    "https://www.citizensbank.com/learning/bank-glossary.aspx",
    "https://www.citizensbank.com/financial-education/overview.aspx",
    # Student
    "https://www.citizensbank.com/student/overview.aspx",
    "https://www.citizensbank.com/student/planning-tools.aspx",
    "https://www.citizensbank.com/student/scholarships.aspx",
    "https://www.citizensbank.com/student/products.aspx",
    # Business
    "https://www.citizensbank.com/small-business/overview.aspx",
    "https://www.citizensbank.com/small-business/business-credit-card-administrator-guide.aspx",
    "https://www.citizensbank.com/small-business/loans/overview.aspx",
    "https://www.citizensbank.com/small-business/insights/overview.aspx",
    # Corporate
    "https://www.citizensbank.com/corporate-finance/overview.aspx",
    "https://www.citizensbank.com/corporate-finance/insights.aspx",
    "https://www.citizensbank.com/corporate-finance/capability/financing/overview.aspx",
    "https://www.citizensbank.com/corporate-finance/industries/industrials.aspx",
    # Private Bank
    "https://www.citizensbank.com/private-banking/overview.aspx",
    "https://www.citizensbank.com/private-banking/insights/overview.aspx",
    "https://www.citizensbank.com/private-banking/locations/overview.aspx",
    # About Us
    "https://www.citizensbank.com/about-us/overview.aspx",
    "https://www.citizensbank.com/about-us/community/financial-literacy.aspx",
    # Support
    "https://www.citizensbank.com/customer-service/faqs/overview.aspx",
    "https://www.citizensbank.com/mobile-and-online-banking/overview.aspx",
    "https://www.citizensbank.com/mobile-and-online-banking/resources.aspx",
]

CLEANUP_CSS = """
    header, nav, footer, .nav, .cookie-banner, .modal, .overlay,
    [class*="cookie"], [class*="modal"], [class*="banner"], [class*="chat"],
    .grecaptcha-badge, #onetrust-banner-sdk, .sticky-header,
    .back-to-top, .breadcrumbs { display: none !important; }
    body { background: #fff !important; }
    .accordion-content, [aria-hidden="true"], [hidden], details > * {
        display: block !important; visibility: visible !important;
        height: auto !important; max-height: none !important; overflow: visible !important;
    }
    body, p, li, td { font-size: 14px !important; line-height: 1.6 !important; }
    h1 { font-size: 24px !important; color: #003366 !important; }
    h2 { font-size: 18px !important; color: #003366 !important; }
"""

# ── Helpers ───────────────────────────────────────────────────────

def norm(url):
    url = url.strip().replace("http://", "https://")
    p = urllib.parse.urlparse(url)
    return p._replace(query="", fragment="").geturl().rstrip("/")

def should_skip(url):
    path = urllib.parse.urlparse(url).path.lower()
    return any(pat in path for pat in SKIP_PATTERNS)

def is_allowed(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.hostname != DOMAIN:
        return False
    if should_skip(url):
        return False
    path = parsed.path.lower()
    ext  = path.split("/")[-1]
    if "." in ext and not path.endswith(".aspx"):
        return False
    return True

def get_output_path(url):
    path = urllib.parse.urlparse(url).path or "/"
    folder = "misc"
    for prefix, category in CATEGORY_MAP:
        if path.lower().startswith(prefix):
            folder = category
            break
    out_dir = os.path.join(BASE_OUTPUT, folder)
    os.makedirs(out_dir, exist_ok=True)
    slug = path.strip("/").replace("/", "__")
    slug = re.sub(r"[^A-Za-z0-9_\-]+", "_", slug).strip("_") or "index"
    slug = re.sub(r"\.aspx$", "", slug, flags=re.IGNORECASE)
    return os.path.join(out_dir, slug + ".pdf")

def pdf_exists(url):
    return os.path.exists(get_output_path(url))

# ── HTTPS → HTTP fallback navigation ─────────────────────────────

def safe_goto(page, url):
    """Try HTTPS first. If 403/blocked, retry with HTTP."""
    variants = [
        url.replace("http://", "https://"),
        url.replace("https://", "http://"),
    ]
    for try_url in variants:
        try:
            status = [200]
            def on_r(r):
                clean = r.url.split("?")[0].rstrip("/")
                if clean == try_url.rstrip("/"):
                    status[0] = r.status
            page.on("response", on_r)
            page.goto(try_url, wait_until="networkidle", timeout=30000)
            page.remove_listener("response", on_r)
            if status[0] not in (403, 503):
                return try_url, status[0]
            print(f"\n               ↳ HTTP {status[0]} on {try_url[-45:]} — trying fallback...")
        except Exception as e:
            print(f"\n               ↳ failed ({e}) — trying fallback...")
    return variants[0], 403

# ── CRAWL PHASE ───────────────────────────────────────────────────

def crawl_all_urls(start_urls, old_crawled):
    """BFS across entire citizensbank.com. Shows real-time progress."""
    # ✅ seen only prevents crawling same URL twice THIS session
    # does NOT pre-fill with visited (that was the original bug)
    queue  = deque(norm(u) for u in start_urls)
    seen   = set()
    found  = []
    errors = 0

    print("🔍 CRAWL PHASE — discovering all pages")
    print("   Ctrl+C at any time to save and resume later\n")

    while queue:
        url = queue.popleft()
        url = norm(url)

        if url in seen:
            continue
        if not is_allowed(url):
            seen.add(url)
            continue
        seen.add(url)

        # Real-time display — overwrites same line
        display = url[len("https://www.citizensbank.com"):][:65]
        print(
            f"   🔍 found:{len(found):>4}  queue:{len(queue):>5}  {display:<65}",
            end="\r", flush=True
        )

        try:
            resp = requests.get(url, headers=HEADERS, timeout=12)

            # ✅ HTTP fallback if HTTPS gives 403
            if resp.status_code == 403:
                http_url = url.replace("https://", "http://")
                try:
                    resp = requests.get(http_url, headers=HEADERS, timeout=12)
                    if resp.status_code == 200:
                        url = http_url
                except Exception:
                    pass

            if resp.status_code in (301, 302, 404, 410):
                continue
            if resp.status_code != 200:
                errors += 1
                continue
            if "text/html" not in resp.headers.get("Content-Type", ""):
                continue

            found.append(url)

            # Print newline every 100 so you can scroll back
            if len(found) % 100 == 0:
                print(f"\n   ✔  {len(found)} pages found  |  queue: {len(queue)}  |  errors: {errors}")

            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                if any(href.startswith(x) for x in ["#","mailto:","tel:","javascript:"]):
                    continue
                full = norm(urllib.parse.urljoin(url, href))
                if full not in seen and is_allowed(full):
                    queue.append(full)

            time.sleep(0.1)

        except Exception:
            errors += 1

    print(f"\n\n   ✅ Crawl complete: {len(found)} pages  |  errors: {errors}\n")
    return found

# ── PDF PHASE ─────────────────────────────────────────────────────

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]

def render_pdfs(to_fetch, visited, content_hashes):
    global _g_visited, _g_hashes

    exe = next((p for p in CHROME_PATHS if os.path.exists(p)), None)
    if not exe:
        print("❌ Chrome/Edge not found!"); sys.exit(1)

    print(f"✅ Browser : {os.path.basename(exe)}")
    DEBUG_PORT    = 9222
    DEBUG_PROFILE = r"C:\py\chrome-debug-profile"
    os.makedirs(DEBUG_PROFILE, exist_ok=True)

    print("🚀 Launching browser (do not close the window)...")
    proc = subprocess.Popen([
        exe,
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={DEBUG_PROFILE}",
        "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--start-maximized",
        "--disable-blink-features=AutomationControlled",
    ])
    time.sleep(4)
    print("   ✅ Browser ready\n")

    saved  = 0
    dupes  = 0
    failed = []

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(f"http://localhost:{DEBUG_PORT}")
        context = browser.contexts[0] if browser.contexts else browser.new_context()
        page    = context.pages[0]    if context.pages    else context.new_page()

        context.add_init_script("""
            Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
            Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3]});
            Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
            window.chrome={runtime:{},loadTimes:()=>{},csi:()=>{}};
        """)

        # Block trackers — speed up page loads
        try:
            context.route(
                re.compile(r".*(google-analytics|googletagmanager|doubleclick|hotjar|segment).*"),
                lambda route: route.abort()
            )
        except Exception:
            pass

        print("🍪 Loading session cookies...")
        try:
            page.goto("https://www.citizensbank.com/", wait_until="networkidle", timeout=20000)
            time.sleep(2)
            print("   ✅ Cookies ready\n")
        except Exception as e:
            print(f"   ⚠️  {e}\n")

        for i, url in enumerate(to_fetch, 1):
            out_path = get_output_path(url)
            rel      = os.path.relpath(out_path, BASE_OUTPUT)

            # ── Real-time status line ─────────────────────────────
            pct = i / len(to_fetch) * 100
            print(f"\n[{i:>5}/{len(to_fetch)}  {pct:5.1f}%]  📄 {rel}")
            print(f"               🌐 {url}")

            try:
                actual_url, status = safe_goto(page, url)

                if status == 404:
                    print(f"               ⚠️  404 — page not found, skipping")
                    failed.append(url)
                    continue

                time.sleep(1.5)

                # ── Duplicate detection via text hash ─────────────
                try:
                    text = page.evaluate("""() => {
                        const el = document.querySelector('main,article,.content,body');
                        return (el||document.body).innerText
                            .replace(/\\s+/g,' ').trim().toLowerCase();
                    }""")

                    if len(text) < 80:
                        print(f"               ⚠️  Too little content — skip")
                        failed.append(url)
                        continue

                    h = hashlib.sha256(text.encode()).hexdigest()
                    if h in content_hashes:
                        print(f"               🔁 Duplicate of: {content_hashes[h][-50:]}")
                        visited.add(url)
                        _g_visited = visited
                        json.dump(sorted(visited), open(VISITED_FILE,"w"), indent=2)
                        dupes += 1
                        continue
                except Exception:
                    h = None

                # ── Scroll to trigger lazy loading ────────────────
                ht = page.evaluate("document.body.scrollHeight")
                for pos in [ht//4, ht//2, 3*ht//4, ht, 0]:
                    page.evaluate(f"window.scrollTo(0,{pos})")
                    time.sleep(0.06)

                # ── Expand collapsed sections ─────────────────────
                page.evaluate("""() => {
                    document.querySelectorAll('[aria-expanded="false"]')
                        .forEach(el => { try{el.click()}catch(e){} });
                    document.querySelectorAll('details:not([open]) summary')
                        .forEach(el => { try{el.click()}catch(e){} });
                }""")
                time.sleep(0.4)

                page.add_style_tag(content=CLEANUP_CSS)
                time.sleep(0.2)

                page.pdf(
                    path=out_path,
                    format="A4",
                    print_background=True,
                    scale=0.85,
                    margin={"top":"15mm","bottom":"15mm","left":"12mm","right":"12mm"},
                    display_header_footer=True,
                    header_template=(
                        '<div style="font-size:8px;color:#666;width:100%;padding:0 12mm;'
                        'display:flex;justify-content:space-between;">'
                        '<span style="color:#003366;font-weight:bold;">Citizens Bank</span>'
                        f'<span style="font-size:7px;color:#999">{actual_url}</span></div>'
                    ),
                    footer_template=(
                        '<div style="font-size:8px;color:#999;width:100%;padding:0 12mm;'
                        'display:flex;justify-content:space-between;">'
                        '<span>Citizens Bank Knowledge Base</span>'
                        '<span>Page <span class="pageNumber"></span>'
                        ' of <span class="totalPages"></span></span></div>'
                    ),
                )

                kb = os.path.getsize(out_path) / 1024
                if kb < 5:
                    os.remove(out_path)
                    print(f"               ⚠️  PDF too small ({kb:.1f} KB) — skip")
                    failed.append(url)
                    continue

                # Register hash
                if h:
                    content_hashes[h] = actual_url
                    _g_hashes = content_hashes
                    json.dump(content_hashes, open(HASH_FILE,"w"), indent=2)

                visited.add(actual_url)
                if url != actual_url:
                    visited.add(url)
                _g_visited = visited
                json.dump(sorted(visited), open(VISITED_FILE,"w"), indent=2)
                saved += 1
                print(f"               ✅ Saved  {kb:.0f} KB"
                      f"  |  total: {len(visited)}  |  new: {saved}")

            except Exception as e:
                print(f"               ❌ {e}")
                failed.append(url)

            time.sleep(1.5)

        browser.close()

    proc.terminate()
    return saved, dupes, failed

# ── MAIN ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    # global _g_visited, _g_hashes, _g_crawled

    print("=" * 65)
    print("  Citizens Bank — Full Site Crawler & PDF Generator")
    print("  Personal · Student · Business · Corporate")
    print("  Private Bank · About Us · Support")
    print("  ✅ Ctrl+C safe  ✅ HTTPS→HTTP fallback  ✅ Resume support")
    print("=" * 65 + "\n")

    # Load existing state
    visited        = set(json.load(open(VISITED_FILE)) if os.path.exists(VISITED_FILE) else [])
    content_hashes = json.load(open(HASH_FILE))         if os.path.exists(HASH_FILE)    else {}
    old_crawled    = set(json.load(open(CRAWLED_FILE))  if os.path.exists(CRAWLED_FILE) else [])

    _g_visited = visited
    _g_hashes  = content_hashes

    print(f"  PDFs already done : {len(visited)}")
    print(f"  Content hashes    : {len(content_hashes)}")
    print(f"  Prev crawled URLs : {len(old_crawled)}\n")

    # ── CRAWL ─────────────────────────────────────────────────────
    fresh = crawl_all_urls(START_URLS, old_crawled)

    all_urls  = sorted(set(fresh) | old_crawled)
    _g_crawled = all_urls
    json.dump(all_urls, open(CRAWLED_FILE,"w"), indent=2)

    to_fetch = [u for u in all_urls if u not in visited and not pdf_exists(u)]

    print(f"  Total URLs found  : {len(all_urls)}")
    print(f"  Already have PDF  : {len(visited)}")
    print(f"  New to generate   : {len(to_fetch)}\n")

    if not to_fetch:
        print("✅ All pages already have PDFs!")

        # Print folder summary anyway
        print("\n  Output structure:")
        for root, dirs, files in os.walk(BASE_OUTPUT):
            pdfs = [f for f in files if f.endswith(".pdf")]
            if pdfs:
                rel = os.path.relpath(root, BASE_OUTPUT)
                print(f"    {rel}/  → {len(pdfs)} PDFs")
        sys.exit(0)

    # ── PDF GENERATION ────────────────────────────────────────────
    print("─" * 65)
    print("  PDF PHASE — generating PDFs via real Chrome")
    print("  Ctrl+C at any time — progress is saved after every PDF")
    print("─" * 65 + "\n")

    saved, dupes, failed = render_pdfs(to_fetch, visited, content_hashes)

    # ── SUMMARY ───────────────────────────────────────────────────
    print(f"\n{'='*65}")
    print(f"  ✅  New PDFs saved  : {saved}")
    print(f"  🔁  Duplicates skip : {dupes}")
    print(f"  ⚠️  Failed          : {len(failed)}")
    print(f"  📋  Total PDFs now  : {len(visited)}")
    if failed:
        json.dump(failed, open(r"C:\py\still_failed.json","w"), indent=2)
        print(f"  Failed list       : C:\\py\\still_failed.json")
    print()
    print("  Output structure:")
    for root, dirs, files in os.walk(BASE_OUTPUT):
        pdfs = [f for f in files if f.endswith(".pdf")]
        if pdfs:
            rel = os.path.relpath(root, BASE_OUTPUT)
            print(f"    {rel}/  → {len(pdfs)} PDFs")
    print(f"{'='*65}")