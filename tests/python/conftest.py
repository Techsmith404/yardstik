import os
import sys
import pytest

# Add control-panel/scripts to sys.path
SCRIPTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../control-panel/scripts'))
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

@pytest.fixture
def example_xlsx_path():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
    path = os.path.join(root, 'control-panel/public/example-track-check.xlsx')
    assert os.path.exists(path), f"Example track check file not found at {path}"
    return path

@pytest.fixture
def tmp_tracks_output(tmp_path):
    return str(tmp_path / "tracks.json")
