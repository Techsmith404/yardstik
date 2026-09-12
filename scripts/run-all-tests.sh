#!/usr/bin/env bash
# ==============================================================================
# 🧪 YardStik Unified Automated Test Runner
# Runs Python, JavaScript/Node.js, and Bats Shell script test suites.
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${CYAN}======================================================================${NC}"
echo -e "${BOLD}${CYAN}  🧪 YardStik Automated Test Suite Runner${NC}"
echo -e "${BOLD}${CYAN}======================================================================${NC}"

FAILED=0

# 1. Python Test Suite (pytest)
echo -e "\n${BOLD}[1/3] Running Python Test Suite (pytest)...${NC}"
if pytest tests/python/ -v; then
    echo -e "${GREEN}✓ Python tests passed.${NC}"
else
    echo -e "${RED}✗ Python tests failed.${NC}"
    FAILED=1
fi

# 2. JavaScript & Node.js Test Suite (Jest)
echo -e "\n${BOLD}[2/3] Running JavaScript API & AST Compliance Suite (Jest)...${NC}"
if npx jest tests/js/; then
    echo -e "${GREEN}✓ JavaScript tests passed.${NC}"
else
    echo -e "${RED}✗ JavaScript tests failed.${NC}"
    FAILED=1
fi

# 3. Shell Script Test Suite (Bats)
echo -e "\n${BOLD}[3/3] Running Shell Script Test Suite (Bats)...${NC}"
if npx bats tests/shell/; then
    echo -e "${GREEN}✓ Shell script tests passed.${NC}"
else
    echo -e "${RED}✗ Shell script tests failed.${NC}"
    FAILED=1
fi

echo -e "\n${BOLD}${CYAN}======================================================================${NC}"
if [ "$FAILED" -eq 0 ]; then
    echo -e "${BOLD}${GREEN}  🎉 ALL TESTS PASSED! Quality assurance standards satisfied.${NC}"
    echo -e "${BOLD}${CYAN}======================================================================${NC}"
    exit 0
else
    echo -e "${BOLD}${RED}  💥 ONE OR MORE TEST SUITES FAILED! Please review logs above.${NC}"
    echo -e "${BOLD}${CYAN}======================================================================${NC}"
    exit 1
fi
