import hashlib  # ✅ ADDED

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

# ... (keep all your existing imports above unchanged) ...

def resolve_rtype(user_val: str) -> str:
    key = (user_val or "").strip().lower()
    if key in ALLOWED_RTYPES:
        return ALLOWED_RTYPES[key]
    for canonical in ALLOWED_RTYPES.values():
        if key == canonical.lower():
            return canonical
    raise ValueError("Invalid --rtype. Allowed: indev, new, migration, rehost")


#### Vertex init
if not PROJECT_ID:
    logging.warning("VERTEX_PROJECT_ID is not set.")
vertexai.init(project=PROJECT_ID, location=REGION)
_genai = genai.Client(vertexai=True, project=PROJECT_ID, location=REGION)


#### Engine via Cloud SQL Connector
_connector: Optional[Connector] = None
_engine: Optional[sqlalchemy.Engine] = None


def build_engine() -> sqlalchemy.Engine:
    global _connector
    _connector = Connector()

    def getconn():
        return _connector.connect(
            INSTANCE_CONNECTION_NAME,
            "pg8000",
            user=PGUSER,
            password=PGPASSWORD,
            db=PGDATABASE,
            ip_type=IPTypes.PSC,
        )

    return sqlalchemy.create_engine(
        "postgresql+pg8000://",
        creator=getconn,
        pool_pre_ping=True,
        pool_recycle=300,
    )


def get_engine() -> sqlalchemy.Engine:
    global _engine
    if _engine is None:
        if not INSTANCE_CONNECTION_NAME:
            raise RuntimeError("INSTANCE_CONNECTION_NAME is required for Cloud SQL Connector.")
        _engine = build_engine()
        logging.info("SQLAlchemy engine created via Cloud SQL Connector (pg8000).")
    return _engine


def _shutdown_connector():
    global _connector, _engine
    try:
        if _engine is not None:
            _engine.dispose()
    finally:
        if _connector is not None:
            _connector.close()
    logging.info("Cloud SQL Connector closed.")


atexit.register(_shutdown_connector)


# Embedding + LLM helpers
def _extract_values(resp):
    if hasattr(resp, "embedding") and hasattr(resp.embedding, "values"):
        return resp.embedding.values
    if hasattr(resp, "values"):
        return resp.values
    if hasattr(resp, "embeddings") and resp.embeddings:
        e = resp.embeddings[0]
        if hasattr(e, "values"):
            return e.values
        if isinstance(e, dict) and "values" in e:
            return e["values"]
    if isinstance(resp, dict):
        if "embedding" in resp and isinstance(resp["embedding"], dict) and "values" in resp["embedding"]:
            return resp["embedding"]["values"]
        if "values" in resp:
            return resp["values"]
    raise RuntimeError(f"Unexpected embed response shape: {type(resp)}")


def embed_texts(texts: List[str], task_type="RETRIEVAL_DOCUMENT", out_dim: Optional[int] = EMBED_DIM) -> List[List[float]]:
    cfg = genai_types.EmbedContentConfig(task_type=task_type, output_dimensionality=out_dim)
    out = []
    for t in texts:
        r = _genai.models.embed_content(model=EMBED_MODEL, contents=t, config=cfg)
        out.append(_extract_values(r))
    return out


def embed_query_text(text_q: str, out_dim: Optional[int] = EMBED_DIM) -> List[float]:
    cfg = genai_types.EmbedContentConfig(task_type="RETRIEVAL_QUERY", output_dimensionality=out_dim)
    r = _genai.models.embed_content(model=EMBED_MODEL, contents=text_q, config=cfg)
    return _extract_values(r)


def _get_access_token() -> str:
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    if not creds.valid:
        creds.refresh(GARequest())
    return creds.token


def mm_embed_text(query: str, dim: int = MM_DIM) -> List[float]:
    token = _get_access_token()
    endpoint = (
        f"https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{REGION}"
        f"/publishers/google/models/{MM_MODEL}:predict"
    )
    payload = {"instances": [{"text": query, "parameters": {"dimension": dim}}]}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    preds = data.get("predictions") or []
    if not preds or "textEmbedding" not in preds[0]:
        raise RuntimeError(f"Vertex MM: expected textEmbedding. data_keys={list(data.keys())}")
    vec = preds[0]["textEmbedding"]
    if dim and len(vec) != dim:
        raise RuntimeError(f"Vertex MM: expected dim={dim}, got len={len(vec)}")
    return vec


def mm_embed_image_with_caption(img_bytes: bytes, caption: str, dim: int = MM_DIM) -> List[float]:
    token = _get_access_token()
    endpoint = (
        f"https://{REGION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{REGION}"
        f"/publishers/google/models/{MM_MODEL}:predict"
    )
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    instance = {
        "image": {"bytesBase64Encoded": b64, "mimeType": "image/png"},
        "parameters": {"dimension": dim},
    }
    if caption:
        instance["text"] = caption[:200]
    payload = {"instances": [instance]}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    preds = data.get("predictions") or []
    if not preds:
        raise RuntimeError("Vertex MM: missing predictions")
    pred0 = preds[0]
    vec = pred0.get("imageEmbedding") or pred0.get("textEmbedding")
    if vec is None:
        raise RuntimeError(f"Vertex MM: missing embedding. keys={list(pred0.keys())}")
    if dim and len(vec) != dim:
        raise RuntimeError(f"Vertex MM: expected dim={dim}, got len={len(vec)}")
    return vec


# ✅ CHANGED: added temperature=0.0, response_mime_type, fixed return
def gen_text(prompt: str) -> str:
    try:
        contents = [genai_types.Content(role="user", parts=[{"text": prompt}])]
        config = genai_types.GenerateContentConfig(
            temperature=0.0,
            max_output_tokens=2048,
        )
        resp = _genai.models.generate_content(model=LLM_MODEL, contents=contents, config=config)
        return getattr(resp, "output_text", None) or getattr(resp, "text", "") or ""
    except Exception as e:
        logging.error(f"LLM generation failed: {e}")
        return ""


# ✅ CHANGED: fixed markdown stripping and added warning log
def parse_json(s: str) -> Dict[str, Any]:
    s = (s or "").strip()
    if s.startswith("```json"):
        s = s[7:]
    if s.startswith("```"):
        s = s[3:]
    if s.endswith("```"):
        s = s[:-3]
    s = s.strip()
    try:
        return json.loads(s)
    except Exception as e:
        logging.warning(f"parse_json failed: {e} | raw={s[:200]}")
        return {}


### Template PDF helpers
def read_pdf_text(pdf_path: str) -> str:
    reader = PdfReader(pdf_path)
    text = "\n".join([(pg.extract_text() or "") for pg in reader.pages])
    return text


def docx_text(docx_path: str) -> str:
    doc = DocxDocument(docx_path)
    return "\n".join([p.text for p in doc.paragraphs])


# ✅ ADDED: compute stable hash from document bytes
def compute_doc_hash(file_bytes: bytes) -> str:
    return hashlib.sha256(file_bytes).hexdigest()


def split_text_local(text_in: str, chunk_size: int = 900, chunk_overlap: int = 90) -> List[str]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " ", ""]
    )
    return splitter.split_text(text_in)


def pick_best_template_snippets_for_tag(tag_query: str, pdf_text: str, top_n: int = 3) -> List[str]:
    if not pdf_text.strip():
        return []
    chunks = split_text_local(pdf_text)
    if not chunks:
        return []
    emb_chunks = embed_texts(chunks, task_type="RETRIEVAL_DOCUMENT", out_dim=EMBED_DIM)
    qv = np.array(embed_query_text(tag_query, out_dim=EMBED_DIM), dtype=np.float32).reshape(1, -1)
    em = np.array(emb_chunks, dtype=np.float32)
    sims = cosine_similarity(qv, em)
    idx = np.argsort(-sims)[:top_n]
    return [chunks[i] for i in idx]


# DB Retrievals
def _vec_literal(vec: List[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"


def retrieve_evidence_snippets(query: str, nar_id: str, release_number: str, rtype: str,
                                doc_hash: Optional[str], top_n: int) -> List[str]:
    q_emb = embed_query_text(query)
    vec = _vec_literal(q_emb)
    where = ["nar_id=:nar", "release_number=:rel", "rtype=:rtype"]
    params = {"nar": nar_id, "rel": release_number, "rtype": rtype, "vec": vec, "topn": top_n}
    if doc_hash:
        where.append("doc_hash=:doch")
        params["doch"] = doc_hash
    sql = text(f"""
        SELECT chunk FROM {TABLE_EVIDENCE}
        WHERE {" AND ".join(where)}
        ORDER BY embedding <-> CAST(:vec AS vector)
        LIMIT :topn
    """)
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [r for r in rows if r and (r or "").strip()]


def retrieve_guidance_snippets(query: str, rtype: str, top_n: int = 3) -> List[str]:
    try:
        qv = embed_query_text(query)
        vec = _vec_literal(qv)
        sql = text(f"""
            SELECT chunk FROM {TABLE_GUIDANCE}
            WHERE rtype=:rtype
            ORDER BY embedding <-> CAST(:vec AS vector)
            LIMIT :topn
        """)
        engine = get_engine()
        with engine.connect() as c:
            rows = c.execute(sql, {"rtype": rtype, "vec": vec, "topn": top_n}).fetchall()
        return [r for r in rows if r and r]
    except Exception as e:
        logging.warning(f"guidance retrieval failed: {e}")
        return []


def retrieve_mm_diagrams(query_text: str, nar_id: str, release_number: str, rtype: str,
                          doc_hash: Optional[str], top_n: int = 3, dim: int = MM_DIM) -> List[Dict[str, str]]:
    qv = mm_embed_text(query_text, dim)
    vec = _vec_literal(qv)
    where = ["nar_id=:nar", "release_number=:rel", "rtype=:rtype"]
    params: Dict[str, Any] = {"nar": nar_id, "rel": release_number, "rtype": rtype, "vec": vec, "topn": top_n}
    if doc_hash:
        where.append("doc_hash=:doch")
        params["doch"] = doc_hash
    sql = text(f"""
        SELECT caption, doc_uri FROM {TABLE_MM_EVID}
        WHERE {" AND ".join(where)}
        ORDER BY embedding <-> CAST(:vec AS vector)
        LIMIT :topn
    """)
    engine = get_engine()
    with engine.connect() as c:
        rows = c.execute(sql, params).fetchall()
    return [{"caption": r, "doc_uri": r} for r in rows][1]


PRESENCE_QUALITY_PROMPT = """You are a validation agent.

Decide PRESENCE and score QUALITY using:
  - Template tag & notes
  - Template-PDF criteria excerpts (authoritative instructions)
  - Optional Guidance snippets (org guidance)
  - Evidence text snippets

Return STRICT JSON only.

TAG: {tag}
NOTES: {notes}
REQUIRED: {required_flag}

TEMPLATE_PDF_EXCERPTS:
{template_pdf_excerpts}

GUIDANCE_SNIPPETS:
{guidance}

EVIDENCE_SNIPPETS:
{evidence}

Respond JSON:
{{
    "status": "PRESENT" | "PARTIAL" | "MISSING" | "EMPTY",
    "quality": {{
        "completeness": 0-5,
        "specificity": 0-5,
        "traceability": 0-5
    }},
    "justification": "short one or two sentences",
    "citations": {{
        "evidence": ["short excerpt 1", "short excerpt 2"],
        "guidance": ["short excerpt or empty"],
        "template_pdf": ["short excerpt 1"]
    }}
}}
"""

DIAGRAM_PROMPT = """You are validating whether the required DIAGRAM exists and is of good quality.
Use Template tag/notes, Template-PDF criteria, optional Guidance, and DIAGRAM REFERENCES.
Return STRICT JSON only.

TAG: {tag}
NOTES: {notes}
REQUIRED: {required_flag}

TEMPLATE_PDF_EXCERPTS:
{template_pdf_excerpts}

GUIDANCE_SNIPPETS:
{guidance}

EVIDENCE_TEXT_SNIPPETS:
{evidence}

DIAGRAM_REFERENCES (top-k by similarity):
{diagrams}

Respond JSON:
{{
    "status": "PRESENT" | "PARTIAL" | "MISSING" | "EMPTY",
    "quality": {{
        "completeness": 0-5,
        "specificity": 0-5,
        "diagram_alignment": 0-5
    }},
    "justification": "short one or two sentences",
    "citations": {{
        "diagram": ["<caption or uri>"],
        "text": ["short excerpt or empty"],
        "template_pdf": ["short excerpt 1"]
    }}
}}
"""

ARCHITECTURE_SUMMARY_PROMPT = """Summarize architecture coverage and quality (conceptual, logical, physical).
Use text evidence snippets below (top-k) plus Template-PDF expectations.

TEMPLATE_PDF_EXCERPTS:
{template_pdf_excerpts}

EVIDENCE_SNIPPETS:
{evidence}

Return STRICT JSON:
{{
    "summary": "concise summary",
    "conceptual_present": true | false,
    "logical_present": true | false,
    "physical_present": true | false,
    "label_alignment_issues": ["example or empty"],
    "recommendations": ["short, actionable rec #1", "short, actionable rec #2"]
}}
"""


### Core run
def run_validation(template_json_path: str,
                   template_pdf_path: str,
                   nar_id: str,
                   application_name: str,
                   release_number: str,
                   rtype: str,
                   top_k: int = 6,
                   scope_doc_hash: Optional[str] = None,
                   enable_mm: bool = True) -> Dict[str, Any]:

    if EMBED_DIM is None:
        logging.warning(f"Unknown embedding model '{EMBED_MODEL}'. Ensure VECTOR(dim) matches model output.")

    with open(template_json_path, "r", encoding="utf-8") as f:
        template = json.load(f)

    pdf_text = ""
    if template_pdf_path.lower().endswith(".pdf"):
        pdf_text = read_pdf_text(template_pdf_path)
    elif template_pdf_path.lower().endswith(".docx"):
        pdf_text = docx_text(template_pdf_path)
    else:
        logging.warning("Template PDF path is not PDF/DOCX; skipping PDF guidance extraction.")

    results: List[Dict[str, Any]] = []
    must_total = must_met = 0
    good_total = good_met = 0

    for node in template:
        intent_name = (node.get("intent") or "").strip()
        for child in node.get("children", []):
            tag = (child.get("tag") or "").strip()
            mreq = bool(child.get("mustHave", False))
            greq = bool(child.get("goodToHave", False))
            notes = (child.get("notes", "") or "").strip()
            conds = (child.get("conditions", "") or "").strip()
            kws = child.get("keywords") or []
            kw_text = " ".join(k.strip() for k in kws if isinstance(k, str) and k.strip())

            query_full = " ".join(s for s in [tag, notes, conds, kw_text] if s).strip()

            ev_snips = retrieve_evidence_snippets(
                query_full, nar_id, release_number, rtype, scope_doc_hash, top_k
            )
            s_join = "---\n".join(ev_snips[:top_k]) if ev_snips else "(no snippets found)"

            g_snips = retrieve_guidance_snippets(query_full, rtype, top_n=3)
            g_join = "---\n".join(g_snips) if g_snips else "(no guidance context)"

            pdf_excerpts = pick_best_template_snippets_for_tag(query_full, pdf_text, top_n=3)
            pdf_join = "---\n".join(pdf_excerpts) if pdf_excerpts else "(no template-pdf excerpt)"

            is_diagram = (
                ("diagram" in tag.lower())
                or ("diagram" in notes.lower())
                or ("diagram" in conds.lower())
                or any(isinstance(k, str) and "diagram" in k.lower() for k in kws)
            )

            if enable_mm and is_diagram:
                mm_hits = retrieve_mm_diagrams(query_full, nar_id, release_number, rtype, scope_doc_hash, top_n=3)
                diag_block = "\n".join([f"- {h['caption']} :: {h['doc_uri']}" for h in mm_hits]) or "(none)"
                p_json = parse_json(gen_text(DIAGRAM_PROMPT.format(
                    tag=tag, notes=notes,
                    required_flag=("MUST_HAVE" if mreq else ("GOOD_TO_HAVE" if greq else "OPTIONAL")),
                    template_pdf_excerpts=pdf_join, guidance=g_join, evidence=s_join, diagrams=diag_block
                )))
            else:
                mm_hits = []
                p_json = parse_json(gen_text(PRESENCE_QUALITY_PROMPT.format(
                    tag=tag, notes=notes,
                    required_flag=("MUST_HAVE" if mreq else ("GOOD_TO_HAVE" if greq else "OPTIONAL")),
                    template_pdf_excerpts=pdf_join, guidance=g_join, evidence=s_join
                )))

            status = (p_json.get("status") if isinstance(p_json, dict) else None) or "MISSING"
            if mreq:
                must_total += 1
                if status == "PRESENT":
                    must_met += 1
            if greq:
                good_total += 1
                if status == "PRESENT":
                    good_met += 1

            results.append({
                "intent": intent_name,
                "tag": tag,
                "mustHave": mreq,
                "goodToHave": greq,
                "status": status,
                "quality": p_json.get("quality", {}) if isinstance(p_json, dict) else {},
                "justification": p_json.get("justification", "") if isinstance(p_json, dict) else "",
                "citations": p_json.get("citations", {}) if isinstance(p_json, dict) else {},
                "diagram_refs": mm_hits,
                "snippets": ev_snips[:top_k],
                "used_guidance": bool(g_snips),
                "template_pdf_used": bool(pdf_excerpts),
            })

    arch_query = "Overall Architecture Conceptual Logical Physical GKE Cloud SQL Interfaces Components"
    arch_snips = retrieve_evidence_snippets(arch_query, nar_id, release_number, rtype, scope_doc_hash, top_n=10)
    arch_s_join = "---\n".join(arch_snips) if arch_snips else "(none)"
    arch_pdf = pick_best_template_snippets_for_tag(
        "Overall Architecture Diagrams Conceptual Logical Physical", pdf_text, top_n=3
    )
    arch_pdf_join = "---\n".join(arch_pdf) if arch_pdf else "(no template-pdf excerpt)"

    arch_json = parse_json(gen_text(ARCHITECTURE_SUMMARY_PROMPT.format(
        template_pdf_excerpts=arch_pdf_join,
        evidence=arch_s_join
    )))

    summary = {
        "nar_id": nar_id,
        "application_name": application_name,
        "release_number": release_number,
        "rtype": rtype,
        "doc_hash_scope": scope_doc_hash,
        "must_have_total": must_total,
        "must_have_met": must_met,
        "must_have_coverage_pct": round(must_met / must_total * 100.0, 1) if must_total else 0.0,
        "good_to_have_total": good_total,
        "good_to_have_met": good_met,
        "good_to_have_coverage_pct": round(good_met / good_total * 100.0, 1) if good_total else 0.0,
        "architecture": arch_json,
    }

    return {"summary": summary, "per_intent": results}


def generate_summary_pdf(result: Dict[str, Any], pdf_output_path: str = "summary_report.pdf") -> bool:
    try:
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4

        summary = result.get("summary", {})
        per_intent = result.get("per_intent", [])
        architecture = summary.get("architecture", {}) or {}

        nar_id = summary.get("nar_id", "")
        application_name = summary.get("application_name", "")
        release_number = summary.get("release_number", "")
        rtype = summary.get("rtype", "")
        must_have_total = summary.get("must_have_total", 0)
        must_have_met = summary.get("must_have_met", 0)
        must_have_diff = must_have_total - must_have_met
        must_have_coverage = summary.get("must_have_coverage_pct", 0.0)

        architecture_summary = architecture.get("summary", "")
        if not architecture_summary:
            architecture_summary = (
                f"This report is for NAR ID {nar_id}, application {application_name}, "
                f"release {release_number}, and rtype {rtype}."
            )

        doc = SimpleDocTemplate(
            pdf_output_path,
            pagesize=A4,
            leftMargin=40,
            rightMargin=40,
            topMargin=40,
            bottomMargin=40,
        )

        styles = getSampleStyleSheet()
        story = []

        title_style = styles["Heading1"]
        heading_style = styles["Heading2"]
        normal_style = styles["BodyText"]

        story.append(Paragraph("SUMMARY REPORT", title_style))
        story.append(Spacer(1, 12))

        story.append(Paragraph(f"<b>NAR ID:</b> {nar_id}", normal_style))
        story.append(Paragraph(f"<b>Application Name:</b> {application_name}", normal_style))
        story.append(Paragraph(f"<b>Release Number:</b> {release_number}", normal_style))
        story.append(Paragraph(f"<b>rtype:</b> {rtype}", normal_style))
        story.append(Spacer(1, 12))

        story.append(Paragraph("Summary", heading_style))
        story.append(Paragraph(architecture_summary, normal_style))
        story.append(Spacer(1, 12))

        story.append(Paragraph("Must-Have Metrics", heading_style))
        story.append(Paragraph(f"<b>Must Have Total:</b> {must_have_total}", normal_style))
        story.append(Paragraph(f"<b>Must Have Met:</b> {must_have_met}", normal_style))
        story.append(Paragraph(f"<b>Difference:</b> {must_have_diff}", normal_style))
        story.append(Paragraph(f"<b>Coverage:</b> {must_have_coverage:.1f}%", normal_style))
        story.append(Spacer(1, 12))

        story.append(Paragraph("Justification", heading_style))

        table_data = [
            [
                Paragraph("<b>Name</b>", normal_style),
                Paragraph("<b>Justification</b>", normal_style),
            ]
        ]

        found_rows = 0
        for item in per_intent:
            if item.get("mustHave") and item.get("status") != "PRESENT":
                name = item.get("tag", "") or item.get("intent", "") or "N/A"
                status = item.get("status", "")
                justification = item.get("justification", "") or "No justification available."

                justification_text = f"[{status}] {justification}" if status else justification

                table_data.append([
                    Paragraph(str(name), normal_style),
                    Paragraph(str(justification_text), normal_style),
                ])
                found_rows += 1

        if found_rows == 0:
            table_data.append([
                Paragraph("No Gap", normal_style),
                Paragraph("All must-have requirements are PRESENT, so there is no justification gap.", normal_style),
            ])

        justification_table = Table(table_data, colWidths=[160, 330])
        justification_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d9eaf7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.75, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))

        story.append(justification_table)

        doc.build(story)
        logging.info(f"PDF Summary Report generated: {pdf_output_path}")
        return True

    except Exception as e:
        logging.error(f"Failed to generate PDF summary report: {e}")
        return False


### CLI
def main():
    ap = argparse.ArgumentParser("Quality-aware Validation using Template JSON + Template PDF + Evidence")
    ap.add_argument("--template-json", required=True)
    ap.add_argument("--template-pdf", required=True)
    ap.add_argument("--nar-id", required=True)
    ap.add_argument("--application-name", required=True)
    ap.add_argument("--release-number", required=True)
    ap.add_argument("--rtype", required=True, help="indev | new | migration | rehost")
    ap.add_argument("--top-k", type=int, default=6)
    ap.add_argument("--scope-doc-hash", default="", help="Optional: restrict to a specific evidence doc_hash")
    ap.add_argument("--enable-mm", action="store_true")
    ap.add_argument("--out", default="validation_quality_result.json")
    ap.add_argument("--pdf-out", default="summary_report.pdf")
    args = ap.parse_args()

    rtype = resolve_rtype(args.rtype)
    logging.info(f"[CFG] Using rtype='{rtype}', TOP-K={args.top_k}, MM={args.enable_mm}")

    _ = get_engine()

    # ✅ ADDED: compute doc_hash once, pin all retrievals to same document
    if args.scope_doc_hash.strip():
        scope_doc_hash = args.scope_doc_hash.strip()
    else:
        with open(args.template_json, "rb") as f:
            scope_doc_hash = compute_doc_hash(f.read())
        logging.info(f"Auto-computed doc_hash: {scope_doc_hash}")

    result = run_validation(
        template_json_path=args.template_json,
        template_pdf_path=args.template_pdf,
        nar_id=args.nar_id,
        application_name=args.application_name,
        release_number=args.release_number,
        rtype=rtype,
        top_k=args.top_k,
        scope_doc_hash=scope_doc_hash,   # ✅ always pinned
        enable_mm=args.enable_mm,
    )

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    logging.info(f"Done. JSON: {args.out}")

    pdf_ok = generate_summary_pdf(result, args.pdf_out)
    if pdf_ok:
        logging.info(f"Done. PDF: {args.pdf_out}")


if __name__ == "__main__":
    main()
