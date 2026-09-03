#!/usr/bin/env python3
"""
YardStik Universal Track Check Parser Engine (Zero-Dependency)
Parses standard CSV/Excel (.xlsx, .xls, .csv) templates and auto-detects legacy multi-column track sheets.
Outputs normalized JSON array to /data/tracks.json (or local assets).
"""

import sys
import os
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

def read_xlsx_cells(file_path):
    """Pure Python XLSX reader without openpyxl dependency."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        ws = wb.active
        rows = []
        for r in range(1, ws.max_row + 1):
            row = [ws.cell(r, c).value for c in range(1, ws.max_column + 1)]
            if any(v is not None for v in row):
                rows.append(row)
        return rows
    except Exception:
        pass

    # Pure Python ZIP+XML Fallback
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
            if any(row_data):
                rows.append(row_data)
        return rows

def parse_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in ['.xlsx', '.xls']:
        rows = read_xlsx_cells(file_path)
        return parse_matrix(rows)
    elif ext == '.csv':
        import csv
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            rows = list(reader)
        return parse_matrix(rows)
    elif ext == '.json':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return json.load(f)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

def parse_matrix(rows):
    if not rows:
        return []

    # Check for standard table headers in top 5 rows
    for r_idx, r in enumerate(rows[:5]):
        h_row = [str(cell or '').strip().lower() for cell in r]
        if any('track' in h for h in h_row) and any('car' in h or 'count' in h or 'commodity' in h for h in h_row):
            return parse_standard_table(rows, r_idx, h_row)

    # Fallback to legacy sheet parser
    return parse_legacy_sheet(rows)

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
        is_bad_order = bool(re.search(r"(B\\.O|BAD ORDER)", f"{comm} {notes}", re.I))
        is_blend = bool(re.search(r"BLEND", f"{comm} {notes}", re.I))

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

def parse_legacy_sheet(rows):
    shift_date = datetime.now()
    for row in rows[:10]:
        for cell in row:
            if isinstance(cell, datetime):
                shift_date = cell
                break

    tracks = []

    def parse_entry(track_raw, text_raw):
        if not track_raw:
            return None
        t_match = re.search(r"\\{?([A-Za-z0-9]+)\\}?", str(track_raw).strip())
        if not t_match:
            return None
        track_id = t_match.group(1).upper()
        if track_id in ["COMPANY", "SITE", "STATE", "SUPERVISOR", "SHIFT", "RO:", "O.S.", "BOF"]:
            return None

        text = str(text_raw or "").strip()
        is_clear = not text or text.upper() in ["CLEAR", "EMPTY"]
        is_bad_order = bool(re.search(r"(B\\.O|BAD ORDER)", text, re.I))
        is_blend = bool(re.search(r"BLEND", text, re.I))

        total_cars = 0
        if not is_clear:
            num_matches = re.findall(r"(\\d+)\\s*[-–]\\s*| (\\d+)\\s*(?:CARS|MTY|OB|TRIM|BALES|SHEETS|COIL|HBI|DL|SMS|MSA)", text, re.I)
            counts = [int(m[0] or m[1]) for m in num_matches if (m[0] or m[1])]
            if counts:
                total_cars = sum(counts)
            else:
                lead = re.match(r"^(\\d+)", text)
                total_cars = int(lead.group(1)) if lead else 1

        dwell_days = 0
        dwell_warning = False
        date_matches = re.findall(r"FROM\\s+(\\d{1,2})/(\\d{1,2})", text, re.I)
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

        return {
            "id": track_id,
            "name": f"Track {track_id}",
            "cars": 0 if is_clear else total_cars,
            "capacity": 20,
            "commodity": text if not is_clear else "Empty",
            "notes": text,
            "status": status,
            "is_clear": is_clear,
            "is_bad_order": is_bad_order,
            "is_blend": is_blend,
            "dwell_days": dwell_days,
            "dwell_warning": dwell_warning,
            "oldest_inbound_date": oldest_date_str,
            "updated_at": shift_date.strftime("%Y-%m-%dT%H:%M:%S")
        }

    for row in rows:
        c = 0
        while c < len(row):
            val = str(row[c] or "").strip()
            if "{" in val and "}" in val:
                nxt = str(row[c+1] or "").strip() if c + 1 < len(row) else ""
                entry = parse_entry(val, nxt)
                if entry and not any(t["id"] == entry["id"] for t in tracks):
                    tracks.append(entry)
                c += 2
            else:
                c += 1

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
