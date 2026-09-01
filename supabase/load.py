# -*- coding: utf-8 -*-
"""Load `public/data/catalog.json` into Supabase.

    py supabase/load.py [--dry-run]

Writes only the BASE layer (family, brand, model, part, model_part, diagram,
catalog_meta). It never touches model_override / part_override / image, which
belong to whoever edits from /admin — that separation is what stops a re-import
from destroying manual work, so keep it that way.

Idempotent: every write is an upsert on a natural key, so running it twice
updates rather than duplicates.

Credentials never live in the repo: they are read from `.secrets/supabase.json`
(gitignored) or from the path in $SUPABASE_CREDS.
    {"url": "https://<ref>.supabase.co", "serviceRoleKey": "..."}
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "catalog.json"
# Credenciales fuera del control de versiones. `.secrets/` esta en .gitignore.
CREDS = Path(os.environ.get("SUPABASE_CREDS", ROOT / ".secrets" / "supabase.json"))
BATCH = 500

_creds = json.loads(CREDS.read_text(encoding="utf-8"))
URL = _creds["url"].rstrip("/")
KEY = _creds["serviceRoleKey"]


def _headers(extra: dict[str, str] | None = None) -> dict[str, str]:
    headers = {"apikey": KEY, "content-type": "application/json"}
    # Legacy service_role keys are JWTs; the newer sb_secret_ ones are not and
    # PostgREST rejects them if they arrive as a bearer token.
    if KEY.startswith("eyJ"):
        headers["authorization"] = f"Bearer {KEY}"
    headers.update(extra or {})
    return headers


def request(method: str, path: str, body=None, extra_headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=data, method=method)
    for key, value in _headers(extra_headers).items():
        req.add_header(key, value)
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read().decode("utf-8", "replace")
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:600]
        raise SystemExit(f"\n[FALLO] {method} {path}\n  HTTP {error.code}: {detail}\n")


def upsert(table: str, rows: list[dict], on_conflict: str, returning=False):
    """Upserts in batches; returns the stored rows when `returning` is set."""
    if not rows:
        return []
    prefer = "resolution=merge-duplicates,return=" + ("representation" if returning else "minimal")
    out = []
    for start in range(0, len(rows), BATCH):
        chunk = rows[start : start + BATCH]
        result = request("POST", f"{table}?on_conflict={on_conflict}", chunk, {"prefer": prefer})
        if returning:
            out.extend(result)
        print(f"    {table}: {min(start + BATCH, len(rows))}/{len(rows)}", end="\r", flush=True)
    print(f"    {table}: {len(rows)}/{len(rows)} listo      ")
    return out


def count(relation: str) -> int:
    req = urllib.request.Request(f"{URL}/rest/v1/{relation}?select=*&limit=0")
    for key, value in _headers({"prefer": "count=exact"}).items():
        req.add_header(key, value)
    with urllib.request.urlopen(req, timeout=60) as response:
        total = response.headers.get("content-range", "/0").split("/")[-1]
    return int(total) if total.isdigit() else 0


def as_int(value):
    """`ue` arrives as int or as a numeric string; the column is a single integer."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    return int(text) if text.isdigit() else None


def main() -> int:
    dry = "--dry-run" in sys.argv
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    models = catalog["models"]
    parts = catalog["parts"]
    print(f">> catalogo: {len(models)} modelos, {len(parts)} repuestos")

    # Lookups come from the UNION of what we are about to write, never from
    # catalog.families: that list is derived from models only, so the three
    # part-only families would be missing and their foreign key would abort.
    families = {m["family"] for m in models if m.get("family")}
    families |= {p["family"] for p in parts.values() if p.get("family")}
    brands = {m["brand"] for m in models if m.get("brand")}
    brands |= {p["brand"] for p in parts.values() if p.get("brand")}
    print(f">> familias: {len(families)} | marcas: {len(brands)}")

    if dry:
        print("[dry-run] nada se escribio")
        return 0

    print(">> catalogos de apoyo")
    # Name-only payloads: PostgREST builds its column list from the payload
    # keys, so sending sort_order here would overwrite the curated ordering.
    upsert("family", [{"name": n} for n in sorted(families)], "name")
    upsert("brand", [{"name": n} for n in sorted(brands)], "name")
    family_id = {r["name"]: r["id"] for r in request("GET", "family?select=id,name")}
    brand_id = {r["name"]: r["id"] for r in request("GET", "brand?select=id,name")}

    missing = (families - family_id.keys()) | (brands - brand_id.keys())
    if missing:
        raise SystemExit(f"[FALLO] faltan catalogos tras el upsert: {sorted(missing)}")

    print(">> repuestos")
    upsert(
        "part",
        [
            {
                "code": p["code"],
                "cmmf": p.get("cmmf"),
                "ean": p.get("ean"),
                "description": p["description"],
                "ue": as_int(p.get("ue")),
                "uc_master": p.get("ucMaster"),
                "family_id": family_id.get(p.get("family")),
                "product_line": p.get("productLine"),
                "brand_id": brand_id.get(p.get("brand")),
                "sources": p.get("sources") or [],
                "photo": p.get("photo"),
                "photo_width": p.get("photoWidth"),
                "photo_height": p.get("photoHeight"),
                "price_regular": p.get("priceRegular"),
                "price_gross": p.get("priceGross"),
                "currency": p.get("currency"),
            }
            for p in parts.values()
        ],
        "code",
    )

    print(">> modelos")
    upsert(
        "model",
        [
            {
                "id": m["id"],
                "name": m["name"],
                "brand_id": brand_id.get(m.get("brand")),
                "family_id": family_id.get(m.get("family")),
                "ref": m.get("ref"),
                "brand_origin": m.get("brandOrigin"),
                "sources": m.get("sources") or [],
                "equivalent_refs": m.get("equivalentRefs") or [],
            }
            for m in models
        ],
        "id",
    )

    print(">> filas modelo-repuesto")
    upsert(
        "model_part",
        [
            {
                "row_id": row["rowId"],
                "model_id": m["id"],
                "code": row["code"],
                "hotspot": row.get("hotspot"),
                "position": i,
            }
            for m in models
            for i, row in enumerate(m["parts"])
        ],
        "row_id",
    )

    print(">> laminas de despiece")
    # `position` is the index inside Model.diagrams[], which is what
    # Hotspot.diagram points at. `plate` is the printed sheet number and
    # repeats across diagrams in 100 models, so it cannot serve as the order.
    upsert(
        "diagram",
        [
            {
                "model_id": m["id"],
                "position": i,
                "image": d["image"],
                "width": d.get("width"),
                "height": d.get("height"),
                "plate": d.get("part") or 1,
            }
            for m in models
            for i, d in enumerate(m["diagrams"])
        ],
        "model_id,position",
    )

    print(">> procedencia")
    request(
        "PATCH",
        "catalog_meta?id=eq.true",
        {"generated_from": catalog.get("generatedFrom") or [], "generated_at": "now()"},
        {"prefer": "return=minimal"},
    )

    print("\n== verificacion contra el catalogo de origen ==")
    expected = {
        "family": len(families),
        "brand": len(brands),
        "part": len(parts),
        "model": len(models),
        "model_part": sum(len(m["parts"]) for m in models),
        "diagram": sum(len(m["diagrams"]) for m in models),
    }
    ok = True
    for relation, want in expected.items():
        got = count(relation)
        flag = "OK " if got == want else "MAL"
        if got != want:
            ok = False
        print(f"  {flag} {relation:12} esperado={want:<6} en base={got}")
    print("\nTodo cuadra." if ok else "\nHay diferencias: revisar arriba.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
