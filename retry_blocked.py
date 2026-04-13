import json, os, time, re, urllib.parse

_TEMP = r"C:\py\temp"
os.makedirs(_TEMP, exist_ok=True)
os.environ["PLAYWRIGHT_BROWSERS_PATH"]  = r"C:\Users\devan\playwright-browsers"
os.environ["PLAYWRIGHT_ARTIFACTS_PATH"] = _TEMP

from playwright.sync_api import sync_playwright

crawled = json.load(open("C:/py/crawled_urls.json"))
visited = set(json.load(open("C:/py/visited_urls.json")))
blocked = [u for u in crawled if u not in visited]

print(f"Total crawled  : {len(crawled)}")
print(f"PDFs saved     : {len(visited)}")
print(f"Pending/failed : {len(blocked)}")
print()

if not blocked:
    print("Nothing to retry — all done!")
    exit()

CATEGORY_MAP = [
    ("/corporate-finance/capability",  "corporate_finance/capabilities"),
    ("/corporate-finance/industries",  "corporate_finance/industries"),
    ("/corporate-finance/insights",    "corporate_finance/insights"),
    ("/corporate-finance",             "corporate_finance/overview"),
    ("/learning",                      "knowledge_articles/learning"),
    ("/mobile-and-online-banking",     "knowledge_articles/online_mobile_banking"),
    ("/customer-service/faqs",         "knowledge_articles/faqs"),
    ("/small-business",                "small_business/guides"),
]

CLEANUP_CSS = """
    header, nav, .nav, .navbar, .navigation,
    .cookie-banner, .cookie-notice, .consent-banner,
    .modal, .overlay, .popup, .alert-bar,
    [class*="sticky"], footer, .footer, .site-footer,
    .breadcrumb, .skip-to-content,
    [class*="cookie"], [id*="cookie"],
    [class*="modal"], [id*="modal"],
    [class*="banner"], [class*="notification"],
    [class*="chat"], [id*="chat"],
    .recaptcha-container, #recaptcha,
    .grecaptcha-badge { display: none !important; }
    body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    img  { max-width: 100% !important; height: auto !important; display: block !important; }
    main, .main, .content, article, .page-content, section {
        position: relative !important; display: block !important;
        visibility: visible !important; opacity: 1 !important; overflow: visible !important;
    }
    .accordion-content, .accordion-body, .collapse,
    [class*="accordion"], [class*="collapse"], [class*="expand"],
    [aria-hidden="true"], [hidden], details > *, .panel-content {
        display: block !important; visibility: visible !important;
        opacity: 1 !important; height: auto !important;
        max-height: none !important; overflow: visible !important;
    }
    body, p, li, td, th { font-size: 14px !important; line-height: 1.6 !important; color: #1a1a1a !important; }
    h1 { font-size: 26px !important; color: #003366 !important; }
    h2 { font-size: 20px !important; color: #003366 !important; }
    h3 { font-size: 16px !important; color: #003366 !important; }
"""

def get_output_path(url):
    path = urllib.parse.urlparse(url).path or "/"
    folder = "misc"
    for prefix, category in CATEGORY_MAP:
        if path.startswith(prefix):
            folder = category
            break
    out_dir = os.path.join(r"C:\py\output_pdfs", folder)
    os.makedirs(out_dir, exist_ok=True)
    slug = path.strip("/").replace("/", "__")
    slug = re.sub(r"[^A-Za-z0-9_\-]+", "_", slug).strip("_") or "index"
    slug = re.sub(r"\.aspx$", "", slug, flags=re.IGNORECASE)
    return os.path.join(out_dir, slug + ".pdf")

print(f"Retrying {len(blocked)} pending pages...\n")

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=False,   # Visible browser — harder to detect
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--start-maximized",
            "--disable-extensions",
            "--disable-dev-shm-usage",
        ]
    )

    context = browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1440, "height": 900},
        locale="en-US",
        timezone_id="America/New_York",
        java_script_enabled=True,
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
    )

    # ✅ Remove all automation signals
    context.add_init_script("""
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

        // Fake plugins (real Chrome has plugins)
        Object.defineProperty(navigator, 'plugins', { get: () => [
            { name: 'Chrome PDF Plugin' },
            { name: 'Chrome PDF Viewer' },
            { name: 'Native Client' }
        ]});

        // Fake languages
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

        // Fake chrome runtime
        window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){} };

        // Remove automation-related properties
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) =>
            parameters.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(parameters);
    """)

    # Block trackers only — allow all citizensbank.com assets
    context.route(
        re.compile(r".*(google-analytics|googletagmanager|doubleclick|"
                   r"hotjar|optimizely|segment|mixpanel|amplitude).*"),
        lambda route: route.abort()
    )

    page = context.new_page()

    # ── Visit homepage first to get cookies like a real user ──────
    print("🍪 Getting site cookies first (like a real browser)...")
    try:
        page.goto("https://www.citizensbank.com/", wait_until="networkidle", timeout=20000)
        time.sleep(2)
        print("   ✅ Cookies loaded\n")
    except Exception as e:
        print(f"   ⚠️  Homepage load failed: {e}\n")

    saved  = 0
    failed = []

    for i, url in enumerate(blocked, 1):
        out_path = get_output_path(url)
        rel      = os.path.relpath(out_path, r"C:\py\output_pdfs")
        print(f"[{i:>4}/{len(blocked)}]  {rel}")
        print(f"            URL: {url}")

        try:
            # ✅ Capture HTTP status via response event — real block = 403/404
            http_status = [200]

            def handle_response(response):
                if response.url == url or response.url == url + "/":
                    http_status[0] = response.status

            page.on("response", handle_response)

            page.goto(url, wait_until="networkidle", timeout=30000)

            page.remove_listener("response", handle_response)

            # ✅ Only skip if HTTP status is actually 403/404/503
            if http_status[0] in (403, 404, 503):
                print(f"            ⚠️  HTTP {http_status[0]} — truly blocked, skipping")
                failed.append(url)
                time.sleep(2)
                continue

            # Let JS render fully
            time.sleep(1.5)

            # Scroll to trigger lazy loading
            h = page.evaluate("document.body.scrollHeight")
            for pos in [h//4, h//2, 3*h//4, h, 0]:
                page.evaluate(f"window.scrollTo(0, {pos})")
                time.sleep(0.1)

            # Expand any collapsed sections
            page.evaluate("""
                () => {
                    document.querySelectorAll('[aria-expanded="false"]').forEach(el => {
                        try { el.click(); } catch(e) {}
                    });
                    document.querySelectorAll('details:not([open]) summary').forEach(el => {
                        try { el.click(); } catch(e) {}
                    });
                }
            """)
            time.sleep(0.5)

            # Apply CSS cleanup
            page.add_style_tag(content=CLEANUP_CSS)
            time.sleep(0.3)

            page.pdf(
                path=out_path,
                format="A4",
                print_background=True,
                scale=0.85,
                margin={"top": "15mm", "bottom": "15mm",
                        "left": "12mm", "right": "12mm"},
                display_header_footer=True,
                header_template=f"""
                    <div style="font-size:9px;color:#666;width:100%;padding:0 12mm;
                                display:flex;justify-content:space-between;">
                        <span style="color:#003366;font-weight:bold;">Citizens Bank</span>
                        <span style="font-size:7px;color:#999;">{url}</span>
                    </div>""",
                footer_template="""
                    <div style="font-size:8px;color:#999;width:100%;padding:0 12mm;
                                display:flex;justify-content:space-between;">
                        <span>Citizens Bank — Knowledge Base</span>
                        <span>Page <span class="pageNumber"></span>
                              of <span class="totalPages"></span></span>
                    </div>""",
            )

            size_kb = os.path.getsize(out_path) / 1024
            if size_kb < 5:
                os.remove(out_path)
                print(f"            ⚠️  PDF too small ({size_kb:.1f} KB) — skipping")
                failed.append(url)
                continue

            visited.add(url)
            # ✅ Save after every PDF — Ctrl+C safe
            json.dump(sorted(visited), open("C:/py/visited_urls.json", "w"), indent=2)
            saved += 1
            print(f"            ✅ {size_kb:.0f} KB saved")

        except Exception as e:
            print(f"            ❌ {e}")
            failed.append(url)

        # Polite delay between pages — avoids rate limiting
        time.sleep(2)

    browser.close()

# ── Summary ───────────────────────────────────────────────────────
print(f"\n{'='*55}")
print(f"✅ Retry complete!")
print(f"   Newly saved : {saved} PDFs")
print(f"   Still failed: {len(failed)}")
print(f"   Total PDFs  : {len(visited)}")

if failed:
    fail_file = r"C:\py\still_failed.json"
    json.dump(failed, open(fail_file, "w"), indent=2)
    print(f"\n⚠️  {len(failed)} URLs still failing — saved to:")
    print(f"   {fail_file}")
    for u in failed[:10]:
        print(f"   {u}")
    if len(failed) > 10:
        print(f"   ... and {len(failed)-10} more")
print(f"{'='*55}")
