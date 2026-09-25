#!/bin/bash
REPO_ROOT="/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo"
WEB_DIR="$REPO_ROOT/apps/web"
LOCK_DIR="/tmp/UX-V2-D4-C1-runner.lock"

# Section 5: Atomic Single-Run Lock
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  ACTIVE_PID=$(cat "$LOCK_DIR/runner.pid" 2>/dev/null || echo "UNKNOWN")
  echo "BLOCKED — ANOTHER D4-C1 RUNNER MAY BE ACTIVE (Lock directory $LOCK_DIR owned by PID $ACTIVE_PID)" >&2
  exit 1
fi

OWNER_PID=$$
printf '%s\n' "$OWNER_PID" > "$LOCK_DIR/runner.pid"

INITIAL_HEAD=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)
if [ -z "$INITIAL_HEAD" ]; then
  echo "CRITICAL ERROR: Failed to resolve git HEAD commit." >&2
  rm -rf "$LOCK_DIR"
  exit 1
fi

ATTEMPT_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
TMP_LOG_FILE=$(mktemp "/tmp/UX-V2-D4-C1-${INITIAL_HEAD}-${ATTEMPT_ID}-XXXXXX.log" 2>/dev/null)
if [ -z "$TMP_LOG_FILE" ] || [ ! -w "$TMP_LOG_FILE" ]; then
  echo "CRITICAL ERROR: Failed to create temporary log file via mktemp." >&2
  rm -rf "$LOCK_DIR"
  exit 1
fi

echo "Temporary Execution Log: $TMP_LOG_FILE"
echo "Attempt ID: $ATTEMPT_ID"

# Global State Variables
CLEANUP_DONE=false
LOCK_RELEASED=false
PUBLISH_DONE=false

SERVER_LAUNCHER_PID=""
SERVER_LISTENER_PID=""
VERIFIED_ANCESTRY_CHAIN=""

OVERALL_EXIT_CODE=0
FINAL_IDENTITY_EXIT_CODE=0
FINAL_SOURCE_INTEGRITY_EXIT_CODE=0
SERVER_SHUTDOWN_EXIT_CODE=0
PORT_3000_FREE_AFTER_SHUTDOWN=true
PUBLICATION_EXIT_CODE=0
FINAL_ACCEPTANCE_ELIGIBLE=false

LABEL="DIAGNOSTIC ATTEMPT — ONE OR MORE GATES FAILED"
TERMINATION_REASON="INITIALIZING"

CANDIDATE_PUBLISH_REL_PATH="apps/web/Files/UX-V2-D4-C1-FINAL-CANDIDATE-${INITIAL_HEAD}-${ATTEMPT_ID}.log"
CANDIDATE_PUBLISH_PATH="$REPO_ROOT/$CANDIDATE_PUBLISH_REL_PATH"

TESTED_CODE_COMMIT=""
RUNNER_COMMIT=""
BUILD_COMMIT=""
SERVER_SOURCE_COMMIT=""

# Shutdown server helper
stop_owned_server() {
  if [ -n "$SERVER_LAUNCHER_PID" ] || [ -n "$SERVER_LISTENER_PID" ]; then
    echo "Stopping owned production server (Launcher PID: ${SERVER_LAUNCHER_PID}, Listener PID: ${SERVER_LISTENER_PID})..." >> "$TMP_LOG_FILE"

    if [ -n "$SERVER_LISTENER_PID" ] && ps -p "$SERVER_LISTENER_PID" >/dev/null 2>&1; then
      kill -TERM "$SERVER_LISTENER_PID" 2>/dev/null
    fi
    if [ -n "$SERVER_LAUNCHER_PID" ] && ps -p "$SERVER_LAUNCHER_PID" >/dev/null 2>&1; then
      kill -TERM "$SERVER_LAUNCHER_PID" 2>/dev/null
    fi

    sleep 2

    if [ -n "$SERVER_LISTENER_PID" ] && ps -p "$SERVER_LISTENER_PID" >/dev/null 2>&1; then
      echo "Listener PID $SERVER_LISTENER_PID survived SIGTERM. Escalating to SIGKILL..." >> "$TMP_LOG_FILE"
      kill -KILL "$SERVER_LISTENER_PID" 2>/dev/null
    fi
    if [ -n "$SERVER_LAUNCHER_PID" ] && ps -p "$SERVER_LAUNCHER_PID" >/dev/null 2>&1; then
      echo "Launcher PID $SERVER_LAUNCHER_PID survived SIGTERM. Escalating to SIGKILL..." >> "$TMP_LOG_FILE"
      kill -KILL "$SERVER_LAUNCHER_PID" 2>/dev/null
    fi
    sleep 1
  fi

  STILL_LISTENING=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null)
  if [ -n "$STILL_LISTENING" ]; then
    echo "Post-Shutdown Port Check: FAILED - Port 3000 still occupied" >> "$TMP_LOG_FILE"
    echo "$STILL_LISTENING" >> "$TMP_LOG_FILE"
    PORT_3000_FREE_AFTER_SHUTDOWN=false
    SERVER_SHUTDOWN_EXIT_CODE=1
    OVERALL_EXIT_CODE=1
  else
    echo "Post-Shutdown Port Check: PASSED - Port 3000 verified FREE" >> "$TMP_LOG_FILE"
    PORT_3000_FREE_AFTER_SHUTDOWN=true
  fi
}

# Atomic Non-Destructive Evidence Publication Function
publish_evidence_once() {
  if [ "$PUBLISH_DONE" = "true" ]; then
    return 0
  fi
  PUBLISH_DONE=true

  echo "============================================================" >> "$TMP_LOG_FILE"
  echo "SUMMARY BLOCK" >> "$TMP_LOG_FILE"
  echo "ATTEMPT_ID=$ATTEMPT_ID" >> "$TMP_LOG_FILE"
  echo "TESTED_CODE_COMMIT=$TESTED_CODE_COMMIT" >> "$TMP_LOG_FILE"
  echo "RUNNER_COMMIT=$RUNNER_COMMIT" >> "$TMP_LOG_FILE"
  echo "BUILD_COMMIT=$BUILD_COMMIT" >> "$TMP_LOG_FILE"
  echo "SERVER_SOURCE_COMMIT=$SERVER_SOURCE_COMMIT" >> "$TMP_LOG_FILE"
  echo "ALL_GATES_EXIT_CODE=$OVERALL_EXIT_CODE" >> "$TMP_LOG_FILE"
  echo "FINAL_IDENTITY_EXIT_CODE=$FINAL_IDENTITY_EXIT_CODE" >> "$TMP_LOG_FILE"
  echo "FINAL_SOURCE_INTEGRITY_EXIT_CODE=$FINAL_SOURCE_INTEGRITY_EXIT_CODE" >> "$TMP_LOG_FILE"
  echo "SERVER_SHUTDOWN_EXIT_CODE=$SERVER_SHUTDOWN_EXIT_CODE" >> "$TMP_LOG_FILE"
  echo "PORT_3000_FREE_AFTER_SHUTDOWN=$PORT_3000_FREE_AFTER_SHUTDOWN" >> "$TMP_LOG_FILE"
  echo "TERMINATION_REASON=$TERMINATION_REASON" >> "$TMP_LOG_FILE"

  if [ "$OVERALL_EXIT_CODE" -eq 0 ] && \
     [ "$FINAL_IDENTITY_EXIT_CODE" -eq 0 ] && \
     [ "$FINAL_SOURCE_INTEGRITY_EXIT_CODE" -eq 0 ] && \
     [ "$SERVER_SHUTDOWN_EXIT_CODE" -eq 0 ] && \
     [ "$TERMINATION_REASON" = "NORMAL_COMPLETION" ]; then
    FINAL_ACCEPTANCE_ELIGIBLE=true
    LABEL="FINAL CANDIDATE — ALL GATES PASSED"
  else
    FINAL_ACCEPTANCE_ELIGIBLE=false
    if [ "$TERMINATION_REASON" = "NORMAL_COMPLETION" ]; then
      LABEL="DIAGNOSTIC ATTEMPT — ONE OR MORE GATES FAILED"
    elif [[ "$TERMINATION_REASON" == INTERRUPTED_* ]]; then
      LABEL="DIAGNOSTIC ATTEMPT — INTERRUPTED (${TERMINATION_REASON#INTERRUPTED_})"
    else
      LABEL="DIAGNOSTIC ATTEMPT — FAILED ($TERMINATION_REASON)"
    fi
  fi

  echo "LABEL=$LABEL" >> "$TMP_LOG_FILE"
  echo "EVIDENCE_PUBLICATION_PATH=$CANDIDATE_PUBLISH_PATH" >> "$TMP_LOG_FILE"
  echo "FINAL_ACCEPTANCE_ELIGIBLE=$FINAL_ACCEPTANCE_ELIGIBLE" >> "$TMP_LOG_FILE"
  echo "============================================================" >> "$TMP_LOG_FILE"

  # Perform Atomic Publication
  if [ -e "$CANDIDATE_PUBLISH_PATH" ]; then
    echo "EVIDENCE PUBLICATION ERROR: Destination file $CANDIDATE_PUBLISH_PATH already exists!" >&2
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  TMP_PUB_PATH="$WEB_DIR/Files/.tmp-pub-${INITIAL_HEAD}-${ATTEMPT_ID}.log"
  if ! cp "$TMP_LOG_FILE" "$TMP_PUB_PATH"; then
    echo "EVIDENCE PUBLICATION ERROR: Failed to copy temporary log to $TMP_PUB_PATH" >&2
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  if [ ! -f "$TMP_PUB_PATH" ]; then
    echo "EVIDENCE PUBLICATION ERROR: Temporary published file $TMP_PUB_PATH missing" >&2
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  SRC_BYTES=$(wc -c < "$TMP_LOG_FILE" | tr -d ' ')
  DEST_BYTES=$(wc -c < "$TMP_PUB_PATH" | tr -d ' ')
  if [ "$SRC_BYTES" -ne "$DEST_BYTES" ]; then
    echo "EVIDENCE PUBLICATION ERROR: Byte count mismatch ($SRC_BYTES vs $DEST_BYTES)" >&2
    rm -f "$TMP_PUB_PATH"
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  SRC_HASH=$(shasum -a 256 "$TMP_LOG_FILE" | awk '{print $1}')
  DEST_HASH=$(shasum -a 256 "$TMP_PUB_PATH" | awk '{print $1}')

  if [ -z "$SRC_HASH" ] || [ "$SRC_HASH" != "$DEST_HASH" ]; then
    echo "EVIDENCE PUBLICATION ERROR: SHA256 mismatch ($SRC_HASH vs $DEST_HASH)" >&2
    rm -f "$TMP_PUB_PATH"
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  if ! mv "$TMP_PUB_PATH" "$CANDIDATE_PUBLISH_PATH"; then
    echo "EVIDENCE PUBLICATION ERROR: Failed to move verified file to $CANDIDATE_PUBLISH_PATH" >&2
    rm -f "$TMP_PUB_PATH"
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  FINAL_VERIFIED_HASH=$(shasum -a 256 "$CANDIDATE_PUBLISH_PATH" | awk '{print $1}')
  if [ -z "$FINAL_VERIFIED_HASH" ] || [ "$FINAL_VERIFIED_HASH" != "$SRC_HASH" ]; then
    echo "EVIDENCE PUBLICATION ERROR: Final published hash mismatch ($FINAL_VERIFIED_HASH vs $SRC_HASH)" >&2
    LABEL="DIAGNOSTIC ATTEMPT — EVIDENCE PUBLICATION FAILED"
    FINAL_ACCEPTANCE_ELIGIBLE=false
    PUBLICATION_EXIT_CODE=1
    return 1
  fi

  echo "Published candidate evidence artifact: $CANDIDATE_PUBLISH_PATH"
  echo "EVIDENCE_SHA256=$FINAL_VERIFIED_HASH"
  PUBLICATION_EXIT_CODE=0
  return 0
}

release_owned_lock() {
  if [ "$LOCK_RELEASED" = "true" ]; then
    return
  fi
  LOCK_RELEASED=true
  if [ -d "$LOCK_DIR" ]; then
    LOCK_OWNER=$(cat "$LOCK_DIR/runner.pid" 2>/dev/null || echo "")
    if [ "$LOCK_OWNER" = "$OWNER_PID" ]; then
      rm -rf "$LOCK_DIR"
      echo "Lock directory $LOCK_DIR released cleanly." >> "$TMP_LOG_FILE" 2>/dev/null
    fi
  fi
}

cleanup_on_exit() {
  ORIGINAL_EXIT=$?
  if [ "$CLEANUP_DONE" = "true" ]; then
    return
  fi
  CLEANUP_DONE=true
  trap '' EXIT INT TERM HUP

  stop_owned_server

  if [ "$ORIGINAL_EXIT" -ne 0 ]; then
    OVERALL_EXIT_CODE=1
    if [ "$TERMINATION_REASON" = "INITIALIZING" ] || [ "$TERMINATION_REASON" = "NORMAL_COMPLETION" ]; then
      TERMINATION_REASON="EARLY_FAILURE_EXIT_$ORIGINAL_EXIT"
    fi
  fi

  publish_evidence_once
  PUB_EXIT=$?

  release_owned_lock

  if [ "$ORIGINAL_EXIT" -ne 0 ]; then
    exit "$ORIGINAL_EXIT"
  elif [ "$PUB_EXIT" -ne 0 ]; then
    exit "$PUB_EXIT"
  else
    exit "$OVERALL_EXIT_CODE"
  fi
}

handle_signal() {
  SIG_NAME=$1
  SIG_CODE=$2
  if [ "$CLEANUP_DONE" = "true" ]; then
    exit "$SIG_CODE"
  fi
  CLEANUP_DONE=true
  trap '' EXIT INT TERM HUP

  echo "CRITICAL WARNING: Runner received signal $SIG_NAME (Exit code: $SIG_CODE). Terminating execution..." >> "$TMP_LOG_FILE"
  OVERALL_EXIT_CODE=1
  TERMINATION_REASON="INTERRUPTED_$SIG_NAME"

  stop_owned_server
  publish_evidence_once
  release_owned_lock

  exit "$SIG_CODE"
}

trap 'cleanup_on_exit' EXIT
trap 'handle_signal INT 130' INT
trap 'handle_signal TERM 143' TERM
trap 'handle_signal HUP 129' HUP

mkdir -p "$WEB_DIR/Files"
echo "=== UX-V2-D4-C1 EXECUTABLE ACCEPTANCE RUNNER ===" > "$TMP_LOG_FILE"
echo "Attempt ID: $ATTEMPT_ID" >> "$TMP_LOG_FILE"
echo "Temporary Log Path: $TMP_LOG_FILE" >> "$TMP_LOG_FILE"
echo "Timestamp: $(date -u)" >> "$TMP_LOG_FILE"
echo "Repository Path: $REPO_ROOT" >> "$TMP_LOG_FILE"
echo "Branch: $(git -C "$REPO_ROOT" branch --show-current)" >> "$TMP_LOG_FILE"
echo "INITIAL_HEAD=$INITIAL_HEAD" >> "$TMP_LOG_FILE"
echo "Commit Subject: $(git -C "$REPO_ROOT" log -1 --format='%s')" >> "$TMP_LOG_FILE"
echo "Worktree Status at Start:" >> "$TMP_LOG_FILE"
git -C "$REPO_ROOT" status --short >> "$TMP_LOG_FILE"
echo "" >> "$TMP_LOG_FILE"

# Section 9: Phase Boundary Commit & Full Executable Source Scope Verification
verify_phase_identity() {
  PHASE_NAME=$1
  OBSERVED_HEAD=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)

  RUNNER_DIFF=$(git -C "$REPO_ROOT" diff --exit-code "$INITIAL_HEAD" -- apps/web/run_gates.sh 2>/dev/null; echo $?)
  SCOPE_UNSTAGED_DIFF=$(git -C "$REPO_ROOT" diff --exit-code "$INITIAL_HEAD" -- apps/web/app apps/web/components apps/web/lib apps/web/__tests__ apps/web/run_gates.sh 2>/dev/null; echo $?)
  SCOPE_STAGED_DIFF=$(git -C "$REPO_ROOT" diff --cached --exit-code "$INITIAL_HEAD" -- apps/web/app apps/web/components apps/web/lib apps/web/__tests__ apps/web/run_gates.sh 2>/dev/null; echo $?)

  echo "[IDENTITY & SOURCE SCOPE CHECK] Phase: $PHASE_NAME" >> "$TMP_LOG_FILE"
  echo "  Expected Commit: $INITIAL_HEAD" >> "$TMP_LOG_FILE"
  echo "  Observed Commit: $OBSERVED_HEAD" >> "$TMP_LOG_FILE"
  echo "  Runner Diff Exit Code: $RUNNER_DIFF" >> "$TMP_LOG_FILE"
  echo "  Scope Unstaged Diff Exit Code: $SCOPE_UNSTAGED_DIFF" >> "$TMP_LOG_FILE"
  echo "  Scope Staged Diff Exit Code: $SCOPE_STAGED_DIFF" >> "$TMP_LOG_FILE"

  if [ "$OBSERVED_HEAD" != "$INITIAL_HEAD" ] || [ "$RUNNER_DIFF" -ne 0 ] || [ "$SCOPE_UNSTAGED_DIFF" -ne 0 ] || [ "$SCOPE_STAGED_DIFF" -ne 0 ]; then
    echo "  IDENTITY & SOURCE SCOPE CHECK FAILED at phase '$PHASE_NAME'" >> "$TMP_LOG_FILE"
    FINAL_IDENTITY_EXIT_CODE=1
    OVERALL_EXIT_CODE=1
    TERMINATION_REASON="IDENTITY_MISMATCH_$PHASE_NAME"
    return 1
  fi
  echo "  IDENTITY & SOURCE SCOPE CHECK PASSED" >> "$TMP_LOG_FILE"
  return 0
}

# Section 8: Port 3000 Occupancy Assertion
assert_port_3000_free() {
  CHECK_POINT=$1
  LISTENER=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null)
  if [ -n "$LISTENER" ]; then
    echo "BLOCKED — PORT 3000 OCCUPIED BY UNAUTHORIZED PROCESS at check '$CHECK_POINT'" >> "$TMP_LOG_FILE"
    echo "$LISTENER" >> "$TMP_LOG_FILE"
    OVERALL_EXIT_CODE=1
    TERMINATION_REASON="PORT_3000_OCCUPIED_$CHECK_POINT"
    return 1
  fi
  echo "[PORT CHECK] Port 3000 verified FREE at check '$CHECK_POINT'" >> "$TMP_LOG_FILE"
  return 0
}

# Option B Descendant-Chain Verification Helper
verify_listener_ancestry() {
  TARGET_LAUNCHER=$1

  LISTENERS=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}' | sort -u)
  NUM_LISTENERS=$(echo "$LISTENERS" | grep -c '[0-9]' || echo 0)

  if [ "$NUM_LISTENERS" -ne 1 ]; then
    echo "Server Ownership Verification: FAILED (Expected exactly 1 listener PID on port 3000, found $NUM_LISTENERS)" >> "$TMP_LOG_FILE"
    return 1
  fi

  CHECK_LISTENER_PID=$(echo "$LISTENERS" | tr -d ' ')
  SERVER_LISTENER_PID="$CHECK_LISTENER_PID"
  SERVER_LISTENER_COMMAND=$(ps -p "$SERVER_LISTENER_PID" -o command= 2>/dev/null || echo "UNKNOWN")

  echo "SERVER_LISTENER_PID=$SERVER_LISTENER_PID" >> "$TMP_LOG_FILE"
  echo "SERVER_LISTENER_COMMAND=$SERVER_LISTENER_COMMAND" >> "$TMP_LOG_FILE"

  CUR_PID="$SERVER_LISTENER_PID"
  DEPTH=0
  ANCESTRY_CHAIN="$CUR_PID"
  FOUND_ANCESTOR=false

  while [ -n "$CUR_PID" ] && [ "$CUR_PID" -gt 1 ] && [ "$DEPTH" -lt 10 ]; do
    if [ "$CUR_PID" -eq "$TARGET_LAUNCHER" ]; then
      FOUND_ANCESTOR=true
      break
    fi
    PARENT_PID=$(ps -o ppid= -p "$CUR_PID" 2>/dev/null | tr -d ' ')
    if [ -z "$PARENT_PID" ] || [ "$PARENT_PID" -eq "$CUR_PID" ]; then
      break
    fi
    ANCESTRY_CHAIN="$ANCESTRY_CHAIN -> $PARENT_PID"
    CUR_PID="$PARENT_PID"
    DEPTH=$((DEPTH + 1))
  done

  if [ "$CUR_PID" -eq "$TARGET_LAUNCHER" ]; then
    FOUND_ANCESTOR=true
  fi

  VERIFIED_ANCESTRY_CHAIN="$ANCESTRY_CHAIN"
  echo "VERIFIED_ANCESTRY_CHAIN=$VERIFIED_ANCESTRY_CHAIN" >> "$TMP_LOG_FILE"

  if [ "$FOUND_ANCESTOR" = "true" ]; then
    echo "Server Ownership Verification: PASSED (Listener $SERVER_LISTENER_PID ancestry reaches launcher $TARGET_LAUNCHER via chain: $ANCESTRY_CHAIN)" >> "$TMP_LOG_FILE"
    return 0
  else
    echo "Server Ownership Verification: FAILED (Listener $SERVER_LISTENER_PID ancestry chain '$ANCESTRY_CHAIN' does not reach launcher $TARGET_LAUNCHER)" >> "$TMP_LOG_FILE"
    return 1
  fi
}

kill_owned_tree() {
  local target_pid=$1
  local sig=${2:-TERM}

  if [ -z "$target_pid" ] || ! ps -p "$target_pid" >/dev/null 2>&1; then
    return
  fi

  get_all_descendants() {
    local p=$1
    local children=$(ps -eo pid=,ppid= 2>/dev/null | awk -v parent="$p" '$2 == parent {print $1}')
    for c in $children; do
      get_all_descendants "$c"
      echo "$c"
    done
  }

  local all_pids=$(get_all_descendants "$target_pid" | sort -u)

  for p in $all_pids; do
    kill -"$sig" "$p" 2>/dev/null
  done

  kill -"$sig" "$target_pid" 2>/dev/null
}

run_gate() {
  GATE_NUM=$1
  GATE_TITLE=$2
  CMD=$3
  TIMEOUT_SEC=${4:-120}

  GATE_START=$(date -u)
  GATE_START_SEC=$(date +%s)
  echo "============================================================" >> "$TMP_LOG_FILE"
  echo "GATE $GATE_NUM: $GATE_TITLE (Timeout Limit: ${TIMEOUT_SEC}s)" >> "$TMP_LOG_FILE"
  echo "Command: $CMD" >> "$TMP_LOG_FILE"
  echo "Start Time: $GATE_START" >> "$TMP_LOG_FILE"
  echo "------------------------------------------------------------" >> "$TMP_LOG_FILE"

  ( eval "$CMD" ) >> "$TMP_LOG_FILE" 2>&1 &
  GATE_SUBPID=$!

  GATE_EXIT=0
  for (( elapsed=1; elapsed<=TIMEOUT_SEC; elapsed++ )); do
    if ! ps -p "$GATE_SUBPID" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ps -p "$GATE_SUBPID" >/dev/null 2>&1; then
    GATE_EXIT=124
    OVERALL_EXIT_CODE=1
    TERMINATION_REASON="GATE_${GATE_NUM}_TIMEOUT"
    echo "GATE_TIMEOUT=true" >> "$TMP_LOG_FILE"
    echo "GATE TIMEOUT EXCEEDED: Gate $GATE_NUM ($GATE_TITLE) exceeded ${TIMEOUT_SEC}s limit. Terminating subshell process tree..." >> "$TMP_LOG_FILE"

    kill_owned_tree "$GATE_SUBPID" TERM
    sleep 2
    if ps -p "$GATE_SUBPID" >/dev/null 2>&1; then
      kill_owned_tree "$GATE_SUBPID" KILL
    fi
    wait "$GATE_SUBPID" 2>/dev/null
  else
    wait "$GATE_SUBPID" 2>/dev/null
    GATE_EXIT=$?
    if [ "$GATE_EXIT" -ne 0 ]; then
      OVERALL_EXIT_CODE=1
      TERMINATION_REASON="GATE_${GATE_NUM}_FAILED"
    fi
  fi

  GATE_END=$(date -u)
  GATE_END_SEC=$(date +%s)
  GATE_DURATION=$((GATE_END_SEC - GATE_START_SEC))

  echo "------------------------------------------------------------" >> "$TMP_LOG_FILE"
  echo "Gate Number: $GATE_NUM" >> "$TMP_LOG_FILE"
  echo "Gate Name: $GATE_TITLE" >> "$TMP_LOG_FILE"
  echo "Exit Code: $GATE_EXIT" >> "$TMP_LOG_FILE"
  echo "Duration: ${GATE_DURATION}s" >> "$TMP_LOG_FILE"
  echo "End Time: $GATE_END" >> "$TMP_LOG_FILE"
  echo "============================================================" >> "$TMP_LOG_FILE"
  echo "" >> "$TMP_LOG_FILE"
  return $GATE_EXIT
}

cd "$WEB_DIR"

# Phase A & B: Identity Check and Non-Browser Gates
verify_phase_identity "Runner Start" || exit 1
assert_port_3000_free "Before Non-Browser Execution" || exit 1

TESTED_CODE_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)
RUNNER_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)

verify_phase_identity "Before Gate 1" || exit 1

run_gate "1" "ProofContractReadiness Vitest" "npx vitest run __tests__/day4/ProofContractReadiness.test.js" 120
run_gate "2" "SourcingSessionSecurity Vitest" "npx vitest run __tests__/security/SourcingSessionSecurity.test.js" 180
run_gate "3" "HiringRunSecurity Vitest" "npx vitest run __tests__/security/HiringRunSecurity.test.js" 180
run_gate "4" "ShortlistSecurity Vitest" "npx vitest run __tests__/security/ShortlistSecurity.test.js" 180
run_gate "5" "EmployerWorkspaceSecurity Vitest" "npx vitest run __tests__/security/EmployerWorkspaceSecurity.test.js" 180
run_gate "6" "Full Discovered Vitest Suite Regression" "npx vitest run" 600
run_gate "7" "Directory-Scoped ESLint Audit" "npx eslint app/employer \"app/employer/brief/[id]/page.jsx\" app/api/employer components lib __tests__/day4 __tests__/day3 __tests__/chat __tests__/packet __tests__/security" 300

# Verify non-browser success before proceeding to build
if [ "$OVERALL_EXIT_CODE" -ne 0 ]; then
  echo "PREREQUISITE FAILURE: One or more non-browser gates failed. Halting before Phase C build." >> "$TMP_LOG_FILE"
  exit 1
fi

verify_phase_identity "After Non-Browser Tests (Before Build)" || exit 1
assert_port_3000_free "Immediately Before Production Build" || exit 1

BUILD_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)

# Phase C: Production Build
run_gate "8" "Next.js Production Build" "npm run build" 600
BUILD_EXIT_CODE=$?

if [ "$BUILD_EXIT_CODE" -ne 0 ]; then
  echo "BUILD FAILURE: Next.js production build failed (Exit Code: $BUILD_EXIT_CODE). Halting before server launch." >> "$TMP_LOG_FILE"
  OVERALL_EXIT_CODE=1
  TERMINATION_REASON="BUILD_FAILED"
  exit 1
fi

verify_phase_identity "Immediately After Production Build" || exit 1
assert_port_3000_free "Immediately Before Production Server Launch" || exit 1

# Phase D: Committed Production Server Launch
SERVER_SOURCE_COMMIT=$(git -C "$REPO_ROOT" rev-parse HEAD)

echo "Starting Next.js production server from commit $SERVER_SOURCE_COMMIT on port 3000..." >> "$TMP_LOG_FILE"
npm run start -- -p 3000 >> "$TMP_LOG_FILE" 2>&1 &
SERVER_LAUNCHER_PID=$!
echo "SERVER_LAUNCHER_PID=$SERVER_LAUNCHER_PID" >> "$TMP_LOG_FILE"
echo "SERVER_SOURCE_COMMIT=$SERVER_SOURCE_COMMIT" >> "$TMP_LOG_FILE"

# Readiness Probe
PROBE_OK=false
HTTP_CODE="000"
CURL_TRANSPORT_EXIT=1

for i in {1..30}; do
  HTTP_OUTPUT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
  CURL_TRANSPORT_EXIT=$?
  if [ "$CURL_TRANSPORT_EXIT" -eq 0 ] && [ "$HTTP_OUTPUT" = "200" ]; then
    PROBE_OK=true
    HTTP_CODE="200"
    break
  fi
  sleep 1
done

echo "PRODUCTION_SERVER_READINESS_HTTP_CODE=$HTTP_CODE" >> "$TMP_LOG_FILE"
echo "PRODUCTION_SERVER_READINESS_EXIT_CODE=$CURL_TRANSPORT_EXIT" >> "$TMP_LOG_FILE"

if [ "$PROBE_OK" != "true" ]; then
  echo "Production Server Readiness Probe: FAILED (HTTP $HTTP_CODE, Transport Exit: $CURL_TRANSPORT_EXIT)" >> "$TMP_LOG_FILE"
  OVERALL_EXIT_CODE=1
  TERMINATION_REASON="READINESS_PROBE_FAILED"
  exit 1
fi

# Verify Server Listener Ancestry Ownership (Option B)
if ! verify_listener_ancestry "$SERVER_LAUNCHER_PID"; then
  OVERALL_EXIT_CODE=1
  TERMINATION_REASON="SERVER_OWNERSHIP_FAILED"
  exit 1
fi

verify_phase_identity "After Server Readiness Succeeded" || exit 1

# Phase E: Browser Execution (Playwright)
run_gate "9" "Day 4 Playwright UAT Assertions" "npx playwright test __tests__/day4/EmployerDay4Assertions.test.js --workers=1 --reporter=line" 900
run_gate "10" "Day 3 Playwright Regression" "npx playwright test __tests__/day3/EmployerDay3Assertions.test.js --workers=1 --reporter=line" 900
run_gate "11" "Employer Chat Playwright Regression" "npx playwright test __tests__/chat/EmployerChatAssertions.test.js --workers=1 --reporter=line" 900
run_gate "12" "Candidate Trust Packet Playwright Regression" "npx playwright test __tests__/packet/CandidateTrustPacketAssertions.test.js --workers=1 --reporter=line" 900

verify_phase_identity "After All Playwright Suites" || exit 1

# Phase F: Server Shutdown
stop_owned_server

# Phase G: Executable Worktree Integrity Assertion & Exact Allowlist Evaluation (Gate 13)
RAW_STATUS=$(git -C "$REPO_ROOT" status --short)
PORCELAIN_STATUS=$(git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=all)

SCOPED_DIFF=$(git -C "$REPO_ROOT" diff --exit-code HEAD -- apps/web/app apps/web/components apps/web/lib apps/web/__tests__ apps/web/run_gates.sh 2>/dev/null; echo $?)
RUNNER_DIFF=$(git -C "$REPO_ROOT" diff --exit-code HEAD -- apps/web/run_gates.sh 2>/dev/null; echo $?)

echo "============================================================" >> "$TMP_LOG_FILE"
echo "GATE 13: Executable Repository & Source Integrity Assertion" >> "$TMP_LOG_FILE"
echo "RAW_WORKTREE_STATUS:" >> "$TMP_LOG_FILE"
echo "$RAW_STATUS" >> "$TMP_LOG_FILE"

ALLOWLIST_REJECTED=false
echo "PARSED_WORKTREE_ALLOWLIST_EVALUATION:" >> "$TMP_LOG_FILE"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  RAW_PATH="${line:3}"
  CLEAN_PATH=$(echo "$RAW_PATH" | sed -e 's/^"//' -e 's/"$//')

  if [ "$CLEAN_PATH" = "apps/web/Files/UX-V2-D4-C1-COMBINED-EXECUTION.log" ] || \
     [ "$CLEAN_PATH" = "apps/web/Files/UX-V2-D4-C1-CANCELLED-ATTEMPT.log" ] || \
     [ "$CLEAN_PATH" = "$CANDIDATE_PUBLISH_REL_PATH" ]; then
    echo "  [ALLOWLIST] Path: $CLEAN_PATH -> ALLOWED" >> "$TMP_LOG_FILE"
  else
    echo "  [ALLOWLIST] Path: $CLEAN_PATH -> REJECTED (UNEXPECTED WORKTREE PATH)" >> "$TMP_LOG_FILE"
    ALLOWLIST_REJECTED=true
  fi
done <<< "$PORCELAIN_STATUS"

echo "SCOPED_SOURCE_DIFF_EXIT_CODE=$SCOPED_DIFF" >> "$TMP_LOG_FILE"
echo "RUNNER_DIFF_EXIT_CODE=$RUNNER_DIFF" >> "$TMP_LOG_FILE"

FINAL_HEAD=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)
if [ "$FINAL_HEAD" = "$INITIAL_HEAD" ]; then
  FINAL_HEAD_IDENTITY_EXIT_CODE=0
else
  FINAL_HEAD_IDENTITY_EXIT_CODE=1
fi
echo "FINAL_HEAD_IDENTITY_EXIT_CODE=$FINAL_HEAD_IDENTITY_EXIT_CODE" >> "$TMP_LOG_FILE"

if [ "$SCOPED_DIFF" -eq 0 ] && [ "$RUNNER_DIFF" -eq 0 ] && [ "$FINAL_HEAD_IDENTITY_EXIT_CODE" -eq 0 ] && [ "$ALLOWLIST_REJECTED" = "false" ]; then
  GATE_13_EXIT_CODE=0
  echo "Executable Integrity Gate: PASSED - WORKTREE CONTAINS ALLOWED HISTORICAL EVIDENCE FILES; EXECUTABLE SOURCE TREE IS CLEAN" >> "$TMP_LOG_FILE"
else
  GATE_13_EXIT_CODE=1
  OVERALL_EXIT_CODE=1
  FINAL_SOURCE_INTEGRITY_EXIT_CODE=1
  TERMINATION_REASON="GATE_13_INTEGRITY_FAILED"
  echo "Executable Integrity Gate: FAILED - Scoped source modified, unallowed path present, or HEAD identity mutated" >> "$TMP_LOG_FILE"
fi

echo "Exit Code: $GATE_13_EXIT_CODE" >> "$TMP_LOG_FILE"
echo "============================================================" >> "$TMP_LOG_FILE"
echo "" >> "$TMP_LOG_FILE"

verify_phase_identity "Before Final Evidence Publication" || exit 1

TERMINATION_REASON="NORMAL_COMPLETION"

exit "$OVERALL_EXIT_CODE"
