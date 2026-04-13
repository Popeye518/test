import os
import json
import urllib.parse

try:
    import pypdf
    PDF_LIB = "pypdf"
except ImportError:
    try:
        import PyPDF2 as pypdf
        PDF_LIB = "PyPDF2"
    except ImportError:
        pypdf = None
        PDF_LIB = None

BASE_OUTPUT  = r"C:\py\output_pdfs"
VISITED_FILE = r"C:\py\visited_urls.json"
REPORT_FILE  = r"C:\py\verification_report.json"

# Min file size to be considered a real PDF (bytes)
MIN_VALID_SIZE = 50_000   # 50 KB

# Min text characters for a PDF to have real content
MIN_TEXT_CHARS = 200

# Expected category prefixes → folder mapping
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

BLOCKED_PHRASES = [
    "access denied",
    "you don't have permission",
    "reference #",
    "edgesuite.net",
    "403 forbidden",
    "cloudflare",
]

def expected_folder(url):
    path = urllib.parse.urlparse(url).path or "/"
    for prefix, folder in CATEGORY_MAP:
        if path.startswith(prefix):
            return folder.replace("/", os.sep)
    return "misc"

def extract_text(pdf_path):
    if pypdf is None:
        return ""
    try:
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += (page.extract_text() or "")
        return text
    except Exception:
        return ""

def verify_pdf(pdf_path):
    issues = []

    # ── Check 1: File exists
    if not os.path.exists(pdf_path):
        return {"valid": False, "issues": ["File does not exist"]}

    # ── Check 2: File size
    size = os.path.getsize(pdf_path)
    if size < MIN_VALID_SIZE:
        issues.append(f"Too small ({size/1024:.1f} KB < {MIN_VALID_SIZE/1024:.0f} KB threshold)")

    # ── Check 3: Text content & blocked page detection
    text = extract_text(pdf_path)
    text_lower = text.lower()

    if len(text.strip()) < MIN_TEXT_CHARS:
        issues.append(f"Very little text extracted ({len(text.strip())} chars)")

    for phrase in BLOCKED_PHRASES:
        if phrase in text_lower:
            issues.append(f"Blocked/error page detected (contains '{phrase}')")
            break

    return {
        "valid": len(issues) == 0,
        "size_kb": round(size / 1024, 1),
        "text_chars": len(text.strip()),
        "issues": issues
    }

def run_verification():
    print("=" * 65)
    print("  Citizens Bank PDF Verification Report")
    print("=" * 65)

    # Load visited URLs
    visited_urls = []
    if os.path.exists(VISITED_FILE):
        with open(VISITED_FILE) as f:
            visited_urls = json.load(f)
        print(f"\n📋 Visited URLs in skip-list: {len(visited_urls)}")
    else:
        print("\n⚠️  No visited_urls.json found — run crawl_to_pdf.py first")

    # Walk output folder and verify every PDF
    all_pdfs      = []
    valid_pdfs    = []
    invalid_pdfs  = []
    category_summary = {}

    for root, dirs, files in os.walk(BASE_OUTPUT):
        for fname in sorted(files):
            if not fname.endswith(".pdf"):
                continue

            full_path = os.path.join(root, fname)
            rel_path  = os.path.relpath(full_path, BASE_OUTPUT)
            category  = os.path.relpath(root, BASE_OUTPUT)

            result = verify_pdf(full_path)
            result["path"]     = rel_path
            result["category"] = category
            all_pdfs.append(result)

            # Category counter
            if category not in category_summary:
                category_summary[category] = {"valid": 0, "invalid": 0}
            if result["valid"]:
                valid_pdfs.append(rel_path)
                category_summary[category]["valid"] += 1
            else:
                invalid_pdfs.append(result)
                category_summary[category]["invalid"] += 1

    # ── Print results ───────────────────────────────────────────

    print(f"\n{'─'*65}")
    print(f"  TOTAL PDFs FOUND : {len(all_pdfs)}")
    print(f"  ✅ VALID          : {len(valid_pdfs)}")
    print(f"  ❌ INVALID/ISSUES : {len(invalid_pdfs)}")
    print(f"{'─'*65}")

    print("\n📁 CATEGORY BREAKDOWN:")
    print(f"  {'Category':<45} {'Valid':>6} {'Invalid':>8}")
    print(f"  {'─'*45} {'─'*6} {'─'*8}")
    for cat, counts in sorted(category_summary.items()):
        flag = "⚠️ " if counts["invalid"] > 0 else "✅"
        print(f"  {flag} {cat:<43} {counts['valid']:>6} {counts['invalid']:>8}")

    if invalid_pdfs:
        print(f"\n❌ INVALID PDFs (need re-crawl):")
        print(f"  {'File':<55} {'Size KB':>8}  Issues")
        print(f"  {'─'*55} {'─'*8}  {'─'*30}")
        for item in invalid_pdfs:
            issues_str = "; ".join(item["issues"])
            print(f"  {item['path']:<55} {item['size_kb']:>8.1f}  {issues_str}")

    # ── URL skip-list check ──────────────────────────────────────
    print(f"\n🔗 VISITED URL SKIP-LIST ({VISITED_FILE}):")
    if visited_urls:
        print(f"  These {len(visited_urls)} URLs will be SKIPPED on next crawl:")
        for url in sorted(visited_urls):
            print(f"    ✓ {url}")
    else:
        print("  (empty — all URLs will be re-crawled)")

    # ── Save full report ─────────────────────────────────────────
    report = {
        "total":            len(all_pdfs),
        "valid":            len(valid_pdfs),
        "invalid":          len(invalid_pdfs),
        "category_summary": category_summary,
        "valid_pdfs":       valid_pdfs,
        "invalid_pdfs":     invalid_pdfs,
        "visited_urls":     visited_urls,
    }
    with open(REPORT_FILE, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n💾 Full report saved to: {REPORT_FILE}")
    print(f"\n{'='*65}")
    print(f"  Run crawl_to_pdf.py again to re-crawl only invalid pages.")
    print(f"{'='*65}\n")

if __name__ == "__main__":
    run_verification()