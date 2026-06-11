"""
RuknAuto — Unit / pack detection (كرتون ↔ قطعة)
"""
from __future__ import annotations

import re

PACK_KEYWORDS = (
    "كرتون", "كرتن", "carton", "ctn", "box", "علبة", "عبوة", "حزمة", "بالة",
)
PIECE_KEYWORDS = (
    "قطعة", "قطعه", "pcs", "pc", "piece", "حبة", "حبه", "each", "unit",
)
UNIT_ONLY_MAX_LEN = 28


def _norm(s: str) -> str:
    return " ".join((s or "").lower().split())


def detect_unit_kind(text: str) -> str:
    """Returns: 'pack' | 'piece' | ''"""
    t = _norm(text)
    if not t:
        return ""
    for k in PACK_KEYWORDS:
        if k in t:
            return "pack"
    for k in PIECE_KEYWORDS:
        if k in t:
            return "piece"
    return ""


def is_unit_only_row(item: dict) -> bool:
    """صف يصف الوحدة فقط (شائع في فواتير الزيوت)."""
    desc = (item.get("description") or "").strip()
    part = (item.get("part_number") or "").strip()
    unit = (item.get("unit") or "").strip()
    label = unit or desc
    if part:
        return False
    if len(label) > UNIT_ONLY_MAX_LEN:
        return False
    kind = detect_unit_kind(label)
    if not kind:
        return False
    # غالباً بدون سعر أو بسيط
    try:
        cost = float(item.get("unit_cost") or 0)
    except (TypeError, ValueError):
        cost = 0
    if cost > 0 and len(desc) > 12:
        return False
    return True


def parse_quantity_text(raw) -> tuple[float, str, str]:
    """استخراج رقم + نوع الوحدة من نص مثل «5 كرتون» أو «5 CTN».

    Returns:
        (quantity, unit_kind, unit_label)
    """
    if raw is None or raw == "":
        return 0.0, "", ""
    if isinstance(raw, (int, float)):
        return float(raw), "", ""

    s = str(raw).strip().replace(",", ".")
    kind = detect_unit_kind(s)
    unit_label = ""
    if kind == "pack":
        for k in PACK_KEYWORDS:
            if k in _norm(s):
                unit_label = k
                break
        if not unit_label:
            unit_label = "كرتون"
    elif kind == "piece":
        for k in PIECE_KEYWORDS:
            if k in _norm(s):
                unit_label = k
                break

    m = re.search(r"(\d+(?:\.\d+)?)", s)
    qty = float(m.group(1)) if m else 0.0
    return qty, kind, unit_label


def normalize_item_quantities(item: dict) -> dict:
    """توحيد الكمية والوحدة من حقول الفاتورة (رقم فقط أو «5 كرتون»)."""
    raw_q = item.get("quantity")
    item["_qty_text"] = str(raw_q) if raw_q is not None else ""
    q, kind_q, label_q = parse_quantity_text(raw_q)
    if q > 0 or kind_q:
        item["quantity"] = q
        item["_invoice_quantity"] = q
    if kind_q == "pack":
        item["unit"] = label_q or (item.get("unit") or "كرتون")
    elif kind_q == "piece":
        item["unit"] = label_q or (item.get("unit") or "قطعة")
    return item


def apply_memory_pack(item: dict, memory, part_number: str = "") -> bool:
    """إن وُجد عامل كرتون في الذاكرة: حوّل تلقائياً (عدد كراتين × قطع/كرتون).

    Returns:
        True إذا تم تطبيق التحويل.
    """
    part = (part_number or item.get("part_number") or item.get("suggested_part_number") or "").strip()
    desc = (item.get("description") or "").strip()
    if not desc:
        return False

    factor, label = memory.lookup_pack(desc, part)
    if not factor or factor < 1:
        return False

    # وجود عامل في الذاكرة ⇒ هذا الصنف يُباع بالكرتون
    if resolve_unit_kind(item) != "pack":
        item["unit"] = item.get("unit") or label or "كرتون"
        item["_unit_kind"] = "pack"
        item["_unit_label"] = item.get("unit") or "كرتون"

    try:
        inv = invoice_carton_count(item)
    except (TypeError, ValueError):
        inv = 0.0
    set_invoice_cartons(item, inv)
    item["_pack_factor"] = int(factor)
    item["_needs_pack_factor"] = False

    if item.get("_qty_resolved_in_review") and item.get("_erp_quantity"):
        try:
            existing = float(item["_erp_quantity"])
            expected = pack_pieces_total(inv, int(factor))
            if abs(existing - expected) < 0.02:
                apply_pack_price_conversion(item)
                return True
        except (TypeError, ValueError):
            pass

    total = pack_pieces_total(inv, int(factor))
    item["_erp_quantity"] = total
    item["quantity"] = total
    item["_qty_resolved_in_review"] = True
    apply_pack_price_conversion(item)
    return True


def capture_invoice_unit_cost(item: dict) -> None:
    """حفظ سعر الفاتورة الأصلي (قبل تحويل كرتون → قطعة)."""
    if item.get("_invoice_unit_cost") is not None:
        return
    try:
        cost = float(item.get("unit_cost", 0) or 0)
    except (TypeError, ValueError):
        cost = 0.0
    if cost > 0:
        item["_invoice_unit_cost"] = cost


def _pack_factor_int(item: dict) -> int:
    factor = item.get("_pack_factor") or item.get("pieces_per_unit")
    try:
        f = int(float(factor)) if factor else 0
    except (TypeError, ValueError):
        f = 0
    return f if f > 0 else 0


def erp_unit_cost_for_injection(item: dict) -> float:
    """سعر القطعة في ERP = سعر الكرتون ÷ قطع/كرتون (عند البيع بالكرتون)."""
    capture_invoice_unit_cost(item)

    if item.get("_erp_unit_cost") is not None:
        try:
            return float(item["_erp_unit_cost"])
        except (TypeError, ValueError):
            pass

    try:
        inv_cost = float(item.get("_invoice_unit_cost", item.get("unit_cost", 0)) or 0)
    except (TypeError, ValueError):
        inv_cost = 0.0
    if inv_cost <= 0:
        return 0.0

    factor = _pack_factor_int(item)
    if factor <= 1:
        return inv_cost

    if item.get("_price_is_per_piece"):
        return inv_cost

    unit = (item.get("unit") or item.get("_unit_label") or "").strip()
    if detect_unit_kind(unit) == "piece" and item.get("_unit_kind") != "pack":
        return inv_cost

    is_pack = (
        item.get("_unit_kind") == "pack"
        or item.get("_needs_pack_factor")
        or bool(factor)
    )
    if not is_pack:
        return inv_cost

    per_piece = inv_cost / factor
    if per_piece == int(per_piece):
        return float(int(per_piece))
    return round(per_piece, 4)


def apply_pack_price_conversion(item: dict) -> bool:
    """تحديث unit_cost إلى سعر القطعة عند التحويل بالكرتون."""
    capture_invoice_unit_cost(item)
    erp_cost = erp_unit_cost_for_injection(item)
    if erp_cost <= 0:
        return False
    try:
        before = float(item.get("unit_cost", 0) or 0)
    except (TypeError, ValueError):
        before = 0.0
    item["_erp_unit_cost"] = erp_cost
    if abs(before - erp_cost) > 0.0001 or not before:
        item["unit_cost"] = erp_cost
        return True
    return False


def pack_pieces_total(cartons: float, factor: int) -> float:
    """إجمالي القطع = كراتين × قطع/كرتون (ضرب واحد فقط)."""
    if cartons <= 0 or factor <= 0:
        return cartons
    total = cartons * factor
    return float(int(total)) if total == int(total) else round(total, 4)


def set_invoice_cartons(item: dict, cartons: float) -> None:
    """حفظ عدد الكراتين في الفاتورة — لا يُستبدل بإجمالي القطع."""
    item["_invoice_cartons"] = cartons
    item["_invoice_quantity"] = cartons


def invoice_carton_count(item: dict) -> float:
    """عدد الكراتين/العبوات في الفاتورة (وليس إجمالي القطع)."""
    if item.get("_invoice_cartons") is not None:
        try:
            return float(item["_invoice_cartons"])
        except (TypeError, ValueError):
            pass

    factor = _pack_factor_int(item)
    erp = item.get("_erp_quantity")
    try:
        erp_f = float(erp) if erp is not None else None
    except (TypeError, ValueError):
        erp_f = None

    inv = None
    if item.get("_invoice_quantity") is not None:
        try:
            inv = float(item["_invoice_quantity"])
        except (TypeError, ValueError):
            inv = None

    if inv is not None and factor > 1 and erp_f is not None:
        if abs(inv * factor - erp_f) < max(0.02, erp_f * 0.001):
            return inv
        if abs(inv - erp_f) < 0.001:
            cartons = erp_f / factor
            if cartons >= 1:
                return float(int(cartons)) if cartons == int(cartons) else cartons

    if inv is not None:
        return inv

    raw = item.get("_qty_text")
    if raw is not None and str(raw).strip():
        q, kind, _ = parse_quantity_text(raw)
        if q > 0:
            return q
    try:
        q = float(item.get("quantity", 0) or 0)
    except (TypeError, ValueError):
        return 0.0
    if factor > 1 and erp_f is not None and abs(q - erp_f) < 0.001:
        return erp_f / factor
    return q


def merge_unit_rows(items: list) -> list:
    """دمج صف الوحدة مع الصنف المجاور (قبله أو بعده)."""
    if not items:
        return items

    out: list = []
    pending_unit = ""

    for item in items:
        if is_unit_only_row(item):
            u = (item.get("unit") or item.get("description") or "").strip()
            if u:
                pending_unit = u
                if out and not (out[-1].get("unit") or "").strip():
                    out[-1]["unit"] = u
            continue

        it = dict(item)
        if pending_unit and not (it.get("unit") or "").strip():
            it["unit"] = pending_unit
            pending_unit = ""
        out.append(it)

    return out


def detect_unit_kind_from_texts(*texts: str) -> str:
    """أولوية: كرتون إن وُجد في أي نص."""
    for t in texts:
        k = detect_unit_kind(t or "")
        if k == "pack":
            return "pack"
    for t in texts:
        k = detect_unit_kind(t or "")
        if k == "piece":
            return "piece"
    return ""


def resolve_unit_kind(item: dict) -> str:
    """تمييز كرتون vs قطعة vs كمية مباشرة."""
    if item.get("_pack_factor"):
        return "pack"

    unit = (item.get("unit") or "").strip()
    desc = (item.get("description") or "").strip()
    qty_text = str(item.get("_qty_text") or item.get("quantity") or "")

    kind = detect_unit_kind_from_texts(unit, qty_text, desc if len(desc) <= UNIT_ONLY_MAX_LEN else "")
    if kind == "pack":
        return "pack"
    if kind == "piece":
        return "piece"

    if item.get("_force_pack"):
        return "pack"

    return ""


def annotate_pack_items(items: list) -> list:
    """تحديد البنود التي تحتاج تحويل كمية (كرتون → قطع فقط)."""
    for item in items:
        unit = (item.get("unit") or "").strip()
        desc = (item.get("description") or "").strip()
        kind = resolve_unit_kind(item)

        try:
            inv_qty = float(item.get("quantity") or 0)
        except (TypeError, ValueError):
            inv_qty = 0

        item["_invoice_quantity"] = inv_qty
        item["_unit_kind"] = kind
        if kind == "pack":
            item["_unit_label"] = unit or "كرتون"
        elif kind == "piece":
            item["_unit_label"] = unit or "قطعة"
        else:
            item["_unit_label"] = unit

        explicit = item.get("pieces_per_unit")
        if explicit is not None:
            try:
                explicit = int(float(explicit))
            except (TypeError, ValueError):
                explicit = 0
            if explicit > 1 and kind == "pack":
                item["_pack_factor"] = explicit
                item["_needs_pack_factor"] = False
                item["quantity"] = inv_qty * explicit
                item["_erp_quantity"] = item["quantity"]
                capture_invoice_unit_cost(item)
                apply_pack_price_conversion(item)
                continue

        if kind == "pack" and inv_qty > 0:
            item["_needs_pack_factor"] = True
            # لا تضع _erp_quantity = عدد الكراتين — يُحسب لاحقاً (كراتين × قطع/كرتون)
            item["_erp_quantity"] = None
            item["quantity"] = inv_qty  # للعرض: عدد الكراتين في الفاتورة
        else:
            item["_needs_pack_factor"] = False
            item["_erp_quantity"] = inv_qty
            item["quantity"] = inv_qty

    return items


def erp_quantity_for_injection(item: dict) -> tuple[float, bool]:
    """كمية ERP = كراتين × قطع/كرتون (ضرب واحد — بدون تكرار).

    Returns:
        (quantity, needs_resolve_via_callback)
    """
    if item.get("_qty_resolved_in_review") and item.get("_erp_quantity") is not None:
        try:
            q = float(item["_erp_quantity"])
            if q > 0:
                return q, False
        except (TypeError, ValueError):
            pass

    inv = invoice_carton_count(item)
    f_int = _pack_factor_int(item)
    is_pack = (
        item.get("_unit_kind") == "pack"
        or item.get("_needs_pack_factor")
        or f_int > 0
    )

    if f_int > 0 and inv > 0:
        return pack_pieces_total(inv, f_int), False

    if is_pack and inv > 0:
        return 0.0, True

    try:
        return float(item.get("_erp_quantity", item.get("quantity", inv))), False
    except (TypeError, ValueError):
        return inv, False


def pack_factor_from_description(desc: str) -> int:
    """استخراج عامل من النص مثل (12*1) أو 12*1."""
    s = desc or ""
    m = re.search(r"\(\s*(\d+)\s*\*\s*(\d+)\s*\)", s)
    if m:
        return max(int(m.group(1)), int(m.group(2)))
    m = re.search(r"(\d+)\s*\*\s*(\d+)", s)
    if m:
        return max(int(m.group(1)), int(m.group(2)))
    return 0


def should_default_carton_mode(item: dict, invoice_qty: float, pack_factor: int = 0) -> bool:
    """هل نعرض وضع الكرتون افتراضياً (وليس كمية مباشرة)؟"""
    if pack_factor and pack_factor > 0:
        return True
    if item.get("_unit_kind") == "pack" or item.get("_force_pack"):
        return True
    unit = (item.get("unit") or item.get("_unit_label") or "").strip()
    uk = detect_unit_kind(unit)
    if uk == "piece":
        return False
    if uk == "pack":
        return True
    if pack_factor_from_description(item.get("description") or ""):
        return True
    return invoice_qty >= 1 and uk != "piece"


def postprocess_invoice_items(items: list, memory=None) -> list:
    items = merge_unit_rows(items)
    for item in items:
        normalize_item_quantities(item)
        capture_invoice_unit_cost(item)
    items = annotate_pack_items(items)
    if memory:
        for item in items:
            desc = item.get("description", "")
            part = item.get("part_number", "")
            hint = pack_factor_from_description(desc)
            if hint and not item.get("_pack_factor"):
                item["_pack_factor"] = hint
                item["_unit_kind"] = "pack"
            if item.get("_unit_kind") == "pack" or memory.lookup_pack(desc, part)[0]:
                apply_memory_pack(item, memory)
    return items
