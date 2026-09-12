import os
import json
import pytest
from datetime import datetime, timezone

import parse_track_check as ptc


class TestSwitchOSExtraction:
    """Test out-of-service (O.S.) switch turnout detection from conductor notes."""

    def test_pattern_one_slash_end_os(self):
        # E.g. "45/70 E/END O.S."
        res = ptc.extract_switch_os("2", "4 - REBAR & 2 - WIRE ROD, 45/70 E/END O.S.")
        assert len(res) == 1
        assert res[0]["tracks"] == ["45", "70"]
        assert res[0]["dir"] == "E"
        assert "45/70 E/END O.S" in res[0]["raw"]

    def test_pattern_one_switch_os(self):
        # E.g. "21/22 SWITCH O.S."
        res = ptc.extract_switch_os("4", "21/22 SWITCH O.S. AT S/END")
        assert len(res) >= 1
        assert res[0]["tracks"] == ["21", "22"]
        assert res[0]["dir"] == "S"

    def test_pattern_two_os_at_switch(self):
        # E.g. "O.S. AT 14/15 SWITCH N/END"
        res = ptc.extract_switch_os("14", "O.S. AT 14/15 SWITCH N/END")
        assert len(res) >= 1
        assert res[0]["tracks"] == ["14", "15"]
        assert res[0]["dir"] == "N"

    def test_pattern_three_switch_os_single_track(self):
        # E.g. "SWITCH O.S. AT S/END"
        res = ptc.extract_switch_os("19", "CLEAR, SWITCH O.S. AT S/END")
        assert len(res) >= 1
        assert res[0]["tracks"] == ["19"]
        assert res[0]["dir"] == "S"

    def test_negative_cases(self):
        # Normal notes should not trigger false positives
        res = ptc.extract_switch_os("1", "8 - SCRAP STEEL (SHRED), CLEAR TO NORTH SWITCH")
        assert len(res) == 0

        res2 = ptc.extract_switch_os("3", "EMPTY")
        assert len(res2) == 0


class TestCarCountExtraction:
    """Test extracting car counts from diverse conductor note strings."""

    def test_plain_number_at_start(self):
        assert ptc.extract_cars_from_text("1", "8 - SCRAP STEEL (SHRED)") == 8

    def test_summing_comma_separated_cars(self):
        assert ptc.extract_cars_from_text("2", "4 - REBAR & 2 - WIRE ROD") == 6

    def test_parenthetical_total(self):
        # E.g. "12 (4) DLs" -> 12 total
        assert ptc.extract_cars_from_text("48", "12 (4) DLs") == 12

    def test_empty_or_clear_notes(self):
        assert ptc.extract_cars_from_text("3", "EMPTY") == 0
        assert ptc.extract_cars_from_text("3", "CLEAR") == 0
        assert ptc.extract_cars_from_text("3", "") == 0


class TestTimestampExtraction:
    """Test file metadata and timestamp formatting."""

    def test_existing_xlsx_timestamp(self, example_xlsx_path):
        ts = ptc.get_file_timestamp(example_xlsx_path)
        assert isinstance(ts, str)
        # Should be valid ISO timestamp ending in Z or timezone offset
        assert ts.endswith("Z") or "+" in ts or "-" in ts[10:]
        assert len(ts) >= 19

    def test_nonexistent_file_fallback(self):
        ts = ptc.get_file_timestamp("/nonexistent/fake_file.xlsx")
        assert isinstance(ts, str)
        assert ts.endswith("Z")


class TestFullSpreadsheetParsing:
    """End-to-end parsing of standard plant track check sheets."""

    def test_parse_example_file(self, example_xlsx_path):
        tracks = ptc.parse_file(example_xlsx_path)
        assert isinstance(tracks, list)
        assert len(tracks) == 11, f"Expected 11 tracks, got {len(tracks)}"

        # Validate schema of every returned track object
        required_keys = {
            "id", "name", "cars", "capacity", "commodity", "notes",
            "status", "is_clear", "is_bad_order", "is_blend",
            "dwell_days", "dwell_warning", "oldest_inbound_date",
            "os_switches", "updated_at"
        }
        for t in tracks:
            missing = required_keys - set(t.keys())
            assert not missing, f"Track {t.get('id')} missing keys: {missing}"
            assert isinstance(t["cars"], int)
            assert isinstance(t["capacity"], int)
            assert isinstance(t["is_clear"], bool)
            assert isinstance(t["is_bad_order"], bool)
            assert isinstance(t["dwell_warning"], bool)
            assert isinstance(t["os_switches"], list)

    def test_track_specific_values(self, example_xlsx_path):
        tracks = ptc.parse_file(example_xlsx_path)
        tracks_by_id = {str(t["id"]): t for t in tracks}

        # Track 1: 8 cars, occupied, not clear
        t1 = tracks_by_id.get("1")
        assert t1 is not None
        assert t1["cars"] == 8
        assert t1["is_clear"] is False
        assert "SCRAP STEEL" in t1["commodity"]

        # Track 2: 6 cars, contains O.S. switch 45/70 E
        t2 = tracks_by_id.get("2")
        assert t2 is not None
        assert t2["cars"] == 6
        assert len(t2["os_switches"]) >= 1
        assert t2["os_switches"][0]["tracks"] == ["45", "70"]

        # Track 3: Clear / Empty track
        t3 = tracks_by_id.get("3")
        assert t3 is not None
        assert t3["cars"] == 0
        assert t3["is_clear"] is True
        assert t3["status"] == "clear"


class TestCLIExecution:
    """Test CLI execution and JSON persistence."""

    def test_main_generates_valid_json(self, example_xlsx_path, tmp_tracks_output, monkeypatch):
        monkeypatch.setattr("sys.argv", ["parse_track_check.py", example_xlsx_path, tmp_tracks_output])
        ptc.main()

        assert os.path.exists(tmp_tracks_output)
        with open(tmp_tracks_output, "r", encoding="utf-8") as f:
            data = json.load(f)

        assert isinstance(data, list)
        assert len(data) == 11
        assert all("id" in t and "cars" in t for t in data)
