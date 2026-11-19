#!/usr/bin/env python3
"""Gera os dados que o app usa offline, a partir da tabela CMED/Anvisa.

Uso:
    python3 scripts/build_data.py caminho/para/lista_pmc.xlsx

Entrada:
    - Tabela de preços CMED (PMC), em .xlsx, baixada do site da Anvisa.
    - scripts/farmacia_popular.json, com o elenco gratuito do Farmácia Popular.

Saída (em docs/data/):
    - remedios.json: todas as apresentações vendidas em farmácia, com preço
      máximo ao consumidor (PMC, ICMS 18%) e a marcação de quais são gratuitas.
    - farmacia-popular.json: o elenco gratuito, com quantas apresentações da
      CMED bateram com cada item (serve para conferir o casamento dos dados).
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "data"

# Colunas da aba "Lista PMC"
C_SUB, C_LAB, C_EAN, C_PROD, C_APRES, C_CLASSE, C_TIPO = 0, 2, 5, 8, 9, 10, 11
C_PMC18, C_PMC0, C_HOSP, C_COMERC, C_TARJA = 47, 40, 65, 71, 72

FORM_START = re.compile(
    r"\s(COM|CAP|CAPS|SOL|SUS|SUSP|AER|PO|XPE|CREM|GEL|POM|EMU|DRG|GRAN|ADES|SPR|PAS|LIQ|"
    r"ESM|OL|TAB|SUP|OVL|DIU|IMPL|STT|GOMA|PAST|SAB|XAMP|LOC|ELX|BAST|FILM|INAL|ENV)\b"
)
PACK_START = re.compile(r"\s(CT|CX|FR|BL|FA|DISP|TB|SER|CART|AMP|BOLS|BOLSA|CTBL|ENV)\b")

FORM_RULES = [
    (r"^COM\b.*(LIB PROL|LIB MOD|LIB RETARD|LIB ESTEN|AÇÃO PROL|LIB CONT)", "comprimido de liberação prolongada"),
    (r"^COM\b.*EFERV", "comprimido efervescente"),
    (r"^COM\b.*(MAST)", "comprimido mastigável"),
    (r"^COM\b.*(ORODISP|DISP OR|DISPERS)", "comprimido que dissolve na boca"),
    (r"^COM\b.*SUBL", "comprimido sublingual"),
    (r"^COM\b.*(VAG)", "comprimido vaginal"),
        (r"^COM\b", "comprimido"),
    (r"^DRG\b", "drágea"),
    (r"^(CAP|CAPS)\b.*(LIB PROL|LIB MOD|LIB RETARD|LIB CONT)", "cápsula de liberação prolongada"),
    (r"^(CAP|CAPS)\b.*INAL", "cápsula para inalação"),
    (r"^(CAP|CAPS)\b.*(MOLE|GEL MOLE)", "cápsula mole"),
    (r"^(CAP|CAPS)\b", "cápsula"),
    (r"OFT", "colírio"),
    (r"(SPR|AER).*NAS|NAS\b", "spray nasal"),
    (r"AER", "aerossol (bombinha)"),
    (r"(NEBUL|INAL)", "solução para inalação"),
    (r"^SUS(P)? INJ", "suspensão injetável"),
    (r"INJ|INFUS", "solução injetável"),
    (r"^XPE", "xarope"),
    (r"^SOL OR.*GOT|GOT OR|^SOL GOT", "gotas"),
    (r"^SUS(P)? OR", "suspensão oral"),
    (r"^SOL OR|^SOL\b.*\bOR\b", "solução oral"),
    (r"^ELX", "elixir"),
    (r"^CREM", "creme"),
    (r"^POM", "pomada"),
    (r"^GEL", "gel"),
    (r"^(LOC|EMU)", "loção"),
    (r"^ADES", "adesivo"),
    (r"^(PO|GRAN)\b.*(SUS|SOL) OR", "pó para preparo oral"),
    (r"^GRAN", "granulado"),
    (r"^PO\b", "pó"),
    (r"^(SUP|OVL)", "supositório ou óvulo"),
    (r"^DIU", "DIU"),
    (r"^SOL", "solução"),
    (r"^SUS", "suspensão"),
]
FORM_RULES = [(re.compile(p), label) for p, label in FORM_RULES]

TIPOS = {"Genérico": "G", "Similar": "S", "Novo": "N", "Específico": "E", "Biológico": "B", "Fitoterápico": "F"}
TARJAS = {"Tarja Vermelha": "V", "Tarja Vermelha sob restrição": "R", "Tarja Preta": "P", "Tarja Sem Tarja": "L"}
SMALL = {"DE", "DA", "DO", "DAS", "DOS", "E", "COM", "EM", "PARA"}


def clean(s):
    return re.sub(r"\s+", " ", str(s or "").replace("\xa0", " ")).strip()


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def sentence_case(s):
    s = re.sub(r"\s*\(PORT\.?[^)]*\)?", "", s).strip()
    s = s.lower()
    return s[:1].upper() + s[1:]


def product_case(s):
    out = []
    for w in s.split(" "):
        letters = re.sub(r"[^A-ZÀ-Ü]", "", w)
        if len(letters) <= 3 and w not in SMALL and letters and not re.search(r"[AEIOUÁÉÍÓÚÂÊÔÃÕ]", letters):
            out.append(w)  # siglas como XR, HCT, SR
        elif w in SMALL and out:
            out.append(w.lower())
        else:
            out.append(w[:1] + w[1:].lower())
    return " ".join(out)


def price(v):
    v = clean(v)
    if not v or v == "-":
        return None
    try:
        return round(float(v.replace(".", "").replace(",", ".")) * 100)
    except ValueError:
        return None


def split_apres(a):
    a = " " + clean(a)
    m = FORM_START.search(a)
    if not m:
        return clean(a), "", ""
    conc, rest = a[: m.start()].strip(), a[m.start():].strip()
    p = PACK_START.search(" " + rest)
    if p:
        forma, pack = rest[: p.start() - 1].strip(), rest[p.start():].strip()
    else:
        forma, pack = rest, ""
    return conc, forma, pack


def human_form(forma):
    for rx, label in FORM_RULES:
        if rx.search(forma):
            return label
    return forma.lower() or "outra forma"


def human_conc(conc):
    c = conc.replace("(", "").replace(")", "")
    c = re.sub(r"\s*\+\s*", " + ", c)
    c = re.sub(r"(\d),0\b", r"\1", c)
    c = re.sub(r"(\d)(MG|MCG|G|UI|ML)\b", r"\1 \2", c)
    c = re.sub(r"\bMCG\b", "mcg", c)
    c = re.sub(r"\bMG\b", "mg", c)
    c = re.sub(r"\bML\b", "mL", c)
    c = re.sub(r"\bG\b", "g", c)
    c = re.sub(r"\bDOSE\b|\bDOS\b", "dose", c)
    c = re.sub(r"\s*/\s*", "/", c)
    return clean(c)


def human_pack(pack):
    m = re.findall(r"X (\d+(?:[.,]\d+)?) ?(ML|G|L|DOSES?)\b", pack)
    if m:
        n, u = m[-1]
        u = {"ML": "mL", "G": "g", "L": "L"}.get(u, "doses")
        return f"{n} {u}"
    m = re.findall(r"X (\d+)\b", pack)
    if m:
        return f"{m[-1]} un."
    return ""


NUM = re.compile(r"(\d+(?:[.,]\d+)?)\s*(MCG|MG|G|UI|U|ML|MCL|L|%)?")


def amounts(conc):
    """Quantidades da concentração, em mcg (massa) ou UI. Ex.: '(25 + 250) MG' -> [25000, 250000]."""
    out, pending = [], []
    for num, unit in NUM.findall(re.sub(r"[()]", " ", conc.upper()).replace("/ ", "/")):
        val = float(num.replace(",", "."))
        pending.append(val)
        if not unit:
            continue
        for v in pending:
            if unit == "MG":
                out.append(round(v * 1000))
            elif unit == "MCG":
                out.append(round(v))
            elif unit == "G":
                out.append(round(v * 1_000_000))
            elif unit in ("UI", "U"):
                out.append(f"{v:g}UI")
        pending = []
    return out


def norm_key(v):
    return str(v)


def main(xlsx):
    fp = json.loads((ROOT / "scripts" / "farmacia_popular.json").read_text(encoding="utf-8"))
    matchers = []
    for it in fp["itens"]:
        if not it["subs"]:
            continue
        matchers.append((it, re.compile(it["forma_re"]), sorted(map(norm_key, it["nums"]))))

    wb = openpyxl.load_workbook(xlsx, read_only=True)
    cab = wb.worksheets[0]
    cmed_date = None
    for row in cab.iter_rows(values_only=True):
        for cell in row:
            m = re.search(r"(\d{2}/\d{2}/\d{4})", clean(cell))
            if m and not cmed_date:
                cmed_date = m.group(1)
    ws = wb.worksheets[1]
    rows = ws.iter_rows(values_only=True)
    next(rows)

    subs, labs, formas = {}, {}, {}
    def idx(d, k):
        if k not in d:
            d[k] = len(d)
        return d[k]

    items, fp_hits, seen = [], Counter(), set()
    skipped = Counter()
    for r in rows:
        if not r or not r[C_SUB]:
            continue
        if clean(r[C_HOSP]) == "Sim":
            skipped["hospitalar"] += 1
            continue
        pmc = price(r[C_PMC18])
        if pmc is None:
            skipped["sem PMC"] += 1
            continue
        sub_raw = clean(r[C_SUB])
        apres = clean(r[C_APRES])
        conc, forma_raw, pack = split_apres(apres)
        comps = [clean(c) for c in sub_raw.split(";")]
        fp_id = ""
        nums = sorted(map(norm_key, amounts(conc)))
        for it, frx, want in matchers:
            if len(comps) != len(it["subs"]):
                continue
            if not all(any(s in c for c in comps) for s in it["subs"]):
                continue
            if nums != want or not frx.search(forma_raw):
                continue
            fp_id = it["id"]
            break
        sub_name = "; ".join(sentence_case(c) for c in comps)
        prod = product_case(clean(r[C_PROD]))
        ean = re.sub(r"\D", "", clean(r[C_EAN]))
        key = (sub_name, prod, apres, clean(r[C_LAB]))
        if key in seen:
            skipped["duplicado"] += 1
            continue
        seen.add(key)
        if fp_id:
            fp_hits[fp_id] += 1
        items.append([
            idx(subs, sub_name),
            prod,
            idx(labs, product_case(clean(r[C_LAB]))),
            TIPOS.get(clean(r[C_TIPO]), "O"),
            human_conc(conc),
            idx(formas, human_form(forma_raw)),
            human_pack(pack),
            pmc,
            ean if len(ean) >= 8 else "",
            fp_id,
            TARJAS.get(clean(r[C_TARJA]), ""),
            1 if clean(r[C_COMERC]) == "Sim" else 0,
        ])

    def inv(d):
        out = [None] * len(d)
        for k, v in d.items():
            out[v] = k
        return out

    data = {
        "v": 1,
        "cmed": cmed_date,
        "icms": 18,
        "campos": ["sub", "produto", "lab", "tipo", "conc", "forma", "emb", "pmc", "ean", "fp", "tarja", "comerc"],
        "subs": inv(subs),
        "labs": inv(labs),
        "formas": inv(formas),
        "itens": items,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "remedios.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    for it in fp["itens"]:
        it["cmed"] = fp_hits.get(it["id"], 0)
        for k in ("subs", "nums", "forma_re"):
            it.pop(k, None)
    fp.pop("_sobre", None)
    (OUT / "farmacia-popular.json").write_text(json.dumps(fp, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"CMED de {cmed_date}: {len(items)} apresentações, {len(subs)} princípios ativos, {len(labs)} laboratórios")
    print("Ignoradas:", dict(skipped))
    for it in fp["itens"]:
        flag = "" if it["cmed"] or it["grupo"] == "outros" else "   <-- nenhuma apresentação casou"
        print(f"  {it['id']:32} {it['cmed']:4}{flag}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
