#!/bin/bash
REPO_ROOT="/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo"
WEB_DIR="$REPO_ROOT/apps/web"
LOCK_DIR="/tmp/UX-V2-D4-C1-runner-synthetic.lock"

rm -rf "$LOCK_DIR"
mkdir -p "$LOCK_DIR"
OWNER_PID=$$
echo "$OWNER_PID" > "$LOCK_DIR/runner.pid"

INITIAL_HEAD=$(git -C "$REPO_ROOT" rev-parse HEAD)
ATTEMPT_ID="SYNTHETIC-$(date -u +%Y%m%dT%H%M%SZ)-$$"
TMP_LOG_FILE=$(mktemp "/tmp/SYNTHETIC-${ATTEMPT_ID}-XXXXXX.log")

CLEANUP_DONE=false
LOCK_RELEASED=false
PUBLISH_DONE=false
OVERALL_EXIT_CODE=0
FINAL_IDENTITY_EXIT_CODE=0
FINAL_SOURCE_INTEGRITY_EXIT_CODE=0
SERVER_SHUTDOWN_EXIT_CODE=0
PORT_3000_FREE_AFTER_SHUTDOWN=true
PUBLICATION_EXIT_CODE=0
FINAL_ACCEPTANCE_ELIGIBLE=false
LABEL="INITIALIZING"
TERMINATION_REASON="INITIALIZING"

CANDIDATE_PUBLISH_REL_PATH="apps/web/Files/UX-V2-D4-C1-SYNTHETIC-${ATTEMPT_ID}.log"
CANDIDATE_PUBLISH_PATH="$REPO_ROOT/$CANDIDATE_PUBLISH_REL_PATH"

mkdir -p "$WEB_DIR/Files"

kill_owned_tree() {
  local target_pid=$1
  local sig=${2:-TERM}

  if [ -z "$target_pid" ]; then
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

publish_evidence_once() {
  if [ "$PUBLISH_DONE" = "true" ]; then return 0; fi
  PUBLISH_DONE=true
  echo "SUMMARY BLOCK" >> "$TMP_LOG_FILE"
  echo "ALL_GATES_EXIT_CODE=$OVERALL_EXIT_CODE" >> "$TMP_LOG_FILE"
  echo "TERMINATION_REASON=$TERMINATION_REASON" >> "$TMP_LOG_FILE"
  cp "$TMP_LOG_FILE" "$CANDIDATE_PUBLISH_PATH"
}

release_owned_lock() {
  if [ "$LOCK_RELEASED" = "true" ]; then return; fi
  LOCK_RELEASED=true
  rm -rf "$LOCK_DIR"
}

cleanup_on_exit() {
  publish_evidence_once
  release_owned_lock
}

echo "=== SYNTHETIC WATCHDOG PROCESS OWNERSHIP TEST ===" > "$TMP_LOG_FILE"

cat << 'NESTOEF' > /tmp/synth_tree_launcher.sh
#!/bin/bash
(
  (
    sleep 300 &
    echo $! > /tmp/synth_gc.pid
    wait
  ) &
  echo $! > /tmp/synth_child.pid
  wait
) &
echo $! > /tmp/synth_parent.pid
wait
NESTOEF
chmod +x /tmp/synth_tree_launcher.sh

run_gate "1" "Synthetic Stalled Gate" "/tmp/synth_tree_launcher.sh" 2 &
RUNNER_GATE_PID=$!

sleep 1
SYNTH_PARENT=$(cat /tmp/synth_parent.pid 2>/dev/null)
SYNTH_CHILD=$(cat /tmp/synth_child.pid 2>/dev/null)
SYNTH_GC=$(cat /tmp/synth_gc.pid 2>/dev/null)

echo "SYNTHETIC PIDS BEFORE WATCHDOG FIRES:"
echo "  RUNNER_GATE_PID=$RUNNER_GATE_PID (alive: $(ps -p $RUNNER_GATE_PID >/dev/null 2>&1 && echo true || echo false))"
echo "  PARENT_PID=$SYNTH_PARENT (alive: $(ps -p $SYNTH_PARENT >/dev/null 2>&1 && echo true || echo false))"
echo "  CHILD_PID=$SYNTH_CHILD (alive: $(ps -p $SYNTH_CHILD >/dev/null 2>&1 && echo true || echo false))"
echo "  GRANDCHILD_PID=$SYNTH_GC (alive: $(ps -p $SYNTH_GC >/dev/null 2>&1 && echo true || echo false))"

wait $RUNNER_GATE_PID
GATE1_EXIT=$?
echo "GATE 1 EXIT CODE: $GATE1_EXIT"

# Verify Later Synthetic Gate HALTS
GATE_2_EXECUTED=false
if [ "$OVERALL_EXIT_CODE" -ne 0 ]; then
  echo "PREREQUISITE FAILURE: Halting before Gate 2." >> "$TMP_LOG_FILE"
else
  run_gate "2" "Synthetic Gate 2" "echo ok" 10
  GATE_2_EXECUTED=true
fi

cleanup_on_exit

echo ""
echo "=== VERIFICATION OF PROCESS DEATH AFTER WATCHDOG FIRES ==="
echo "PARENT PID $SYNTH_PARENT ALIVE? $([ -n "$SYNTH_PARENT" ] && ps -p $SYNTH_PARENT >/dev/null 2>&1 && echo true || echo false)"
echo "CHILD PID $SYNTH_CHILD ALIVE? $([ -n "$SYNTH_CHILD" ] && ps -p $SYNTH_CHILD >/dev/null 2>&1 && echo true || echo false)"
echo "GRANDCHILD PID $SYNTH_GC ALIVE? $([ -n "$SYNTH_GC" ] && ps -p $SYNTH_GC >/dev/null 2>&1 && echo true || echo false)"

echo ""
echo "=== VERIFICATION OF WATCHDOG LOG & STATE PROPERTIES ==="
echo "GATE 1 EXIT CODE == 124? $([ "$GATE1_EXIT" -eq 124 ] && echo true || echo false)"
echo "GATE_TIMEOUT=true LOGGED? $(grep -q "GATE_TIMEOUT=true" "$TMP_LOG_FILE" && echo true || echo false)"
echo "GATE 2 EXECUTED? $GATE_2_EXECUTED"
echo "EVIDENCE PUBLISHED ONCE? $([ -f "$CANDIDATE_PUBLISH_PATH" ] && echo true || echo false)"
echo "LOCK RELEASED? $([ ! -d "$LOCK_DIR" ] && echo true || echo false)"

# Clean synthetic publish file
rm -f "$CANDIDATE_PUBLISH_PATH" /tmp/synth_parent.pid /tmp/synth_child.pid /tmp/synth_gc.pid /tmp/synth_tree_launcher.sh /tmp/SYNTHETIC-*.log
