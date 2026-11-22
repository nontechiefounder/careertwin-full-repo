-- Standalone repair service schema. Does not modify V2 hiring tables.
BEGIN;

CREATE TABLE wbctx_bindings (
	id VARCHAR NOT NULL, 
	actor VARCHAR NOT NULL, 
	org VARCHAR NOT NULL, 
	run VARCHAR NOT NULL, 
	workspace VARCHAR NOT NULL, 
	role VARCHAR NOT NULL, 
	active BOOLEAN NOT NULL, 
	can_write BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (actor, org, run, workspace, role)
)

;
ALTER TABLE wbctx_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_bindings FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_bindings FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_bindings FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_nonces (
	jti VARCHAR NOT NULL, 
	expires FLOAT NOT NULL, 
	PRIMARY KEY (jti)
)

;
ALTER TABLE wbctx_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_nonces FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_nonces FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_nonces FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_sources (
	id VARCHAR NOT NULL, 
	org VARCHAR NOT NULL, 
	workspace VARCHAR NOT NULL, 
	role VARCHAR NOT NULL, 
	run VARCHAR NOT NULL, 
	source_key VARCHAR NOT NULL, 
	deleted BOOLEAN NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (org, workspace, role, run, source_key)
)

;
ALTER TABLE wbctx_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_sources FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_sources FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_sources FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_versions (
	id VARCHAR NOT NULL, 
	source VARCHAR NOT NULL, 
	number INTEGER NOT NULL, 
	sha256 VARCHAR NOT NULL, 
	bytes INTEGER NOT NULL, 
	filename VARCHAR NOT NULL, 
	path VARCHAR NOT NULL, 
	observed_at FLOAT NOT NULL, 
	state VARCHAR NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (source, number), 
	FOREIGN KEY(source) REFERENCES wbctx_sources (id)
)

;
ALTER TABLE wbctx_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_versions FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_versions FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_versions FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_artifacts (
	version VARCHAR NOT NULL, 
	spec VARCHAR NOT NULL, 
	parser VARCHAR NOT NULL, 
	text TEXT NOT NULL, 
	sha256 VARCHAR NOT NULL, 
	exceptions TEXT NOT NULL, 
	pages_total INTEGER, 
	pages_with_text INTEGER, 
	PRIMARY KEY (version), 
	FOREIGN KEY(version) REFERENCES wbctx_versions (id)
)

;
ALTER TABLE wbctx_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_artifacts FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_artifacts FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_artifacts FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_jobs (
	id VARCHAR NOT NULL, 
	version VARCHAR NOT NULL, 
	state VARCHAR NOT NULL, 
	attempts INTEGER NOT NULL, 
	lease_until FLOAT NOT NULL, 
	fence VARCHAR, 
	error VARCHAR, 
	PRIMARY KEY (id), 
	UNIQUE (version), 
	FOREIGN KEY(version) REFERENCES wbctx_versions (id)
)

;
ALTER TABLE wbctx_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_jobs FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_jobs FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_jobs FROM authenticated; END IF;
 END $$;

CREATE TABLE wbctx_spans (
	id VARCHAR NOT NULL, 
	version VARCHAR NOT NULL, 
	start INTEGER NOT NULL, 
	"end" INTEGER NOT NULL, 
	page INTEGER, 
	text TEXT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(version) REFERENCES wbctx_versions (id)
)

;
ALTER TABLE wbctx_spans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_spans FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_spans FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_spans FROM authenticated; END IF;
 END $$;
COMMIT;