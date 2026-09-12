setup() {
    export TEST_DATA_DIR="$(mktemp -d /tmp/yardstik-bats-data-XXXXXX)"
    export DATA_DIR="$TEST_DATA_DIR"
    export SCRIPT_DIR="$(cd "$BATS_TEST_DIRNAME/../../control-panel/scripts" && pwd)"
}

teardown() {
    if [ -d "$TEST_DATA_DIR" ]; then
        rm -rf "$TEST_DATA_DIR"
    fi
}

@test "update_osha.sh: Successfully updates last_incident_date with valid YYYY-MM-DD" {
    run "$SCRIPT_DIR/update_osha.sh" -d 2026-09-11
    [ "$status" -eq 0 ]
    [[ "$output" =~ "Successfully updated trackers.json" ]]
    [ -f "$TEST_DATA_DIR/trackers.json" ]
    [ -f "$TEST_DATA_DIR/version.txt" ]

    # Verify JSON content
    run python3 -c "import json; d=json.load(open('$TEST_DATA_DIR/trackers.json')); print(d.get('last_incident_date'))"
    [ "$output" = "2026-09-11" ]
}

@test "update_osha.sh: Fails on invalid date format" {
    run "$SCRIPT_DIR/update_osha.sh" -d "invalid-date"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Error: Invalid date format" ]]
}

@test "update_osha.sh: Fails on empty date parameter" {
    run "$SCRIPT_DIR/update_osha.sh"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Error: Invalid date format" ]]
}

@test "update_blend.sh: Updates production tracker value and label" {
    run "$SCRIPT_DIR/update_blend.sh" -v "85%" -l "Target Blend Rate"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "Successfully updated Production Tracker" ]]
    [ -f "$TEST_DATA_DIR/trackers.json" ]

    run python3 -c "import json; d=json.load(open('$TEST_DATA_DIR/trackers.json')); print(d.get('production_tracker_value'), d.get('production_tracker_label'))"
    [ "$output" = "85% Target Blend Rate" ]
}

@test "upload_override.sh: Clears current toolbox override" {
    # Seed trackers.json with existing override
    python3 -c "import json; json.dump({'toolbox_override_date': '2026-09-10'}, open('$TEST_DATA_DIR/trackers.json', 'w'))"
    touch "$TEST_DATA_DIR/override.jpg"

    run "$SCRIPT_DIR/upload_override.sh" -a "Clear Current Override"
    [ "$status" -eq 0 ]
    [[ "$output" =~ "Today's Toolbox Override has been cleared" ]]
    [ ! -f "$TEST_DATA_DIR/override.jpg" ]

    run python3 -c "import json; d=json.load(open('$TEST_DATA_DIR/trackers.json')); print(d.get('toolbox_override_date'))"
    [ "$output" = "" ]
}

@test "upload_override.sh: Rejects upload without selecting a file" {
    run "$SCRIPT_DIR/upload_override.sh" -a "Upload New Override"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Error: You must select a file to upload" ]]
}

@test "upload_override.sh: Rejects invalid non-image file type" {
    local text_file="$TEST_DATA_DIR/test.txt"
    echo "malicious text" > "$text_file"

    run "$SCRIPT_DIR/upload_override.sh" -a "Upload New Override" -f "$text_file"
    [ "$status" -eq 1 ]
    [[ "$output" =~ "Error: Invalid file type" ]]
}
