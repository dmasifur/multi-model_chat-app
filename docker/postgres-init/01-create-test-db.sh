#!/bin/sh
# Runs once, on first container init (docker-entrypoint-initdb.d), against a
# fresh volume only - never on an existing one. Creates a second database so
# the test suite (.env.test) never shares data with local dev (.env): both
# point at the same Postgres instance/port, but a different database name.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
  CREATE DATABASE chatapp_test OWNER $POSTGRES_USER;
SQL
