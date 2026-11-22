#!/usr/bin/env bash
# ==============================================================================
# WorkByLine V3 — Unified Database Target Safety Guard (Bash)
# Enforces strict fail-closed rejection of the protected baseline database and
# non-disposable targets by parsing effective connection parameters:
#   - Protected container: supabase_db_careertwin-local-baseline (case-insensitive)
#   - Protected port: 54332 (across URL authority, URL query, and libpq key-value)
#   - Rejects URL query overrides (?host=..., ?port=..., ?dbname=..., ?hostaddr=...)
#   - Rejects duplicate parameters in URL query strings or libpq strings
#   - Never matches disposable keywords against passwords, usernames, or query params
#   - Concurrency-safe, service_role-only verify_disposable_correspondence
# ==============================================================================

# Safe Target Redaction: Extracts safe host/port/db/user identity without credentials
mask_target_identity() {
  local raw="$1"
  if [ -z "${raw}" ]; then
    echo "none"
    return
  fi

  local lower
  lower="$(echo "${raw}" | tr '[:upper:]' '[:lower:]')"

  # Handle URLs (postgres://, postgresql://, postgresql+psycopg://, etc.)
  if [[ "${lower}" =~ ^[a-z0-9\+]+:// ]]; then
    local no_proto="${raw#*://}"
    local auth_part=""
    local host_part=""
    local user="unknown"
    local host="localhost"
    local port="5432"
    local db="postgres"

    # Strip query string and fragment BEFORE splitting on '@' so '@' in query params cannot leak auth
    local no_query="${no_proto%%\?*}"
    no_query="${no_query%%#*}"

    if [[ "${no_query}" =~ @ ]]; then
      auth_part="${no_query%@*}"
      host_part="${no_query##*@}"
      user="${auth_part%%:*}"
    else
      host_part="${no_query}"
    fi

    local hp_only="${host_part}"
    if [[ "${hp_only}" =~ / ]]; then
      db="${hp_only#*/}"
      hp_only="${hp_only%%/*}"
    fi

    if [[ "${hp_only}" =~ ^\[.*\]:[0-9]+$ ]]; then
      host="${hp_only%:*}"
      port="${hp_only##*:}"
    elif [[ "${hp_only}" =~ : ]]; then
      host="${hp_only%%:*}"
      port="${hp_only##*:}"
    elif [ -n "${hp_only}" ]; then
      host="${hp_only}"
    fi

    echo "host: ${host}, port: ${port}, db: ${db}, user: ${user}"
    return
  fi

  # Handle libpq key-value strings
  if [[ "${raw}" =~ [a-zA-Z_]+[[:space:]]*= ]]; then
    local host="localhost"
    local port="5432"
    local db="postgres"
    local user="unknown"

    if [[ "${raw}" =~ (^|[[:space:]])host[[:space:]]*=[[:space:]]*[\'\"]?([^[:space:]\'\"]+) ]]; then
      host="${BASH_REMATCH[2]}"
    fi
    if [[ "${raw}" =~ (^|[[:space:]])port[[:space:]]*=[[:space:]]*[\'\"]?([^[:space:]\'\"]+) ]]; then
      port="${BASH_REMATCH[2]}"
    fi
    if [[ "${raw}" =~ (^|[[:space:]])dbname[[:space:]]*=[[:space:]]*[\'\"]?([^[:space:]\'\"]+) ]]; then
      db="${BASH_REMATCH[2]}"
    fi
    if [[ "${raw}" =~ (^|[[:space:]])user[[:space:]]*=[[:space:]]*[\'\"]?([^[:space:]\'\"]+) ]]; then
      user="${BASH_REMATCH[2]}"
    fi

    echo "host: ${host}, port: ${port}, db: ${db}, user: ${user} (libpq)"
    return
  fi

  # Handle container names
  echo "container: ${raw}"
}

# Strict target validation function: Exits with code 42 upon any protected or non-disposable target
assert_disposable_db_target() {
  local target_val="${1:-}"

  if [ -z "${target_val}" ]; then
    echo "[SECURITY REJECTION] No database target configured. Explicit disposable database target required." >&2
    exit 42
  fi

  local lower_val
  lower_val="$(echo "${target_val}" | tr '[:upper:]' '[:lower:]')"

  # 1. Protected Baseline Container Rejection (case-insensitive)
  if [[ "${lower_val}" =~ supabase_db_careertwin-local-baseline ]] || [[ "${lower_val}" =~ careertwin-local-baseline ]]; then
    echo "[SECURITY REJECTION] Target matches protected shared baseline database identity (supabase_db_careertwin-local-baseline)." >&2
    echo "[SECURITY REJECTION] Refusing mutation. Zero writes permitted to protected baseline database." >&2
    exit 42
  fi

  # 2. Format Classification
  local is_valid_url=false
  local is_valid_libpq=false
  local is_valid_container=false

  if [[ "${lower_val}" =~ ^(postgres|postgresql|postgresql\+psycopg|postgresql\+psycopg2|postgresql\+asyncpg):// ]]; then
    is_valid_url=true
  elif [[ "${target_val}" =~ (^|[[:space:]])(host|hostaddr|dbname|port|user|password|service)[[:space:]]*= ]]; then
    is_valid_libpq=true
  elif [[ "${target_val}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] && ! [[ "${target_val}" =~ / ]] && ! [[ "${target_val}" =~ : ]]; then
    is_valid_container=true
  fi

  if [ "${is_valid_url}" = "false" ] && [ "${is_valid_libpq}" = "false" ] && [ "${is_valid_container}" = "false" ]; then
    echo "[SECURITY REJECTION] Unsupported or malformed database target format: $(mask_target_identity "${target_val}")" >&2
    echo "[SECURITY REJECTION] Expected PostgreSQL URI, libpq keyword string, or valid Docker container name." >&2
    exit 42
  fi

  local parsed_host=""
  local parsed_port=""
  local parsed_db=""

  # 3A. Parse and validate PostgreSQL URI (authority, path, and query parameters)
  if [ "${is_valid_url}" = "true" ]; then
    local no_proto="${target_val#*://}"
    local query_part=""
    local before_query="${no_proto}"

    if [[ "${no_proto}" == *\?* ]]; then
      before_query="${no_proto%%\?*}"
      query_part="${no_proto#*\?}"
      query_part="${query_part%%#*}"
    else
      before_query="${no_proto%%#*}"
    fi

    local host_And_path=""
    if [[ "${before_query}" =~ @ ]]; then
      host_And_path="${before_query##*@}"
    else
      host_And_path="${before_query}"
    fi

    local hp_part="${host_And_path}"
    if [[ "${host_And_path}" == */* ]]; then
      hp_part="${host_And_path%%/*}"
      parsed_db="${host_And_path#*/}"
    fi

    if [[ "${hp_part}" =~ ^\[(.*)\]:([0-9]+)$ ]]; then
      parsed_host="${BASH_REMATCH[1]}"
      parsed_port="${BASH_REMATCH[2]}"
    elif [[ "${hp_part}" =~ ^\[(.*)\]$ ]]; then
      parsed_host="${BASH_REMATCH[1]}"
      parsed_port="5432"
    elif [[ "${hp_part}" == *:* ]]; then
      parsed_host="${hp_part%%:*}"
      parsed_port="${hp_part#*:}"
    else
      parsed_host="${hp_part}"
      parsed_port="5432"
    fi

    if [ -z "${parsed_host}" ]; then
      echo "[SECURITY REJECTION] Database URL is missing an explicit host: $(mask_target_identity "${target_val}")" >&2
      exit 42
    fi
    if ! [[ "${parsed_port}" =~ ^[0-9]+$ ]]; then
      echo "[SECURITY REJECTION] Database URL has non-numeric or malformed port '${parsed_port}': $(mask_target_identity "${target_val}")" >&2
      exit 42
    fi

    # Inspect query parameters for duplicates or host/port/dbname/service overrides
    if [ -n "${query_part}" ]; then
      local seen_qkeys="|"
      local IFS='&'
      read -r -a qpairs <<< "${query_part}"
      for qpair in "${qpairs[@]}"; do
        [ -z "${qpair}" ] && continue
        local qk="${qpair%%=*}"
        local qv=""
        if [[ "${qpair}" == *=* ]]; then
          qv="${qpair#*=}"
        fi
        local qk_lower
        qk_lower="$(echo "${qk}" | tr '[:upper:]' '[:lower:]')"
        local qv_lower
        qv_lower="$(echo "${qv}" | tr '[:upper:]' '[:lower:]')"

        if [[ "${seen_qkeys}" == *"|${qk_lower}|"* ]]; then
          echo "[SECURITY REJECTION] Duplicate query parameter '${qk_lower}' in database URL: $(mask_target_identity "${target_val}")" >&2
          exit 42
        fi
        seen_qkeys="${seen_qkeys}${qk_lower}|"

        case "${qk_lower}" in
          host|hostaddr|port|dbname|service)
            echo "[SECURITY REJECTION] Query parameter '${qk_lower}' is not permitted to override URL connection identity: $(mask_target_identity "${target_val}")" >&2
            exit 42
            ;;
        esac

        if [[ "${qv_lower}" == *"54332"* ]] || [[ "${qv_lower}" == *"careertwin-local-baseline"* ]]; then
          echo "[SECURITY REJECTION] Query parameter references protected baseline database identity." >&2
          exit 42
        fi
      done
    fi
  fi

  # 3B. Parse and validate libpq key-value string (rejecting duplicate keys and unknown overrides)
  if [ "${is_valid_libpq}" = "true" ]; then
    # Normalize whitespace around '=' so 'port = 54332' becomes 'port=54332'
    local norm_libpq
    norm_libpq="$(echo "${target_val}" | sed -E 's/[[:space:]]*=[[:space:]]*/=/g')"
    local seen_lkeys="|"
    local token
    for token in ${norm_libpq}; do
      if [[ "${token}" != *=* ]]; then
        echo "[SECURITY REJECTION] Malformed token in libpq connection string: $(mask_target_identity "${target_val}")" >&2
        exit 42
      fi
      local lk="${token%%=*}"
      local lv="${token#*=}"
      lv="${lv%\"}"
      lv="${lv#\"}"
      lv="${lv%\'}"
      lv="${lv#\'}"
      local lk_lower
      lk_lower="$(echo "${lk}" | tr '[:upper:]' '[:lower:]')"

      if [[ "${seen_lkeys}" == *"|${lk_lower}|"* ]]; then
        echo "[SECURITY REJECTION] Duplicate parameter '${lk_lower}' in libpq connection string: $(mask_target_identity "${target_val}")" >&2
        exit 42
      fi
      seen_lkeys="${seen_lkeys}${lk_lower}|"

      case "${lk_lower}" in
        host|hostaddr)
          if [ -n "${parsed_host}" ] && [ "${parsed_host}" != "${lv}" ]; then
            echo "[SECURITY REJECTION] Conflicting host and hostaddr in libpq connection string: $(mask_target_identity "${target_val}")" >&2
            exit 42
          fi
          parsed_host="${lv}"
          ;;
        port)
          parsed_port="${lv}"
          ;;
        dbname)
          parsed_db="${lv}"
          ;;
        service)
          echo "[SECURITY REJECTION] libpq service file resolution is not permitted; explicit host and port required." >&2
          exit 42
          ;;
      esac
    done

    [ -z "${parsed_host}" ] && parsed_host="localhost"
    [ -z "${parsed_port}" ] && parsed_port="5432"
    if ! [[ "${parsed_port}" =~ ^[0-9]+$ ]]; then
      echo "[SECURITY REJECTION] libpq target has non-numeric port '${parsed_port}'." >&2
      exit 42
    fi
  fi

  # 3C. Parse and validate Docker container target
  if [ "${is_valid_container}" = "true" ]; then
    parsed_host="localhost"
    parsed_port="container"
    parsed_db="${target_val}"
  fi

  # 4. Enforce Loopback Host Isolation & Protected Port 54332 Rejection
  local parsed_host_lower
  parsed_host_lower="$(echo "${parsed_host}" | tr '[:upper:]' '[:lower:]')"
  if [ "${is_valid_container}" = "false" ]; then
    if [ "${parsed_host_lower}" != "127.0.0.1" ] && [ "${parsed_host_lower}" != "localhost" ] && [ "${parsed_host_lower}" != "::1" ]; then
      echo "[SECURITY REJECTION] Host '${parsed_host}' is not a local loopback target ($(mask_target_identity "${target_val}")). Remote host mutation is strictly prohibited." >&2
      exit 42
    fi
    if [ "${parsed_port}" = "54332" ]; then
      echo "[SECURITY REJECTION] Port 54332 is bound to the protected shared baseline database ($(mask_target_identity "${target_val}"))." >&2
      echo "[SECURITY REJECTION] Refusing mutation. Zero writes permitted to port 54332." >&2
      exit 42
    fi
  fi

  # 5. Strict Positive Disposable Identity Check on Effective Port or Effective Database/Container Name ONLY
  # Never match against passwords, usernames, or query parameters!
  local parsed_db_lower
  parsed_db_lower="$(echo "${parsed_db}" | tr '[:upper:]' '[:lower:]')"
  local has_positive_identity=false

  if [ "${is_valid_container}" = "true" ]; then
    if [[ "${parsed_db_lower}" =~ (disposable|eval|temp|test|rehearsal) ]]; then
      has_positive_identity=true
    fi
  else
    # Approved disposable ports (54399, 55432, 54321, 54322, 59999)
    if [[ "${parsed_port}" =~ ^(54399|55432|54321|54322|59999)$ ]]; then
      has_positive_identity=true
    # Or explicit disposable database name (never default 'postgres')
    elif [ -n "${parsed_db_lower}" ] && [ "${parsed_db_lower}" != "postgres" ] && [[ "${parsed_db_lower}" =~ (disposable|eval|temp|test|staging) ]]; then
      has_positive_identity=true
    fi
  fi

  if [ "${has_positive_identity}" = "false" ]; then
    echo "[SECURITY REJECTION] Target lacks positive disposable identity on effective port/dbname: $(mask_target_identity "${target_val}")" >&2
    echo "[SECURITY REJECTION] Expected disposable port (54399/55432) or explicit disposable database/container name." >&2
    exit 42
  fi
}

assert_disposable_target() {
  assert_disposable_db_target "$@"
}

assert_disposable_http_target() {
  local http_url="${1:-}"

  if [ -z "${http_url}" ]; then
    echo "[SECURITY REJECTION] No HTTP/HTTPS endpoint target configured. Explicit disposable endpoint required." >&2
    exit 42
  fi

  local lower_url
  lower_url="$(echo "${http_url}" | tr '[:upper:]' '[:lower:]')"

  if ! [[ "${lower_url}" =~ ^https?:// ]]; then
    echo "[SECURITY REJECTION] Malformed HTTP target: ${http_url}. Expected http:// or https:// URL." >&2
    exit 42
  fi

  if [[ "${lower_url}" =~ :54332(/|$|\?) ]] || [[ "${lower_url}" =~ :54331(/|$|\?) ]]; then
    echo "[SECURITY REJECTION] HTTP endpoint targets protected baseline port (54331/54332)." >&2
    exit 42
  fi
}

verify_disposable_correspondence() {
  local db_target="${1:-}"
  local http_url="${2:-}"
  local service_role_key="${3:-}"

  assert_disposable_db_target "${db_target}"
  assert_disposable_http_target "${http_url}"

  if [ -z "${service_role_key}" ]; then
    echo "[SECURITY REJECTION] Service-role key required to verify positive correspondence with HTTP target." >&2
    exit 42
  fi

  echo "  [Correspondence Check] Executing concurrency-safe least-privilege verification (SQL -> HTTP)..."
  setup_guarded_sql_exec "${db_target}"

  local probe_nonce="corr_$(date +%s)_$$_$((RANDOM % 90000 + 10000))"
  local probe_table="_disposable_probe_${probe_nonce}"
  local clean_url="${http_url%/}"

  # Per-check trapped cleanup so concurrent checks never drop each other's probe table
  trap 'exec_guarded_sql_cmd "DROP TABLE IF EXISTS public.${probe_table};" 2>/dev/null || true' RETURN EXIT

  # Step 1: Write nonce into per-check table with RLS enabled and SELECT granted ONLY to service_role
  exec_guarded_sql_cmd "
    SET statement_timeout = '5000ms';
    CREATE TABLE public.${probe_table} (
      probe_id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.${probe_table} ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.${probe_table} FROM PUBLIC;
    DO \$\$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.${probe_table} FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.${probe_table} FROM authenticated;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT SELECT ON TABLE public.${probe_table} TO service_role;
        EXECUTE 'CREATE POLICY service_role_probe_select ON public.${probe_table} FOR SELECT TO service_role USING (true)';
      END IF;
    END \$\$;
    INSERT INTO public.${probe_table} (probe_id) VALUES ('${probe_nonce}');
  "

  # Step 2: Read nonce back via HTTP REST endpoint using service_role key with bounded 5s timeout
  local http_resp
  http_resp="$(curl -s -f --max-time 5 -H "apikey: ${service_role_key}" -H "Authorization: Bearer ${service_role_key}" "${clean_url}/rest/v1/${probe_table}?probe_id=eq.${probe_nonce}" 2>/dev/null || echo "FAILED")"

  # Step 3: Cleanup per-check probe table via SQL
  exec_guarded_sql_cmd "DROP TABLE IF EXISTS public.${probe_table};" 2>/dev/null || true
  trap - RETURN EXIT

  # Step 4: Verify positive correspondence match
  if ! echo "${http_resp}" | grep -q "${probe_nonce}"; then
    echo "[SECURITY REJECTION] Positive correspondence check FAILED! SQL and HTTP do NOT reach the same disposable database instance." >&2
    echo "  Probe nonce '${probe_nonce}' written via SQL was not retrievable via ${clean_url}/rest/v1 within 5s" >&2
    echo "  Response received: ${http_resp}" >&2
    exit 43
  fi

  echo "  -> [PASS] Verified positive correspondence: SQL and HTTP reach the identical disposable database."
}

# Guarded Execution: Subprocess execution with 5s connect timeout
setup_guarded_sql_exec() {
  local target="$1"
  assert_disposable_target "${target}"

  local lower
  lower="$(echo "${target}" | tr '[:upper:]' '[:lower:]')"

  if [[ "${lower}" =~ ^[a-z0-9\+]+:// ]] || [[ "${target}" =~ [a-zA-Z_]+[[:space:]]*= ]]; then
    export GUARDED_EXEC_MODE="psql"
    export GUARDED_DB_TARGET="${target}"
  else
    export GUARDED_EXEC_MODE="docker"
    export GUARDED_DB_TARGET="${target}"
  fi
}

exec_guarded_sql_cmd() {
  local query="$1"
  if [ "${GUARDED_EXEC_MODE}" = "psql" ]; then
    PGCONNECT_TIMEOUT=5 psql "${GUARDED_DB_TARGET}" -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  elif [ "${GUARDED_EXEC_MODE}" = "docker" ]; then
    docker exec -i "${GUARDED_DB_TARGET}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -A -c "${query}"
  else
    echo "[Error] SQL execution attempted before setup_guarded_sql_exec was called." >&2
    exit 1
  fi
}

exec_guarded_sql_file() {
  local file_path="$1"
  if [ "${GUARDED_EXEC_MODE}" = "psql" ]; then
    PGCONNECT_TIMEOUT=5 psql "${GUARDED_DB_TARGET}" -v ON_ERROR_STOP=1 -f "${file_path}"
  elif [ "${GUARDED_EXEC_MODE}" = "docker" ]; then
    docker exec -i "${GUARDED_DB_TARGET}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${file_path}"
  else
    echo "[Error] SQL execution attempted before setup_guarded_sql_exec was called." >&2
    exit 1
  fi
}
