#!/usr/bin/env python3
"""
YardStik Universal Track Check Parser Engine
Parses standard CSV/Excel (.xlsx, .xls, .csv) templates, tabular sheets, and multi-column grid layouts.
Outputs normalized JSON array to /data/tracks.json (or local assets).
"""

import sys
import os
import json
import re
from datetime import datetime

def load_sheet_matrix(file_path):
    """Loads spreadsheet cells into a 2D matrix, using openpyxl or pure python fallback."""
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in ['.xlsx', '.xls']:
        try:
            import openpyxl
            wb = openpyxl.load_workbook(file_path, data_only=True)
            target_ws = None
            for sname in wb.sheetnames:
                ws = wb[sname]
                found = False
                for r in range(1, 40):
                    for c in range(1, 10):
                        if "{" in str(ws.cell(r, c).value or ""):
                            found = True
                            break
                    if found:
                        break
                if found:
                    target_ws = ws
                    break
            if not target_ws:
                target_ws = wb.active

            rows = []
            for r in range(1, target_ws.max_row + 1):
                row = [target_ws.cell(r, c).value for c in range(1, target_ws.max_column + 1)]
                rows.append(row)
            return rows
        except Exception:
            pass

        # Pure Python ZIP+XML Fallback
        import zipfile
        import xml.etree.ElementTree as ET
        with zipfile.ZipFile(file_path, "r") as z:
            shared_strings = []
            if "xl/sharedStrings.xml" in z.namelist():
                tree = ET.fromstring(z.read("xl/sharedStrings.xml"))
                ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
                for si in tree.findall(f"{ns}si"):
                    t = si.find(f"{ns}t")
                    if t is not None and t.text:
                        shared_strings.append(t.text)
                    else:
                        parts = [elem.text for elem in si.findall(f".//{ns}t") if elem.text]
                        shared_strings.append("".join(parts))

            sheet_names = [n for n in z.namelist() if n.startswith("xl/worksheets/sheet")]
            if not sheet_names:
                raise ValueError("No worksheets found in xlsx")

            tree = ET.fromstring(z.read(sheet_names[0]))
            ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
            rows = []
            for row_elem in tree.findall(f".//{ns}row"):
                row_data = []
                for c in row_elem.findall(f"{ns}c"):
                    val_type = c.get("t")
                    v_elem = c.find(f"{ns}v")
                    val = ""
                    if v_elem is not None and v_elem.text is not None:
                        raw_val = v_elem.text
                        if val_type == "s" and shared_strings:
                            try:
                                val = shared_strings[int(raw_val)]
                            except:
                                val = raw_val
                        else:
                            val = raw_val
                    elif c.find(f"{ns}is/{ns}t") is not None:
                        val = c.find(f"{ns}is/{ns}t").text or ""
                    row_data.append(val)
                rows.append(row_data)
            return rows

    elif ext == '.csv':
        import csv
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            return list(reader)
    elif ext == '.json':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return json.load(f)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

def parse_file(file_path):
    matrix_or_json = load_sheet_matrix(file_path)
    if isinstance(matrix_or_json, list) and len(matrix_or_json) > 0 and isinstance(matrix_or_json[0], dict):
        return matrix_or_json
    return parse_matrix(matrix_or_json)

def parse_matrix(rows):
    if not rows:
        return []

    # Check for standard table headers in top 5 rows
    for r_idx, r in enumerate(rows[:5]):
        h_row = [str(cell or '').strip().lower() for cell in r]
        if any('track' in h for h in h_row) and any('car' in h or 'count' in h or 'commodity' in h for h in h_row):
            return parse_standard_table(rows, r_idx, h_row)

    # Multi-column grid / legacy track layout parser
    return parse_grid_layout(rows)

def parse_standard_table(rows, header_row_idx, header):
    track_col = next(i for i, h in enumerate(header) if 'track' in h)
    car_col = next((i for i, h in enumerate(header) if 'car' in h or 'count' in h or 'qty' in h), None)
    cap_col = next((i for i, h in enumerate(header) if 'cap' in h), None)
    comm_col = next((i for i, h in enumerate(header) if 'commodity' in h or 'content' in h or 'desc' in h), None)
    date_col = next((i for i, h in enumerate(header) if 'date' in h or 'inbound' in h or 'dwell' in h), None)
    notes_col = next((i for i, h in enumerate(header) if 'note' in h or 'status' in h), None)

    now = datetime.now()
    tracks = []

    for row in rows[header_row_idx + 1:]:
        if not row or len(row) <= track_col:
            continue
        t_val = row[track_col]
        if not t_val:
            continue
        track_id = str(t_val).strip().upper().replace('TRACK', '').strip(' {}')
        if not track_id:
            continue

        cars_val = row[car_col] if (car_col is not None and len(row) > car_col) else 0
        try:
            cars = int(float(cars_val or 0))
        except:
            cars = 0

        cap_val = row[cap_col] if (cap_col is not None and len(row) > cap_col) else 0
        try:
            capacity = int(float(cap_val or 0))
        except:
            capacity = 20

        comm = str(row[comm_col] or '').strip() if (comm_col is not None and len(row) > comm_col) else ''
        notes = str(row[notes_col] or '').strip() if (notes_col is not None and len(row) > notes_col) else ''
        date_val = row[date_col] if (date_col is not None and len(row) > date_col) else None

        is_clear = (cars == 0) or (comm.upper() in ['CLEAR', 'EMPTY']) or (notes.upper() in ['CLEAR', 'EMPTY'])
        is_bad_order = bool(re.search(r"(B\\.O|BAD ORDER)", f"{comm} {notes}", re.I))
        is_blend = bool(re.search(r"BLEND", f"{comm} {notes}", re.I))

        dwell_days = 0
        dwell_warning = False
        oldest_date_str = None

        if isinstance(date_val, datetime):
            dwell_days = (now - date_val).days
            oldest_date_str = date_val.strftime('%Y-%m-%d')
        elif isinstance(date_val, str) and date_val:
            d_match = re.search(r"(\\d{1,2})/(\\d{1,2})", date_val)
            if d_match:
                mo, da = int(d_match.group(1)), int(d_match.group(2))
                try:
                    dt = datetime(now.year, mo, da)
                    if dt > now:
                        dt = datetime(now.year - 1, mo, da)
                    dwell_days = (now - dt).days
                    oldest_date_str = dt.strftime('%Y-%m-%d')
                except:
                    pass
        if dwell_days >= 5:
            dwell_warning = True

        status = "clear" if is_clear else ("bad_order" if is_bad_order else ("warning" if dwell_warning else ("blend" if is_blend else "occupied")))

        tracks.append({
            "id": track_id,
            "name": f"Track {track_id}",
            "cars": 0 if is_clear else cars,
            "capacity": capacity,
            "commodity": comm if not is_clear else "Empty",
            "notes": notes,
            "status": status,
            "is_clear": is_clear,
            "is_bad_order": is_bad_order,
            "is_blend": is_blend,
            "dwell_days": dwell_days,
            "dwell_warning": dwell_warning,
            "oldest_inbound_date": oldest_date_str,
            "updated_at": now.strftime('%Y-%m-%dT%H:%M:%S')
        })

    tracks.sort(key=lambda x: (0 if x["id"].isdigit() else 1, int(x["id"]) if x["id"].isdigit() else x["id"]))
    return tracks

def parse_grid_layout(rows):
    shift_date = datetime.now()
    for row in rows[:10]:
        for cell in row:
            if isinstance(cell, datetime):
                shift_date = cell
                break

    # 1. Map all bracketed track IDs: {23}, {45}, {Y}, etc.
    track_positions = []
    for r_idx, row in enumerate(rows[:100]):
        for c_idx, cell in enumerate(row[:15]):
            val = str(cell or "").strip()
            m = re.search(r"\{([A-Za-z0-9]+)\}(.*)", val)
            if m:
                tid = m.group(1).upper()
                extra = m.group(2).strip()
                track_positions.append({"row": r_idx, "col": c_idx, "id": tid, "extra": extra})

    if not track_positions:
        return []

    # Group tracks by column position
    by_col = {}
    for tp in track_positions:
        by_col.setdefault(tp["col"], []).append(tp)

    tracks = []

    for c_idx, tps in by_col.items():
        # Determine content column range
        content_cols = [c_idx + 1] if c_idx == 0 else [c for c in range(c_idx + 1, c_idx + 6)]

        for i, tp in enumerate(tps):
            start_r = tp["row"]
            end_r = tps[i+1]["row"] if (i + 1 < len(tps)) else (start_r + 5)

            text_lines = []
            if tp["extra"]:
                text_lines.append(tp["extra"])

            for r in range(start_r, min(end_r, len(rows))):
                row = rows[r]
                for cc in content_cols:
                    if cc < len(row):
                        v = str(row[cc] or "").strip()
                        if v and v not in ["None", "AUDIT", "."]:
                            text_lines.append(v)

            raw_text = " ".join(text_lines).strip()

            is_clear = not raw_text or raw_text.upper() in ["CLEAR", "EMPTY"]
            is_bad_order = bool(re.search(r"\b(B\.O|BAD ORDER)\b", raw_text, re.I))
            is_blend = bool(re.search(r"\bBLEND\b", raw_text, re.I))

            total_cars = 0
            if not is_clear:
                num_matches = re.findall(r"(\d+)\s*[-–]\s*|(\d+)\s*(?:CARS|MTY|OB|TRIM|BALES|SHEETS|COIL|HBI|DL|SMS|MSA)", raw_text, re.I)
                counts = [int(m[0] or m[1]) for m in num_matches if (m[0] or m[1])]
                if counts:
                    total_cars = sum(counts)
                else:
                    lead = re.match(r"^(\d+)", raw_text)
                    total_cars = int(lead.group(1)) if lead else 1

            dwell_days = 0
            dwell_warning = False
            date_matches = re.findall(r"(?:FROM|DATED?)\s+(\d{1,2})/(\d{1,2})", raw_text, re.I)
            oldest_date_str = None
            if date_matches:
                for m_str in date_matches:
                    m_mo, m_day = int(m_str[0]), int(m_str[1])
                    try:
                        inbound_dt = datetime(shift_date.year, m_mo, m_day)
                        if inbound_dt > shift_date:
                            inbound_dt = datetime(shift_date.year - 1, m_mo, m_day)
                        days = (shift_date - inbound_dt).days
                        if days > dwell_days:
                            dwell_days = days
                            oldest_date_str = inbound_dt.strftime("%Y-%m-%d")
                    except:
                        pass
                if dwell_days >= 5:
                    dwell_warning = True

            status = "clear" if is_clear else ("bad_order" if is_bad_order else ("warning" if dwell_warning else ("blend" if is_blend else "occupied")))

            tracks.append({
                "id": tp["id"],
                "name": f"Track {tp['id']}",
                "cars": 0 if is_clear else total_cars,
                "capacity": 20,
                "commodity": raw_text if not is_clear else "Empty",
                "notes": raw_text,
                "status": status,
                "is_clear": is_clear,
                "is_bad_order": is_bad_order,
                "is_blend": is_blend,
                "dwell_days": dwell_days,
                "dwell_warning": dwell_warning,
                "oldest_inbound_date": oldest_date_str,
                "updated_at": shift_date.strftime("%Y-%m-%dT%H:%M:%S")
            })

    tracks.sort(key=lambda x: (0 if x["id"].isdigit() else 1, int(x["id"]) if x["id"].isdigit() else x["id"]))
    return tracks

def main():
    if len(sys.argv) < 2:
        print("Usage: parse_track_check.py <input_file> [output_tracks.json]")
        sys.exit(1)

    in_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else "/data/tracks.json"

    existing_capacities = {}
    if os.path.exists(out_file):
        try:
            with open(out_file, "r") as f:
                for t in json.load(f):
                    if "capacity" in t:
                        existing_capacities[t["id"].upper()] = t["capacity"]
        except:
            pass

    result = parse_file(in_file)
    for t in result:
        tid = t["id"].upper()
        if tid in existing_capacities:
            t["capacity"] = existing_capacities[tid]

    os.makedirs(os.path.dirname(os.path.abspath(out_file)), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Successfully parsed {len(result)} tracks into {out_file}")

if __name__ == "__main__":
    main()
