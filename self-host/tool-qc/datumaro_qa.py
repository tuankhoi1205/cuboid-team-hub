#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
datumaro_qa.py - Kiem tra chat luong tu dong cho du lieu 3D LiDAR (Datumaro 1.0 JSON)

Cac kiem tra:
  1. Scale_Sync     : kich thuoc (scale) cua 1 track id co dong nhat qua cac frame khong (mac dinh: vehicle)
  2. Size_Range     : class + kich thuoc co nam trong nguong cho phep khong
  3. Z_Range        : z cua obj nam ngoai [-3, 3] -> cao/thap hon mat duong
  4. Rotation_Jump  : goc xoay (yaw) doi dot ngot > 75 do so voi frame truoc
  5. Overlap        : chong lan giua cac obj (IoU tren mat phang BEV: tam + kich thuoc + goc xoay)
  6. Distance       : obj cach goc toa do > 100 m
  + Data_Issues     : thieu track_id, track_id trung trong 1 frame, class la, cuboid loi

Cach dung:
  python3 datumaro_qa.py                        # mo hop thoai chon file JSON + dat ten file Excel
  python3 datumaro_qa.py input.json             # report mac dinh: <ten_json>_qa_report.xlsx canh file JSON
  python3 datumaro_qa.py input.json -o report   # dat ten report (tu them .xlsx)
  python3 datumaro_qa.py input.json --config qa_config.json
  python3 datumaro_qa.py --dump-config > qa_config.json  # xuat nguong mac dinh de chinh sua
  python3 datumaro_qa.py --doctor               # kiem tra moi truong (python, openpyxl, hop thoai)

Ubuntu: sudo apt install python3-openpyxl python3-tk   (python3-tk chi can cho hop thoai chon file)

Yeu cau: Python >= 3.8, openpyxl.  (tkinter chi can khi dung hop thoai chon file)
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# --------------------------------------------------------------------------------------
# CAU HINH MAC DINH (co the ghi de bang --config file.json)
# --------------------------------------------------------------------------------------
DEFAULT_CONFIG = {
    # Ten label (da chuan hoa: chu thuong, ky tu la -> "_") -> nhom class
    "class_groups": {
        "vehicle": ["vehicle", "vehicles", "car", "truck", "bus", "van", "suv", "sedan", "pickup", "minibus"],
        "two_wheel": ["two_wheel", "two_wheels", "two_wheeler", "twowheel", "twowheels", "motorbike",
                      "motorcycle", "bicycle", "bike"],
        "pedestrian": ["pedestrian", "pedestrians", "person", "human", "people"],
    },
    # Nguong kich thuoc (m): length = scale[0] (x), width = scale[1] (y), height = scale[2] (z)
    "size_limits": {
        "vehicle":    {"length": [3.2, 5.5], "width": [1.6, 2.2], "height": [1.5, 1.9]},
        "two_wheel":  {"length": [1.5, 2.0], "width": [0.6, 0.9], "height": [1.5, 1.8]},
        "pedestrian": {"length": [0.65, 1.0], "width": [0.65, 1.0], "height": [1.2, 1.9]},
    },
    "size_over_hint": {"vehicle": "có thể là xe bus/truck"},   # ghi chu khi LON hon nguong
    "size_eps": 0.001,                 # sai so (m) khi so sanh voi nguong

    "scale_sync_groups": ["vehicle"],  # nhom class ap dung kiem tra dong bo scale
    "scale_sync_tol": 0.01,            # (m) lech > tol tren bat ky truc nao => sai

    "z_min": -3.0,                     # z < z_min  => thap hon mat duong
    "z_max": 3.0,                      # z > z_max  => cao hon mat duong

    "rotation_unit": "rad",            # don vi rotation trong JSON: "rad" (Datumaro/CVAT) hoac "deg"
    "max_rotation_jump_deg": 75.0,     # |yaw(t) - yaw(t-1)| > nguong => doi huong dot ngot
    "max_frame_gap": 1,                # chi so sanh voi frame truoc neu cach nhau <= gap frame
    "rotation_check_groups": ["vehicle", "two_wheel", "pedestrian"],

    # Cho phep chong lan toi da theo class. 0 = khong cho phep (bat ky chong lan nao cung warning).
    # Cap obj dung nguong NHO HON cua 2 class (vehicle + bat ky => 0).
    "overlap_allowed": {"vehicle": 0.0, "two_wheel": 0.5, "pedestrian": 0.5},
    "overlap_metric": "iou",           # "iou" (giao/hop) hoac "ioa" (giao/dien tich obj nho hon)
    "overlap_min_area": 0.001,         # m2 - bo qua giao nho hon (cham canh / sai so so)

    "max_distance": 100.0,             # m, khoang cach 3D tu goc toa do (0,0,0) toi tam obj

    # Track ID hien thi trong Excel = track_id trong JSON + offset. Datumaro xuat track_id tu 0,
    # CVAT hien thi tu 1 -> offset = 1. Dat 0 neu muon giu nguyen gia tri trong JSON.
    "track_id_offset": 1,

    # Tuy chon cho hop thoai chon file
    "default_input": "",               # duong dan file JSON mac dinh (neu co)
}

AXES = ("length", "width", "height")
SETTINGS_FILE = Path.home() / ".datumaro_qa_settings.json"


# --------------------------------------------------------------------------------------
# TIEN ICH
# --------------------------------------------------------------------------------------
def deep_merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def norm_name(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).lower()).strip("_")


def classify(label: str, lookup: dict):
    """Ten label -> nhom class. Chap nhan so nhieu ('vehicles', 'two-wheels') bang cach bo 's' cuoi."""
    n = norm_name(label)
    return lookup.get(n) or (lookup.get(n[:-1]) if n.endswith("s") else None)


def compress_frames(frames) -> str:
    """[1,2,3,7,9,10] -> '1-3, 7, 9-10'"""
    fs = sorted(set(frames))
    parts, i = [], 0
    while i < len(fs):
        j = i
        while j + 1 < len(fs) and fs[j + 1] == fs[j] + 1:
            j += 1
        parts.append(str(fs[i]) if i == j else f"{fs[i]}-{fs[j]}")
        i = j + 1
    return ", ".join(parts)


def fmt_size(s) -> str:
    return f"{s[0]:.2f} x {s[1]:.2f} x {s[2]:.2f}"


class Obj:
    __slots__ = ("frame", "item_id", "ann_id", "track", "has_track",
                 "label", "group", "pos", "rot", "scale")

    def __init__(self, frame, item_id, ann_id, track, has_track, label, group, pos, rot, scale):
        self.frame, self.item_id, self.ann_id = frame, item_id, ann_id
        self.track, self.has_track = track, has_track
        self.label, self.group = label, group
        self.pos, self.rot, self.scale = pos, rot, scale

    @property
    def yaw(self) -> float:
        return self.rot[2]


# --------------------------------------------------------------------------------------
# DOC DATUMARO 1.0
# --------------------------------------------------------------------------------------
def frame_of(item: dict, idx: int) -> int:
    attr = item.get("attr") or {}
    if "frame" in attr:
        try:
            return int(attr["frame"])
        except (TypeError, ValueError):
            pass
    m = re.search(r"(\d+)(?!.*\d)", str(item.get("id", "")))
    return int(m.group(1)) if m else idx


def display_track_id(tid, offset: int) -> str:
    """track_id trong JSON (0-based) -> so hien thi nhu tren CVAT (1-based)."""
    try:
        return str(int(str(tid).strip()) + offset)
    except (TypeError, ValueError):
        return str(tid)


def load_objects(path: str, cfg: dict):
    """Tra ve (objs, issues, meta). objs: list[Obj] (chi cuboid_3d)."""
    with open(path, "r", encoding="utf-8-sig") as f:      # utf-8-sig: chap nhan ca file co BOM (tao tren Windows)
        data = json.load(f)

    version = str(data.get("dm_format_version", "")) or "(khong co)"
    labels = [c.get("name", "") for c in
              ((data.get("categories") or {}).get("label") or {}).get("labels", [])]

    lookup = {}
    for grp, names in cfg["class_groups"].items():
        lookup[norm_name(grp)] = grp
        for n in names:
            lookup[norm_name(n)] = grp

    objs, issues = [], []
    unknown_labels = Counter()
    n_items = 0
    frame_items = {}
    for idx, item in enumerate(data.get("items", [])):
        n_items += 1
        frame = frame_of(item, idx)
        item_id = str(item.get("id", ""))
        frame_items[frame] = item_id
        for ann in item.get("annotations", []):
            if ann.get("type") != "cuboid_3d":
                continue
            attrs = ann.get("attributes") or {}
            if attrs.get("outside"):
                continue
            ann_id = ann.get("id", "")
            try:
                pos = [float(v) for v in ann["position"]][:3]
                rot = [float(v) for v in ann["rotation"]][:3]
                scl = [abs(float(v)) for v in ann["scale"]][:3]
                if not (len(pos) == len(rot) == len(scl) == 3):
                    raise ValueError("can du 3 gia tri")
            except (KeyError, TypeError, ValueError) as e:
                issues.append(dict(kind="Cuboid lỗi", frame=frame, item_id=item_id, ann_id=ann_id,
                                   detail=f"position/rotation/scale không hợp lệ: {e}"))
                continue
            if cfg["rotation_unit"] == "deg":
                rot = [math.radians(r) for r in rot]

            lid = ann.get("label_id")
            label = labels[lid] if isinstance(lid, int) and 0 <= lid < len(labels) else f"label_{lid}"
            group = classify(label, lookup)
            if group is None:
                unknown_labels[label] += 1

            tid = attrs.get("track_id")
            has_track = tid is not None and str(tid) != ""
            track = (display_track_id(tid, cfg["track_id_offset"]) if has_track
                     else f"(no_track)#{ann_id}@{frame}")
            if not has_track:
                issues.append(dict(kind="Thiếu track_id", frame=frame, item_id=item_id,
                                   ann_id=ann_id, detail=f"label={label}"))
            objs.append(Obj(frame, item_id, ann_id, track, has_track, label, group, pos, rot, scl))

    for lb, n in unknown_labels.items():
        issues.append(dict(kind="Class không nhận dạng", frame="", item_id="", ann_id="",
                           detail=f"label '{lb}' ({n} obj) không thuộc nhóm nào trong class_groups -> bỏ qua các kiểm tra theo class"))

    # track_id trung trong 1 frame
    seen = defaultdict(list)
    for o in objs:
        if o.has_track:
            seen[(o.frame, o.track)].append(o)
    for (fr, tr), lst in seen.items():
        if len(lst) > 1:
            issues.append(dict(kind="track_id trùng trong 1 frame", frame=fr, item_id=lst[0].item_id,
                               ann_id=",".join(str(x.ann_id) for x in lst),
                               detail=f"track {tr} xuất hiện {len(lst)} lần trong frame"))

    meta = dict(version=version, n_items=n_items, n_objs=len(objs), frame_items=frame_items,
                n_tracks=len({o.track for o in objs if o.has_track}))
    return objs, issues, meta


def group_tracks(objs):
    tracks = defaultdict(list)
    for o in objs:
        tracks[o.track].append(o)
    for lst in tracks.values():
        lst.sort(key=lambda o: o.frame)
    return tracks


# --------------------------------------------------------------------------------------
# 1. SCALE SYNC
# --------------------------------------------------------------------------------------
CHECKS = [
    # (key, ten hien thi, ky hieu trong sheet Matrix)
    ("scale", "Scale không đồng bộ", "S"),
    ("size", "Kích thước ngoài ngưỡng", "K"),
    ("z", "Z ngoài ngưỡng", "Z"),
    ("rot", "Đổi hướng đột ngột", "H"),
    ("overlap", "Chồng lấn", "O"),
    ("dist", "Quá xa", "D"),
]
CHECK_NAME = {k: n for k, n, _ in CHECKS}
CHECK_CODE = {k: c for k, _, c in CHECKS}


def rec(o, check, detail, value="", ref="", other=""):
    """1 issue cua 1 track tai 1 frame."""
    return {"frame": o.frame, "item_id": o.item_id, "track": o.track, "label": o.label,
            "check": check, "detail": detail, "value": value, "ref": ref, "other": other}


def check_scale_sync(tracks, cfg):
    """Moi track (nhom scale_sync_groups) phai co scale khong doi. Chuan = trung vi theo tung truc."""
    recs = []
    tol = cfg["scale_sync_tol"] + 1e-9           # +1e-9: tranh sai so so thuc (4.24 - 4.23 > 0.01)
    for tid, lst in tracks.items():
        lst = [o for o in lst if o.group in cfg["scale_sync_groups"]]
        if len(lst) < 2:
            continue
        ref = [sorted(o.scale[a] for o in lst)[len(lst) // 2] for a in range(3)]
        for o in lst:
            d = [o.scale[a] - ref[a] for a in range(3)]
            if any(abs(x) > tol for x in d):
                recs.append(rec(o, "scale",
                                f"Scale lệch so với kích thước chuẩn của track "
                                f"(chênh L {d[0]:+.2f}, W {d[1]:+.2f}, H {d[2]:+.2f} m)",
                                fmt_size(o.scale), fmt_size(ref)))
    return recs


# --------------------------------------------------------------------------------------
# 2. SIZE RANGE
# --------------------------------------------------------------------------------------
def check_size(objs, cfg):
    eps = cfg["size_eps"]
    recs = []
    for o in objs:
        lim = cfg["size_limits"].get(o.group)
        if not lim:
            continue
        parts, over, under = [], False, False
        for ai, axis in enumerate(AXES):
            lo, hi = lim[axis]
            v = o.scale[ai]
            if v > hi + eps:
                parts.append(f"{axis.capitalize()} {v:.2f} > {hi:g}")
                over = True
            elif v < lo - eps:
                parts.append(f"{axis.capitalize()} {v:.2f} < {lo:g}")
                under = True
        if not parts:
            continue
        hint = cfg["size_over_hint"].get(o.group)
        notes = []
        if over:
            notes.append("lớn hơn ngưỡng - " + (hint if hint else "cần kiểm tra kích thước"))
        if under:
            notes.append("nhỏ hơn ngưỡng - cần kiểm tra kích thước")
        ref = ", ".join(f"{axis[0].upper()} {lim[axis][0]:g}~{lim[axis][1]:g}" for axis in AXES)
        recs.append(rec(o, "size", "; ".join(parts) + " (" + "; ".join(notes) + ")", fmt_size(o.scale), ref))
    return recs


# --------------------------------------------------------------------------------------
# 3. Z RANGE
# --------------------------------------------------------------------------------------
def check_z(objs, cfg):
    recs = []
    for o in objs:
        z = o.pos[2]
        if z > cfg["z_max"]:
            d = f"z = {z:.2f} > {cfg['z_max']:g}: obj cao hơn mặt đường"
        elif z < cfg["z_min"]:
            d = f"z = {z:.2f} < {cfg['z_min']:g}: obj thấp hơn mặt đường"
        else:
            continue
        recs.append(rec(o, "z", d, round(z, 3), f"{cfg['z_min']:g} ~ {cfg['z_max']:g}"))
    return recs


# --------------------------------------------------------------------------------------
# 4. ROTATION JUMP
# --------------------------------------------------------------------------------------
def angle_diff_deg(a: float, b: float) -> float:
    d = (b - a + math.pi) % (2 * math.pi) - math.pi
    return abs(math.degrees(d))


def check_rotation(tracks, cfg):
    recs = []
    thr, gap = cfg["max_rotation_jump_deg"], cfg["max_frame_gap"]
    for tid, lst in tracks.items():
        lst = [o for o in lst if o.group in cfg["rotation_check_groups"]]
        for prev, cur in zip(lst, lst[1:]):
            if cur.frame - prev.frame > gap:
                continue
            d = angle_diff_deg(prev.yaw, cur.yaw)
            if d > thr:
                recs.append(rec(cur, "rot",
                                f"Obj thay đổi hướng đột ngột {d:.1f}° "
                                f"(yaw {math.degrees(prev.yaw):.1f}° ở frame {prev.frame} -> "
                                f"{math.degrees(cur.yaw):.1f}° ở frame {cur.frame})",
                                round(d, 2), f"≤ {thr:g}°"))
    return recs


# --------------------------------------------------------------------------------------
# 5. OVERLAP (IoU tren mat phang BEV)
# --------------------------------------------------------------------------------------
def rect_corners(x, y, l, w, yaw):
    """4 dinh hinh chu nhat (nguoc chieu kim dong ho) - tam (x,y), dai l (truc x cuc bo), rong w, xoay yaw."""
    c, s = math.cos(yaw), math.sin(yaw)
    hl, hw = l / 2.0, w / 2.0
    return [(x + px * c - py * s, y + px * s + py * c)
            for px, py in ((hl, hw), (-hl, hw), (-hl, -hw), (hl, -hw))]


def poly_area(pts) -> float:
    a = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def clip_convex(subject, clipper):
    """Sutherland-Hodgman: giao 2 da giac loi (deu nguoc chieu kim dong ho)."""
    def inside(p, a, b):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-12

    def intersect(p, q, a, b):
        x1, y1, x2, y2 = p[0], p[1], q[0], q[1]
        x3, y3, x4, y4 = a[0], a[1], b[0], b[1]
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(den) < 1e-15:
            return q
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))

    out = list(subject)
    for i in range(len(clipper)):
        a, b = clipper[i], clipper[(i + 1) % len(clipper)]
        inp, out = out, []
        if not inp:
            break
        s = inp[-1]
        for e in inp:
            if inside(e, a, b):
                if not inside(s, a, b):
                    out.append(intersect(s, e, a, b))
                out.append(e)
            elif inside(s, a, b):
                out.append(intersect(s, e, a, b))
            s = e
    return out


def bev_overlap(a: Obj, b: Obj):
    """Tra ve (dien tich giao, IoU, IoA) cua 2 obj tren mat phang BEV."""
    la, wa, lb, wb = a.scale[0], a.scale[1], b.scale[0], b.scale[1]
    ra = 0.5 * math.hypot(la, wa)
    rb = 0.5 * math.hypot(lb, wb)
    if math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) > ra + rb:   # loai nhanh
        return 0.0, 0.0, 0.0
    pa = rect_corners(a.pos[0], a.pos[1], la, wa, a.yaw)
    pb = rect_corners(b.pos[0], b.pos[1], lb, wb, b.yaw)
    inter_pts = clip_convex(pa, pb)
    inter = poly_area(inter_pts) if len(inter_pts) >= 3 else 0.0
    area_a, area_b = la * wa, lb * wb
    union = area_a + area_b - inter
    iou = inter / union if union > 0 else 0.0
    ioa = inter / min(area_a, area_b) if min(area_a, area_b) > 0 else 0.0
    return inter, iou, ioa


def check_overlap(objs, cfg):
    """Moi cap chong lan tao 2 issue (1 cho moi track) de loc theo track khong bi sot."""
    by_frame = defaultdict(list)
    for o in objs:
        if o.group in cfg["overlap_allowed"]:
            by_frame[o.frame].append(o)

    metric = cfg["overlap_metric"].lower()
    recs = []
    for frame, lst in by_frame.items():
        for i in range(len(lst)):
            for j in range(i + 1, len(lst)):
                a, b = lst[i], lst[j]
                inter, iou, ioa = bev_overlap(a, b)
                if inter < cfg["overlap_min_area"]:
                    continue
                allowed = min(cfg["overlap_allowed"][a.group], cfg["overlap_allowed"][b.group])
                val = ioa if metric == "ioa" else iou
                if allowed > 0 and val <= allowed:
                    continue
                rule = ("Không cho phép chồng lấn" if allowed <= 0
                        else f"Cho phép tối đa {allowed * 100:g}% ({metric.upper()})")
                stats = f"IoU {iou:.3f}, IoA {ioa:.3f}, diện tích giao {inter:.3f} m²"
                recs.append(rec(a, "overlap", f"Chồng lấn với track {b.track} ({b.label}): {stats}",
                                round(val, 4), rule, other=b.track))
                recs.append(rec(b, "overlap", f"Chồng lấn với track {a.track} ({a.label}): {stats}",
                                round(val, 4), rule, other=a.track))
    return recs


# --------------------------------------------------------------------------------------
# 6. DISTANCE
# --------------------------------------------------------------------------------------
def check_distance(objs, cfg):
    recs = []
    lim = cfg["max_distance"]
    for o in objs:
        d = math.sqrt(sum(v * v for v in o.pos))
        if d > lim:
            recs.append(rec(o, "dist", f"Cách gốc tọa độ {d:.2f} m (> {lim:g} m): obj ở quá xa, cần kiểm tra",
                            round(d, 2), f"≤ {lim:g} m"))
    return recs


def _sort_key(t):
    s = str(t)
    return (0, int(s), "") if s.isdigit() else (1, 0, s)


# --------------------------------------------------------------------------------------
# XUAT EXCEL
# --------------------------------------------------------------------------------------
ISSUE_HEADERS = ["Loại", "Frame", "Item ID", "Annotation ID", "Chi tiết"]


def _tcell(t):
    """Track ID dang so de Excel sap xep / loc dung (track khong co id giu nguyen chuoi)."""
    return int(t) if str(t).isdigit() else t


def write_report(out_path: str, results: dict, objs: list, meta: dict, in_path: str, cfg: dict):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.properties import PageSetupProperties

    head_fill = PatternFill("solid", fgColor="1F4E78")
    head_font = Font(bold=True, color="FFFFFF")
    order = {k: i for i, (k, _, _) in enumerate(CHECKS)}
    code_order = {c: i for i, (_, _, c) in enumerate(CHECKS)}

    recs = [r for k, _, _ in CHECKS for r in results[k]]
    recs.sort(key=lambda r: (_sort_key(r["track"]), r["frame"], order[r["check"]]))

    # ---- tong hop du lieu cho cac sheet
    presence, label_of = defaultdict(set), {}
    frame_set = set(meta["frame_items"])
    for o in objs:
        presence[o.track].add(o.frame)
        label_of.setdefault(o.track, o.label)
        frame_set.add(o.frame)
    frame_set.update(r["frame"] for r in recs)
    all_frames = sorted(frame_set)
    objs_per_frame = Counter(o.frame for o in objs)

    by_track = defaultdict(lambda: defaultdict(set))     # track -> check -> {frame}
    track_n = Counter()                                  # track -> so issue
    by_frame = defaultdict(lambda: defaultdict(list))    # frame -> check -> [track | cap track]
    frame_n = Counter()
    frame_tracks = defaultdict(set)
    codes = defaultdict(set)                             # (track, frame) -> {ky hieu}
    for r in recs:
        t, f, k = r["track"], r["frame"], r["check"]
        by_track[t][k].add(f)
        track_n[t] += 1
        frame_n[f] += 1
        frame_tracks[f].add(t)
        codes[(t, f)].add(CHECK_CODE[k])
        if k == "overlap":
            pair = "&".join(sorted((str(t), str(r["other"])), key=_sort_key))
            if pair not in by_frame[f][k]:
                by_frame[f][k].append(pair)
        elif str(t) not in by_frame[f][k]:
            by_frame[f][k].append(str(t))

    wb = Workbook()

    def table(title, header, rows, wrap=()):
        ws = wb.create_sheet(title)
        ws.append(header)
        for c in ws[1]:
            c.fill, c.font = head_fill, head_font
            c.alignment = Alignment(vertical="center", wrap_text=True)
        for row in rows:
            ws.append(row)
        if not rows:
            ws.append(["(không có)"])
        ws.freeze_panes = "A2"
        if rows:
            ws.auto_filter.ref = f"A1:{get_column_letter(len(header))}{ws.max_row}"
        for ci, h in enumerate(header, 1):
            w = max([len(str(h))] + [len(str(r[ci - 1])) for r in rows[:500]]) + 2
            ws.column_dimensions[get_column_letter(ci)].width = min(max(w, 8), 60)
        for ci in wrap:
            for row in ws.iter_rows(min_row=2, min_col=ci, max_col=ci):
                row[0].alignment = Alignment(wrap_text=True, vertical="top")
        return ws

    # ---- Summary
    ws = wb.active
    ws.title = "Summary"
    ws.append(["BÁO CÁO KIỂM TRA CHẤT LƯỢNG DỮ LIỆU 3D (Datumaro)"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    off = cfg["track_id_offset"]
    for k, v in [
        ("File đầu vào", os.path.abspath(in_path)),
        ("Thời gian chạy", datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        ("dm_format_version", meta["version"]),
        ("Số frame (item)", meta["n_items"]),
        ("Số cuboid_3d", meta["n_objs"]),
        ("Số track id", meta["n_tracks"]),
        ("Track ID hiển thị", f"= track_id trong JSON + {off} (khớp số thứ tự trên CVAT)" if off
         else "= track_id trong JSON"),
    ]:
        ws.append([k, v])
    ws.append([])
    ws.append(["Kiểm tra", "Ký hiệu (Matrix)", "Số issue (track x frame)", "Số track bị ảnh hưởng",
               "Số frame bị ảnh hưởng"])
    for c in ws[ws.max_row]:
        c.fill, c.font = head_fill, head_font
        c.alignment = Alignment(wrap_text=True, vertical="center")
    for k, name, code in CHECKS:
        rs = results[k]
        ws.append([name, code, len(rs), len({r["track"] for r in rs}), len({r["frame"] for r in rs})])
    ws.append(["Lỗi dữ liệu (sheet Data_Issues)", "", len(results["issues"]), "", ""])
    ws.append([])
    ws.append(["Các sheet"])
    ws.cell(ws.max_row, 1).font = Font(bold=True)
    for name, desc in [
        ("By_Track", "Mỗi dòng 1 track có issue. Mỗi cột là 1 loại kiểm tra: danh sách frame bị issue và (số frame)."),
        ("By_Frame", "Mỗi dòng 1 frame có issue. Mỗi cột là 1 loại kiểm tra: các Track ID bị issue (chồng lấn ghi cặp A&B)."),
        ("Matrix", "Ma trận Track ID x Frame, ô ghi ký hiệu loại issue và tô màu - nhìn nhanh track nào lỗi ở frame nào."),
        ("All_Issues", "Toàn bộ issue, mỗi dòng 1 track tại 1 frame. Dùng bộ lọc ở tiêu đề để lọc theo Frame hoặc Track ID."),
        ("Data_Issues", "Thiếu track_id, track_id trùng trong 1 frame, class lạ, cuboid lỗi."),
    ]:
        ws.append([name, desc])
    ws.append([])
    ws.append(["Ngưỡng đang dùng"])
    ws.cell(ws.max_row, 1).font = Font(bold=True)
    for k, v in cfg.items():
        if k != "class_groups":
            ws.append([k, json.dumps(v, ensure_ascii=False)])
    for col, w in zip("ABCDE", (34, 18, 24, 22, 22)):
        ws.column_dimensions[col].width = w

    # ---- By_Track: 1 dong / track co issue
    rows = []
    for t in sorted(by_track, key=_sort_key):
        pf = sorted(presence.get(t, ()))
        row = [_tcell(t), label_of.get(t, ""), len(pf), pf[0] if pf else "", pf[-1] if pf else "",
               track_n[t], len(set().union(*by_track[t].values()))]
        for k, _, _ in CHECKS:
            fs = by_track[t].get(k)
            row.append(f"{compress_frames(fs)} ({len(fs)})" if fs else "")
        rows.append(row)
    table("By_Track", ["Track ID", "Class", "Số frame có mặt", "Frame đầu", "Frame cuối", "Tổng số issue",
                       "Số frame có issue"] + [n for _, n, _ in CHECKS], rows,
          wrap=range(8, 8 + len(CHECKS)))

    # ---- By_Frame: 1 dong / frame co issue
    rows = []
    for f in sorted(by_frame):
        row = [f, meta["frame_items"].get(f, ""), objs_per_frame.get(f, 0), frame_n[f], len(frame_tracks[f])]
        for k, _, _ in CHECKS:
            items = by_frame[f].get(k, [])
            if k == "overlap":
                items = sorted(items, key=lambda p: [_sort_key(x) for x in p.split("&")])
                row.append("; ".join(items))
            else:
                row.append(", ".join(sorted(items, key=_sort_key)))
        rows.append(row)
    table("By_Frame", ["Frame", "Item ID", "Số obj trong frame", "Tổng số issue", "Số track có issue"]
          + [n for _, n, _ in CHECKS], rows, wrap=range(6, 6 + len(CHECKS)))

    # ---- Matrix: Track ID x Frame
    ws = wb.create_sheet("Matrix")
    ws.append(["Ký hiệu: " + "   |   ".join(f"{c} = {n}" for _, n, c in CHECKS)])
    ws.append(["Màu ô: xanh nhạt = track có mặt, không issue   |   vàng = 1 loại issue   |   "
               "cam = từ 2 loại issue trở lên   |   trống = track không có ở frame đó"])
    ws.append(["Track ID", "Class", "Tổng số issue"] + all_frames)
    for c in ws[3]:
        c.fill, c.font = head_fill, head_font
        c.alignment = Alignment(horizontal="center", vertical="center")
    green = PatternFill("solid", fgColor="E2EFDA")
    amber = PatternFill("solid", fgColor="FFE699")
    orange = PatternFill("solid", fgColor="F4B084")
    center, bold = Alignment(horizontal="center"), Font(bold=True)
    for ri, t in enumerate(sorted(set(presence) | set(by_track), key=_sort_key), start=4):
        ws.append([_tcell(t), label_of.get(t, ""), track_n.get(t, 0)])
        pres = presence.get(t, ())
        for ci, f in enumerate(all_frames, start=4):
            cs = codes.get((t, f))
            if cs:
                c = ws.cell(ri, ci, "".join(sorted(cs, key=code_order.get)))
                c.fill, c.font, c.alignment = (orange if len(cs) >= 2 else amber), bold, center
            elif f in pres:
                ws.cell(ri, ci).fill = green
    maxlen = max([len(c) for c in codes.values()] + [1])
    fw = max(5, maxlen + 2, len(str(all_frames[-1] if all_frames else 0)) + 2)
    for col, w in ((1, 10), (2, 14), (3, 14)):
        ws.column_dimensions[get_column_letter(col)].width = w
    for ci in range(4, 4 + len(all_frames)):
        ws.column_dimensions[get_column_letter(ci)].width = fw
    ws.freeze_panes = "D4"
    ws.auto_filter.ref = f"A3:{get_column_letter(3 + len(all_frames))}{ws.max_row}"
    ws.page_setup.orientation = "landscape"                 # in ra giay: vua 1 trang ngang
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0

    # ---- All_Issues: moi dong 1 track tai 1 frame
    rows = [[r["frame"], r["item_id"], _tcell(r["track"]), r["label"], CHECK_NAME[r["check"]], r["detail"],
             r["value"], r["ref"], _tcell(r["other"]) if r["other"] != "" else ""] for r in recs]
    table("All_Issues", ["Frame", "Item ID", "Track ID", "Class", "Loại kiểm tra", "Mô tả", "Giá trị",
                         "Ngưỡng / Chuẩn", "Track liên quan"], rows, wrap=(6, 8))

    # ---- Data_Issues
    table("Data_Issues", ISSUE_HEADERS,
          [[i["kind"], i["frame"], i["item_id"], i["ann_id"], i["detail"]] for i in results["issues"]], wrap=(5,))

    # luu: neu khong ghi duoc (file dang mo / thu muc chi doc) -> thu ten khac, roi thu muc home
    stamp = datetime.now().strftime("%H%M%S")
    p = Path(out_path)
    candidates = [p]  # Web adapter: never write outside the controlled job folder.
    last_err = None
    for i, cand in enumerate(candidates):
        try:
            wb.save(str(cand))
            if i:
                print(f"[!] Khong ghi duoc '{out_path}' ({last_err}). Da luu thanh: {cand}")
            return str(cand)
        except OSError as e:
            last_err = e
    raise last_err


# --------------------------------------------------------------------------------------
# CHON FILE (hop thoai / dong lenh)
# --------------------------------------------------------------------------------------
def _load_settings() -> dict:
    try:
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_settings(d: dict):
    try:
        SETTINGS_FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _clean_path(p: str) -> str:
    return os.path.expanduser(p.strip().strip('"').strip("'"))


def _ask(prompt: str) -> str:
    """input() an toan: stdin dong (pipe/cron/ssh khong tty) -> bao loi ro rang thay vi traceback."""
    try:
        return _clean_path(input(prompt))
    except EOFError:
        print("\n[X] Khong doc duoc tu ban phim. Hay truyen file qua tham so:\n"
              "    python3 datumaro_qa.py file.json -o ten_report")
        sys.exit(1)


def _has_display() -> bool:
    if sys.platform.startswith("linux"):
        return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
    return True


def _ext_dialog(kind, title, initialdir, initialfile, filetypes):
    """Hop thoai goc cua Ubuntu: zenity (GNOME/XFCE/...) hoac kdialog (KDE). (ok, path) hoac (False, '')."""
    import shutil
    import subprocess
    start = os.path.join(initialdir, initialfile) if initialfile else initialdir.rstrip(os.sep) + os.sep
    cmds = []
    zen = shutil.which("zenity")
    if zen:
        c = [zen, "--file-selection", f"--title={title}", f"--filename={start}"]
        if kind == "save":
            c += ["--save", "--confirm-overwrite"]
        for name, pat in filetypes:
            c.append(f"--file-filter={name} | {pat}")
        cmds.append(c)
    kd = shutil.which("kdialog")
    if kd:
        flt = "\n".join(f"{pat}|{name}" for name, pat in filetypes)
        cmds.append([kd, "--title", title, "--getsavefilename" if kind == "save" else "--getopenfilename",
                     start, flt])
    for c in cmds:
        try:
            r = subprocess.run(c, capture_output=True, text=True, timeout=3600)
        except (OSError, subprocess.SubprocessError):
            continue
        if r.returncode == 0:
            return True, r.stdout.strip().split("\n")[0]
        if r.returncode == 1:                       # nguoi dung bam Cancel
            return True, ""
    return False, ""


def _tk_dialog(kind, title, initialdir, initialfile, filetypes, defaultextension=None):
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError:
        return False, ""
    try:
        root = tk.Tk()
    except Exception as e:                                  # TclError: no display, ...
        print(f"[i] Khong mo duoc hop thoai tkinter ({e}).")
        return False, ""
    try:
        root.withdraw()
        try:
            root.attributes("-topmost", True)               # mot so window manager Linux khong ho tro
        except Exception:
            pass
        kw = dict(title=title, initialdir=initialdir, initialfile=initialfile, filetypes=filetypes)
        if kind == "save":
            path = filedialog.asksaveasfilename(defaultextension=defaultextension, **kw)
        else:
            path = filedialog.askopenfilename(**kw)
    finally:
        try:
            root.destroy()
        except Exception:
            pass
    if isinstance(path, (tuple, list)):                     # Tk tren Linux co the tra ve () khi bam Cancel
        path = path[0] if path else ""
    return True, str(path or "")


_GUI_WARNED = False


def _gui_dialog(kind, title, initialdir, initialfile, filetypes, defaultextension=None, use_gui=True):
    """Thu lan luot: (Linux) zenity/kdialog -> tkinter. Khong duoc thi tra ve (False, '') de nhap tay."""
    if not use_gui:
        return False, ""
    if not _has_display():
        print("[i] Khong co man hinh do hoa (SSH/headless) -> nhap duong dan bang tay.")
        return False, ""
    order = (_ext_dialog, _tk_dialog) if sys.platform.startswith("linux") else (_tk_dialog,)
    for fn in order:
        if fn is _tk_dialog:
            ok, path = fn(kind, title, initialdir, initialfile, filetypes, defaultextension)
        else:
            ok, path = fn(kind, title, initialdir, initialfile, filetypes)
        if ok:
            return True, path
    global _GUI_WARNED
    if not _GUI_WARNED:                                      # chi bao 1 lan (hop thoai mo file + luu file)
        _GUI_WARNED = True
        print("[i] Khong mo duoc hop thoai chon file -> nhap tay. "
              "(Ubuntu: sudo apt install zenity   hoac   sudo apt install python3-tk)")
    return False, ""


def pick_input_file(cfg: dict, use_gui: bool = True) -> str:
    st = _load_settings()
    default = cfg.get("default_input") or ""
    init_dir = (str(Path(default).parent) if default and Path(default).parent.exists()
                else st.get("last_input_dir", str(Path.home())))
    if not Path(init_dir).is_dir():
        init_dir = str(Path.home())
    init_file = Path(default).name if default else ""
    ok, path = _gui_dialog("open", "Chon file Datumaro JSON can kiem tra", init_dir, init_file,
                           [("Datumaro JSON", "*.json"), ("Tat ca", "*")], use_gui=use_gui)
    if ok:
        return path
    hint = f" [Enter = {default}]" if default else ""
    return _ask(f"Nhap duong dan file Datumaro JSON{hint}: ") or default


def pick_report_path(in_path: str, cfg: dict, interactive: bool, use_gui: bool = True) -> str:
    default_name = Path(in_path).stem + "_qa_report.xlsx"
    st = _load_settings()
    init_dir = st.get("last_report_dir") or str(Path(in_path).parent)
    if not Path(init_dir).is_dir():
        init_dir = str(Path(in_path).parent)
    if not interactive:
        return str(Path(in_path).parent / default_name)
    ok, path = _gui_dialog("save", "Dat ten file Excel report", init_dir, default_name,
                           [("Excel", "*.xlsx")], defaultextension=".xlsx", use_gui=use_gui)
    if ok:
        return path
    return _ask(f"Ten file Excel report [Enter = {default_name}]: ") or str(Path(in_path).parent / default_name)


def doctor() -> int:
    """In thong tin moi truong de chan doan loi tren may khac."""
    import shutil
    print(f"He dieu hanh : {sys.platform}")
    print(f"Python       : {sys.version.split()[0]}  ({sys.executable})")
    if sys.version_info < (3, 8):
        print("               [X] Can Python >= 3.8")
    try:
        import openpyxl
        print(f"openpyxl     : OK {openpyxl.__version__}")
    except ImportError:
        print("openpyxl     : [X] THIEU -> chay: bash setup_ubuntu.sh   (hoac: sudo apt install python3-openpyxl)")
    try:
        import tkinter  # noqa: F401
        print("tkinter      : OK")
    except ImportError:
        print("tkinter      : khong co (tuy chon) -> sudo apt install python3-tk")
    print(f"zenity       : {shutil.which('zenity') or 'khong co (tuy chon) -> sudo apt install zenity'}")
    print(f"kdialog      : {shutil.which('kdialog') or 'khong co (tuy chon)'}")
    disp = os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY") or ""
    print(f"Man hinh     : {disp or 'khong co (SSH/headless) -> dung duong dan tren dong lenh'}")
    print(f"Locale       : {os.environ.get('LANG', '(khong dat)')}  | stdout: {sys.stdout.encoding}")
    print(f"Thu muc home : {Path.home()}  | ghi duoc: {os.access(str(Path.home()), os.W_OK)}")
    try:
        import openpyxl  # noqa: F811
        have_xl = True
    except ImportError:
        have_xl = False
    gui = _has_display() and (shutil.which("zenity") or shutil.which("kdialog") or _tk_ok())
    print("\nChe do chon file: " + ("hop thoai" if gui else "nhap duong dan tren dong lenh"))
    print("San sang chay    : " + ("CO" if have_xl and sys.version_info >= (3, 8) else "CHUA (xem dong [X] o tren)"))
    return 0 if have_xl else 2


def _tk_ok() -> bool:
    try:
        import tkinter  # noqa: F401
        return True
    except ImportError:
        return False


def resolve_output(out: str, in_path: str) -> str:
    p = Path(out)
    if p.suffix.lower() != ".xlsx":
        p = p.with_name(p.name + ".xlsx")
    if not p.is_absolute() and p.parent == Path("."):
        p = Path(in_path).parent / p.name          # chi dat ten -> luu canh file JSON
    p.parent.mkdir(parents=True, exist_ok=True)
    return str(p)


# --------------------------------------------------------------------------------------
# MAIN
# --------------------------------------------------------------------------------------
def run_checks(objs, issues, cfg):
    tracks = group_tracks(objs)
    return {
        "scale": check_scale_sync(tracks, cfg),
        "size": check_size(objs, cfg),
        "z": check_z(objs, cfg),
        "rot": check_rotation(tracks, cfg),
        "overlap": check_overlap(objs, cfg),
        "dist": check_distance(objs, cfg),
        "issues": issues,
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Kiem tra chat luong Datumaro 1.0 (3D LiDAR) -> bao cao Excel")
    ap.add_argument("input", nargs="?", help="File Datumaro JSON (bo trong de mo hop thoai chon file)")
    ap.add_argument("-o", "--output", help="Ten/duong dan file Excel report (tu them .xlsx)")
    ap.add_argument("-c", "--config", help="File JSON ghi de nguong mac dinh")
    ap.add_argument("--dump-config", action="store_true", help="In cau hinh mac dinh ra man hinh roi thoat")
    ap.add_argument("--no-gui", action="store_true", help="Khong mo hop thoai (nhap duong dan tren dong lenh)")
    ap.add_argument("--track-offset", type=int, help="Cong them vao track_id trong JSON khi hien thi (mac dinh 1 = so thu tu CVAT)")
    ap.add_argument("--doctor", action="store_true", help="Kiem tra moi truong (python, openpyxl, hop thoai...) roi thoat")
    args = ap.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):                  # locale C/POSIX (ssh, cron) khong lam sap khi in
        try:
            stream.reconfigure(errors="replace")
        except Exception:
            pass

    if args.doctor:
        return doctor()

    if args.dump_config:
        print(json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2))
        return 0

    try:
        import openpyxl  # noqa: F401  (kiem tra som de khong loi o cuoi qua trinh)
    except ImportError:
        print("[X] Thieu thu vien openpyxl. Cai bang mot trong cac cach:\n"
              "    sudo apt install python3-openpyxl\n"
              "    hoac: python3 -m venv .venv && . .venv/bin/activate && pip install openpyxl")
        return 2

    cfg = copy.deepcopy(DEFAULT_CONFIG)
    if args.config:
        try:
            with open(_clean_path(args.config), "r", encoding="utf-8-sig") as f:
                cfg = deep_merge(cfg, json.load(f))
        except (OSError, json.JSONDecodeError) as e:
            print(f"[X] Khong doc duoc file config '{args.config}': {e}")
            return 1

    if args.track_offset is not None:
        cfg["track_id_offset"] = args.track_offset

    in_path = _clean_path(args.input) if args.input else ""
    if not in_path:
        in_path = pick_input_file(cfg, use_gui=not args.no_gui)
    if not in_path or not os.path.isfile(in_path):
        print(f"Khong co file dau vao hop le: '{in_path}'. Thoat." if in_path else "Khong chon file dau vao. Thoat.")
        return 1

    interactive = args.input is None
    out_path = (resolve_output(args.output, in_path) if args.output
                else pick_report_path(in_path, cfg, interactive, use_gui=not args.no_gui))
    if not out_path:
        print("Da huy.")
        return 1
    out_path = resolve_output(out_path, in_path)

    st = _load_settings()
    st["last_input_dir"] = str(Path(in_path).resolve().parent)
    st["last_report_dir"] = str(Path(out_path).resolve().parent)
    _save_settings(st)

    print(f"Doc file: {in_path}")
    try:
        objs, issues, meta = load_objects(in_path, cfg)
    except json.JSONDecodeError as e:
        print(f"[X] File khong phai JSON hop le: {e}")
        return 1
    except (OSError, UnicodeDecodeError, AttributeError, TypeError) as e:
        print(f"[X] Khong doc duoc file hoac cau truc khong phai Datumaro 3D: {type(e).__name__}: {e}")
        return 1
    if meta["version"] not in ("1.0", "(khong co)"):
        print(f"[!] dm_format_version = {meta['version']} (ky vong 1.0) - van tiep tuc kiem tra.")
    if not objs:
        print("Khong tim thay annotation cuboid_3d nao trong file.")
        return 1
    print(f"  {meta['n_items']} frame, {meta['n_objs']} cuboid_3d, {meta['n_tracks']} track id")

    results = run_checks(objs, issues, cfg)
    try:
        final = write_report(out_path, results, objs, meta, in_path, cfg)
    except OSError as e:
        print(f"[X] Khong ghi duoc file Excel: {e}")
        return 1

    print("\nKet qua (issue = 1 track tai 1 frame):")
    for k, _, _ in CHECKS:
        rs = results[k]
        print(f"  {k:<8} {len(rs):>6} issue | {len({r['track'] for r in rs}):>3} track | "
              f"{len({r['frame'] for r in rs}):>3} frame")
    print(f"  {'data':<8} {len(results['issues']):>6} loi du lieu (sheet Data_Issues)")
    print(f"\nDa luu report: {final}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
