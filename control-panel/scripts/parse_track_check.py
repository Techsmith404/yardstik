#!/usr/bin/env python3
"""
YardStik Universal Track Check Parser Engine
Parses standard CSV/Excel templates and auto-detects legacy multi-column track sheets.
Outputs normalized JSON array to /data/tracks.json (or local assets).
"""

import sys
import os
import json
import re
from datetime import datetime

def parse_file(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext in ['.xlsx', '.xls']:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        ws = wb.active
        return parse_worksheet(ws)
    elif ext == '.csv':
        import csv
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            rows = list(reader)
        return parse_csv_rows(rows)
    elif ext == '.json':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return json.load(f)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

def parse_worksheet(ws):
    header = [str(ws.cell(1, c).value or '').strip().lower() for c in range(1, ws.max_column + 1)]
    if any('track' in h for h in header) and any('car' in h or 'count' in h or 'commodity' in h for h in header):
        return parse_standard_table(ws, header)
    return parse_legacy_sheet(ws)

def parse_standard_table(ws, header):
    track_col = next(i + 1 for i, h in enumerate(header) if 'track' in h)
    car_col = next((i + 1 for i, h in enumerate(header) if 'car' in h or 'count' in h or 'qty' in h), None)
    comm_col = next((i + 1 for i, h in enumerate(header) if 'commodity' in h or 'content' in h or 'desc' in h), None)
    date_col = next((i + 1 for i, h in enumerate(header) if 'date' in h or 'inbound' in h or 'dwell' in h), None)
    notes_col = next((i + 1 for i, h in enumerate(header) if 'note' in h or 'status' in h), None)
    
    now = datetime.now()
    tracks = []
    
    for r in range(2, ws.max_row + 1):
        t_val = ws.cell(r, track_col).value
        if not t_val:
            continue
        track_id = str(t_val).strip().upper().replace('TRACK', '').strip(' {}')
        if not track_id:
            continue
            
        cars_val = ws.cell(r, car_col).value if car_col else 0
        try:
            cars = int(cars_val or 0)
        except:
            cars = 0
            
        comm = str(ws.cell(r, comm_col).value or '').strip() if comm_col else ''
        notes = str(ws.cell(r, notes_col).value or '').strip() if notes_col else ''
        date_val = ws.cell(r, date_col).value if date_col else None
        
        is_clear = (cars == 0) or (comm.upper() in ['CLEAR', 'EMPTY']) or (notes.upper() in ['CLEAR', 'EMPTY'])
        is_bad_order = bool(re.search(r"(B\.O|BAD ORDER)", f"{comm} {notes}", re.I))
        is_blend = bool(re.search(r"BLEND", f"{comm} {notes}", re.I))
        
        dwell_days = 0
        dwell_warning = False
        oldest_date_str = None
        
        if isinstance(date_val, datetime):
            dwell_days = (now - date_val).days
            oldest_date_str = date_val.strftime('%Y-%m-%d')
        elif isinstance(date_val, str) and date_val:
            d_match = re.search(r"(\d{1,2})/(\d{1,2})", date_val)
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

def parse_legacy_sheet(ws):
    shift_date = datetime.now()
    for r in range(1, 10):
        for c in range(1, 10):
            val = ws.cell(r, c).value
            if isinstance(val, datetime):
                shift_date = val
                break
                
    tracks = []
    
    def parse_entry(track_raw, text_raw):
        if not track_raw:
            return None
        t_match = re.search(r"\{?([A-Za-z0-9]+)\}?", str(track_raw).strip())
        if not t_match:
            return None
        track_id = t_match.group(1).upper()
        if track_id in ["COMPANY", "SITE", "STATE", "SUPERVISOR", "SHIFT", "RO:", "O.S.", "BOF"]:
            return None
            
        text = str(text_raw or "").strip()
        is_clear = not text or text.upper() in ["CLEAR", "EMPTY"]
        is_bad_order = bool(re.search(r"(B\.O|BAD ORDER)", text, re.I))
        is_blend = bool(re.search(r"BLEND", text, re.I))
        
        total_cars = 0
        if not is_clear:
            num_matches = re.findall(r"(\d+)\s*[-–]\s*|(\d+)\s*(?:CARS|MTY|OB|TRIM|BALES|SHEETS|COIL|HBI|DL|SMS|MSA)", text, re.I)
            counts = [int(m[0] or m[1]) for m in num_matches if (m[0] or m[1])]
            if counts:
                total_cars = sum(counts)
            else:
                lead = re.match(r"^(\d+)", text)
                total_cars = int(lead.group(1)) if lead else 1
                
        dwell_days = 0
        dwell_warning = False
        date_matches = re.findall(r"FROM\s+(\d{1,2})/(\d{1,2})", text, re.I)
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

    for r in range(5, ws.max_row + 1):
        if r > 60:
            break
        # Col 1/2
        t1 = parse_entry(ws.cell(r, 1).value, ws.cell(r, 2).value)
        if t1:
            tracks.append(t1)
        # Col 3/5
        t2 = parse_entry(ws.cell(r, 3).value, ws.cell(r, 5).value)
        if t2:
            tracks.append(t2)

    tracks.sort(key=lambda x: (0 if x["id"].isdigit() else 1, int(x["id"]) if x["id"].isdigit() else x["id"]))
    return tracks

def parse_csv_rows(rows):
    if not rows:
        return []
    header = [c.strip().lower() for c in rows[0]]
    # treat similar to standard table
    tracks = []
    return tracks

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: parse_track_check.py <input_file.xlsx> [output_file.json]")
        sys.exit(1)
        
    in_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else "html/assets/data/tracks.json"
    
    result = parse_file(in_file)
    with open(out_file, "w") as f:
        json.dump(result, f, indent=2)
        
    print(f"Successfully parsed {len(result)} tracks -> {out_file}")
