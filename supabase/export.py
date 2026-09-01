# -*- coding: utf-8 -*-
"""Rebuild `public/data/catalog.json` from Supabase.

    py supabase/export.py [--skip-images]

Reads the export views, which already merge the pipeline's values with the
manual edits from /admin, and writes the JSON the public site consumes. This is
the step that makes an edit visible: until it runs, the catalog on the web is
whatever the last export produced.

Images uploaded through /admin live in R2 and are served from `/api/images/...`,
which Cloudflare Access gates — so the public site could never load them from
there. They are pulled into `public/images/uploads/` instead and shipped as
static assets, which are free, unlimited and need no auth, exactly like the
despiece plates already are.

Credentials come from `.secrets/supabase.json` (gitignored) or $SUPABASE_CREDS.
R2 objects are fetched with the local wrangler login, so no extra key is needed.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "data" / "catalog.json"
UPLOADS = ROOT / "public" / "images" / "uploads"
CREDS = Path(os.environ.get("SUPABASE_CREDS", ROOT / ".secrets" / "supabase.json"))
BUCKET = "groupe-seb-images"
PAGE = 1000

_creds = json.loads(CREDS.read_text(encoding="utf-8"))
URL = _creds["url"].rstrip("/")
KEY = _creds["serviceRoleKey"]


def _headers() -> dict[str, str]:
    headers = {"apikey": KEY, "accept": "application/json"}
    if KEY.startswith("eyJ"):
        headers["authorization"] = f"Bearer {KEY}"
    return headers


def fetch_all(relation: str, order: str, select: str = "*") -> list[dict]:
    """Reads a whole relation.

    Paging carries an explicit `order`: PostgREST guarantees no stable ordering
    without one, so limit/offset silently repeats and drops rows — which is
    exactly how an earlier verification miscounted 1701 prices where there
    were 1646.
    """
    rows: list[dict] = []
    while True:
        query = f"select={select}&order={order}&limit={PAGE}&offset={len(rows)}"
        request = urllib.request.Request(f"{URL}/rest/v1/{relation}?{query}", headers=_headers())
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                batch = json.loads(response.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            raise SystemExit(f"\n[FALLO] GET {relation}: HTTP {error.code} {detail}\n")
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows


def pull_images(images: list[dict]) -> dict[str, str]:
    """Copies every uploaded object out of R2 into the static build.

    Returns storage_key -> path relative to the site root. Keys are content
    addressed, so an object already on disk is never fetched twice.
    """
    UPLOADS.mkdir(parents=True, exist_ok=True)
    paths: dict[str, str] = {}
    failed: list[str] = []
    for index, image in enumerate(images, 1):
        key = image["storage_key"]
        name = key.replace("/", "_")
        target = UPLOADS / name
        # A zero-byte file is what a failed download leaves behind, and treating
        # it as cached would ship a broken image to the public site.
        if target.exists() and target.stat().st_size == 0:
            target.unlink()
        if not target.exists():
            result = subprocess.run(
                # --remote is required: without it wrangler reads the local
                # simulated R2, which is empty, and fails with "The specified
                # key does not exist".
                ["npx", "wrangler", "r2", "object", "get", f"{BUCKET}/{key}", "--remote",
                 "-f", str(target)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                shell=os.name == "nt",
            )
            if result.returncode != 0 or not target.exists() or target.stat().st_size == 0:
                target.unlink(missing_ok=True)
                failed.append(key)
                continue
        paths[key] = f"images/uploads/{name}"
        print(f"    imagenes: {index}/{len(images)}", end="\r", flush=True)
    print(f"    imagenes: {len(paths)}/{len(images)} listas          ")
    if failed:
        # Loud, not a warning buried in the log: a missing image would otherwise
        # silently drop the photo from the exported catalog.
        raise SystemExit(
            f"\n[FALLO] no se pudieron bajar {len(failed)} imagenes de R2:\n"
            + "\n".join(f"  - {key}" for key in failed[:10])
            + "\nEl catalogo NO se escribio para no publicar fotos rotas.\n"
        )
    return paths


def main() -> int:
    skip_images = "--skip-images" in sys.argv

    print(">> leyendo Supabase")
    models = fetch_all("v_model", "id")
    parts = fetch_all("v_part", "code")
    rows = fetch_all("model_part", "model_id,position")
    diagrams = fetch_all("diagram", "model_id,position")
    images = fetch_all("v_image", "entity_type,entity_id,sort_order")
    meta = fetch_all("catalog_meta", "id")
    print(
        f"   {len(models)} modelos · {len(parts)} repuestos · {len(rows)} filas · "
        f"{len(diagrams)} laminas · {len(images)} imagenes"
    )

    image_paths: dict[str, str] = {}
    if images and not skip_images:
        print(">> bajando imagenes subidas desde R2")
        image_paths = pull_images(images)

    # First uploaded image per entity wins; v_image is already sorted.
    primary: dict[tuple[str, str], dict] = {}
    for image in images:
        primary.setdefault((image["entity_type"], image["entity_id"]), image)

    rows_by_model: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        rows_by_model[row["model_id"]].append(row)
    diagrams_by_model: dict[str, list[dict]] = defaultdict(list)
    for diagram in diagrams:
        diagrams_by_model[diagram["model_id"]].append(diagram)
    models_by_part: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        if row["model_id"] not in models_by_part[row["code"]]:
            models_by_part[row["code"]].append(row["model_id"])

    def photo_of(kind: str, ident: str) -> tuple[str | None, str | None]:
        image = primary.get((kind, ident))
        if not image:
            return None, None
        return image_paths.get(image["storage_key"]), image.get("alt_text") or None

    out_models = []
    for model in models:
        uploaded, alt = photo_of("model", model["id"])
        out_models.append(
            {
                "id": model["id"],
                "name": model["name"],
                "brand": model["brand"],
                "family": model["family"],
                "ref": model["ref"],
                "brandOrigin": model["brand_origin"],
                "sources": model["sources"] or [],
                "diagrams": [
                    {
                        "image": d["image"],
                        "width": d["width"],
                        "height": d["height"],
                        "part": d["plate"],
                    }
                    for d in diagrams_by_model[model["id"]]
                ],
                "parts": [
                    {"rowId": r["row_id"], "code": r["code"], "hotspot": r["hotspot"]}
                    for r in rows_by_model[model["id"]]
                ],
                "equivalentRefs": model["equivalent_refs"] or [],
                "photo": uploaded,
                "photoAlt": alt,
            }
        )

    out_parts = {}
    for part in parts:
        uploaded, alt = photo_of("part", part["code"])
        out_parts[part["code"]] = {
            "code": part["code"],
            "cmmf": part["cmmf"],
            "description": part["description"],
            "ean": part["ean"],
            "ue": part["ue"],
            "ucMaster": part["uc_master"],
            "family": part["family"],
            "productLine": part["product_line"],
            "brand": part["brand"],
            "sources": part["sources"] or [],
            "models": models_by_part.get(part["code"], []),
            # An uploaded photo wins over the one the pipeline extracted.
            "photo": uploaded or part["photo"],
            "photoWidth": None if uploaded else part["photo_width"],
            "photoHeight": None if uploaded else part["photo_height"],
            "photoAlt": alt,
            "priceRegular": part["price_regular"],
            "priceGross": part["price_gross"],
            "currency": part["currency"],
        }

    catalog = {
        "generatedFrom": (meta[0]["generated_from"] if meta else []) or [],
        # Derived from MODELS, not from the family table: familySummaries in
        # catalog-store.ts renders one home tile per entry and counts models,
        # so listing the three part-only families would add empty tiles.
        "brands": sorted({m["brand"] for m in out_models if m["brand"]}),
        "families": sorted({m["family"] for m in out_models if m["family"]}),
        "models": out_models,
        "parts": out_parts,
    }

    CATALOG.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    edited_models = sum(1 for m in models if m.get("edited"))
    edited_parts = sum(1 for p in parts if p.get("edited"))
    print(
        f"\n[export] {len(out_models)} modelos ({edited_models} editados a mano), "
        f"{len(out_parts)} repuestos ({edited_parts} editados), "
        f"{len(image_paths)} imagenes subidas."
    )
    print(f"[export] escrito {CATALOG.relative_to(ROOT)}")
    print("[export] falta desplegar: npx ng build && npx wrangler deploy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
