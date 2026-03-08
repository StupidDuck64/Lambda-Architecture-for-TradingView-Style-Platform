#!/bin/bash
set -e

# â”€â”€ Substitute env-var placeholders in Trino catalog properties â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
CATALOG="/etc/trino/catalog/iceberg.properties"
if [ -f "$CATALOG" ]; then
  sed -i \
    -e "s|__POSTGRES_USER__|${POSTGRES_USER:?POSTGRES_USER is required}|g" \
    -e "s|__POSTGRES_PASSWORD__|${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}|g" \
    -e "s|__MINIO_ROOT_USER__|${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}|g" \
    -e "s|__MINIO_ROOT_PASSWORD__|${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}|g" \
    "$CATALOG"
fi

exec /usr/lib/trino/bin/run-trino "$@"
