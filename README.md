# CryptoPrice — Real-time Crypto Streaming Platform

Hệ thống streaming giá crypto real-time từ Binance, xử lý bằng Apache Flink + Spark, lưu trữ trên MinIO/Iceberg, query bằng Trino, orchestrate bằng Dagster.

---

## Kiến trúc tổng thể

```
  Binance WebSocket
        │
        ▼
  ┌─────────────┐
  │  Producer   │  (Python)  ─────────────────────────────────────────────┐
  │ (Binance WS)│                                                          │
  └─────────────┘                                                          │
        │ crypto_ticker / crypto_trades                                    │
        ▼                                                                  │
  ┌─────────────┐                                                          │
  │    Kafka    │  (KRaft, 3.9)                                            │
  │  broker+ctrl│                                                          │
  └──────┬──────┘                                                          │
         │                                                                 │
    ┌────┴─────────────────────────┐                                       │
    │                             │                                        │
    ▼                             ▼                                        │
┌────────────┐            ┌──────────────┐                                 │
│   Flink    │            │    Spark     │                                 │
│ 1.18.1     │            │   3.4.1      │                                 │
│ JobManager │            │ Master+Worker│                                 │
│ TaskManager│            └──────┬───────┘                                │
└─────┬──────┘                   │                                        │
      │                          │ append to Iceberg                      │
      │                          ▼                                        │
      │                  ┌──────────────┐                                 │
      │                  │   MinIO      │  ◄── Object Storage (S3-compat) │
      │                  │  + Iceberg   │                                 │
      │                  │  (JDBC→PG)   │                                 │
      │                  └──────┬───────┘                                 │
      │                         │                                         │
      │             ┌───────────┘                                         │
      │             ▼                                                      │
      │        ┌─────────┐                                                │
      │        │  Trino  │  442  (query Iceberg)                          │
      │        └─────────┘                                                │
      │                                                                   │
      ├──► KeyDB  (latest ticker cache → FastAPI)                         │
      └──► InfluxDB 2.7  (time-series metrics → dashboard)               │
                                                                          │
  ┌─────────────────────────────────────────────────────────┐            │
  │  Dagster  (orchestration)                               │            │
  │  - daily kline ingest (02:00 AM)                        │            │
  │  - weekly Iceberg maintenance (Sun 03:00 AM)            │            │
  └─────────────────────────────────────────────────────────┘            │
                                                                          │
  ┌──────────────────────────────────────────────────────────────────────┘
  │  PostgreSQL 16  (Iceberg JDBC catalog + Dagster metadata)
  └──────────────────────────────────────────────────────────
```

---

## Stack & Phiên bản

| Thành phần | Image / Version | Vai trò |
|---|---|---|
| **Kafka** | `bitnami/kafka:3.9` (KRaft) | Message broker |
| **Flink** | `flink:1.18.1-java11` (custom) | Stream processing |
| **Spark** | `bitnami/spark:3.4.1` | Batch / micro-batch to Iceberg |
| **MinIO** | `minio/minio:latest` | Object storage (S3-compatible) |
| **Iceberg** | runtime `1.5.0` | Table format trên MinIO |
| **InfluxDB** | `influxdb:2.7` | Time-series DB cho metrics |
| **KeyDB** | `eqalpha/keydb:latest` | In-memory cache (Redis-compat) |
| **PostgreSQL** | `postgres:16-alpine` | Iceberg JDBC catalog + Dagster storage |
| **Trino** | `trinodb/trino:442` | Ad-hoc SQL query engine |
| **Dagster** | `1.9.*` (custom) | Workflow orchestration |
| **Producer** | Python 3.11 (custom) | Binance WS → Kafka |

---

## Cấu trúc thư mục

```
cryptoprice/
├── docker-compose.yml                   # Full stack, 13 services
├── .env                                 # Secrets (KHÔNG commit git)
├── spark-defaults.conf                  # Spark config (mounted vào spark-master)
├── README.md
│
├── producer_binance.py                  # Binance WebSocket → Kafka producer
├── ingest_flink_crypto.py               # Flink job: Kafka → KeyDB + InfluxDB
├── ingest_crypto.py                     # Spark job: Kafka → Iceberg (streaming)
├── ingest_historical_iceberg.py         # Spark job: Binance REST → Iceberg (batch)
├── iceberg_maintenance.py               # Spark job: compact / expire snapshots
│
├── orchestration/
│   ├── assets.py                        # Dagster assets (Spark job wrappers)
│   └── workspace.yaml                   # Dagster workspace config
│
└── docker/
    ├── flink/
    │   ├── Dockerfile                   # PyFlink 1.18.1 + Kafka connector JAR
    │   └── flink-conf.yaml              # Flink cluster config (bind 0.0.0.0)
    │
    ├── trino/
    │   └── etc/                         # Mount vào /etc/trino trong container
    │       ├── config.properties        # coordinator, port, memory
    │       ├── jvm.config               # -Xmx2G, G1GC
    │       ├── node.properties          # node.id, data-dir
    │       ├── log.properties           # log level
    │       └── catalog/
    │           └── iceberg.properties   # connector → JDBC/PG + MinIO
    │
    ├── dagster/
    │   ├── Dockerfile                   # Python 3.11 + Spark 3.4.1 + Dagster 1.9
    │   └── dagster.yaml                 # Storage: postgres, scheduler, launcher
    │
    ├── producer/
    │   └── Dockerfile                   # Python 3.11 + kafka-python
    │
    └── postgres/
        └── init.sql                     # Khởi tạo 2 databases + Iceberg schema
```

### PostgreSQL phục vụ 2 hệ thống

PostgreSQL trong stack này **không phải chỉ lưu một thứ** — `init.sql` khởi tạo đủ cho cả hai:

```
postgres (port 5432)
├── DB: iceberg_catalog       ← Iceberg JDBC catalog (Spark + Trino)
│   ├── table: iceberg_tables               (metadata location của mỗi table)
│   └── table: iceberg_namespace_properties (properties của database/namespace)
│
└── DB: dagster               ← Dagster metadata (runs, events, schedules, sensors)
    └── (auto-created bởi dagster-webserver khi start lần đầu)
```

> Iceberg **không lưu data vào PostgreSQL** — PostgreSQL chỉ lưu *con trỏ metadata* (path tới file `.avro` trên MinIO). Data thực tế (Parquet files) nằm trên MinIO tại `s3://cryptoprice/iceberg/`.

---

## Yêu cầu

- **Docker Desktop** ≥ 4.x (WSL2 backend trên Windows)
- **RAM tối thiểu**: 16 GB (khuyến nghị 20 GB+)
- **Disk**: 20 GB free
- **CPU**: 6 cores+

---

## Cài đặt & Khởi chạy

### 1. Clone và chuẩn bị

```bash
git clone <repo>
cd cryptoprice
```

### 2. Kiểm tra file `.env`

```env
INFLUX_TOKEN=rOR4d3WHhRWiXF4MSvjM0Kg3...   # token InfluxDB
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
POSTGRES_USER=iceberg
POSTGRES_PASSWORD=iceberg123
POSTGRES_DB=iceberg_catalog
```

> **Quan trọng**: Thêm `.env` vào `.gitignore` để không lộ token.

### 3. Build và start

```bash
# Lần đầu (build image)
docker compose up -d --build

# Từ lần sau
docker compose up -d
```

### 4. Kiểm tra health

```bash
docker compose ps
# Tất cả services phải ở trạng thái "healthy" hoặc "running"
```

### 5. Submit Flink job

Sau khi Flink cluster healthy:

```bash
docker exec flink-jobmanager \
  flink run -py /app/ingest_flink_crypto.py \
  -d \
  --jobmanager flink-jobmanager:8081
```

### 6. Start Spark Streaming (ingest_crypto)

```bash
docker exec spark-master \
  spark-submit \
  --master spark://spark-master:7077 \
  --packages org.apache.iceberg:iceberg-spark-runtime-3.4_2.12:1.5.0,org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262 \
  /app/ingest_crypto.py
```

---

## Thứ tự khởi động (dependency chain)

```
postgres ──────────────────────────────────────────────┐
minio ─────────────────────────────────────────────────┤
  └── minio-init (one-shot)                            │
kafka ────────────────────────────────┐                │
influxdb ──────────────────────────── │ ──────┐        │
keydb ─────────────────────────────── │ ──────┤        │
                                      │       │        │
                            flink-jobmanager  │        │
                              └── flink-taskmanager    │
                                               │       │
                                         spark-master ─┘
                                           └── spark-worker
                                                     │
                                               trino ─┘
                                         dagster-webserver
                                           └── dagster-daemon
producer (chờ kafka healthy)
```

---

## Port Map

| Service | Port host | URL |
|---|---|---|
| Kafka | `9092` | `kafka:9092` (internal) |
| MinIO API | `9000` | http://localhost:9000 |
| MinIO Console | `9001` | http://localhost:9001 |
| InfluxDB | `8086` | http://localhost:8086 |
| PostgreSQL | `5432` | `localhost:5432` |
| KeyDB | `6379` | `localhost:6379` |
| Flink Web UI | `8081` | http://localhost:8081 |
| Spark Master UI | `8082` | http://localhost:8082 |
| Spark History | `18080` | http://localhost:18080 |
| Trino UI | `8083` | http://localhost:8083 |
| Dagster UI | `3000` | http://localhost:3000 |

---

## Data Flow

### Real-time path (độ trễ < 1s)
```
Binance WS ──► Kafka (crypto_ticker) ──► Flink ──► KeyDB     (latest price cache)
                                                └──► InfluxDB  (time-series metrics)
```

### Batch / Micro-batch path (mỗi 1 phút)
```
Kafka (crypto_ticker + crypto_trades) ──► Spark ──► Iceberg on MinIO
```

### Historical ingest (Dagster, 02:00 AM hàng ngày)
```
Binance REST API ──► Spark ──► Iceberg (historical_hourly)
```

### Query path
```
Client ──► Trino ──► Iceberg catalog (PostgreSQL) ──► data files (MinIO)
Client ──► FastAPI ──► KeyDB   (real-time price)
Client ──► FastAPI ──► InfluxDB (OHLCV charts)
```

---

## Lệnh hữu ích

```bash
# Xem log một service
docker compose logs -f kafka
docker compose logs -f flink-jobmanager

# Restart một service
docker compose restart flink-taskmanager

# Dừng toàn bộ (giữ data)
docker compose stop

# Dừng và xóa hoàn toàn (kể cả volumes)
docker compose down -v

# Scale thêm Spark worker
docker compose up -d --scale spark-worker=3

# Vào shell container
docker exec -it kafka bash
docker exec -it flink-jobmanager bash
docker exec -it trino trino
```

---

## Phân bổ tài nguyên

> Dựa trên máy khuyến nghị: **20 GB RAM**, **8 CPU cores**, **SSD**.
> Tổng cam kết: ~**16.5 GB RAM**, **8 cores**. Để lại ~3.5 GB cho OS + buffer.

### Bảng phân bổ chi tiết

| Service | RAM (limit) | RAM (thường dùng) | CPU cores | Ghi chú |
|---|---|---|---|---|
| **kafka** | 1.5 GB | ~600 MB | 1.0 | JVM heap 1 GB, KRaft overhead |
| **minio** | 1 GB | ~300 MB | 0.5 | Tăng nếu có nhiều concurrent write |
| **minio-init** | 64 MB | ~30 MB | 0.1 | One-shot, thoát sau khi init |
| **influxdb** | 1.5 GB | ~500 MB | 0.5 | TSI index + write buffer |
| **postgres** | 512 MB | ~200 MB | 0.5 | Chủ yếu lưu Iceberg metadata + Dagster |
| **keydb** | 512 MB | ~150 MB | 0.5 | In-memory, ~100k keys latest ticker |
| **flink-jobmanager** | 1.8 GB | ~1.6 GB | 1.0 | `jobmanager.memory.process.size: 1600m` |
| **flink-taskmanager** | 2 GB | ~1.7 GB | 1.0 | `taskmanager.memory.process.size: 1728m` |
| **spark-master** | 1 GB | ~400 MB | 0.5 | Master chỉ schedule, không chạy task |
| **spark-worker** | 5 GB | ~4.5 GB | 2.0 | `SPARK_WORKER_MEMORY=4G`, driver ~512 MB overhead |
| **trino** | 2.5 GB | ~1.5 GB | 1.0 | JVM `-Xmx2G`, heap 2 GB |
| **dagster-webserver** | 1 GB | ~500 MB | 0.5 | UI + metadata queries |
| **dagster-daemon** | 512 MB | ~300 MB | 0.5 | Scheduler + sensor loops |
| **producer** | 256 MB | ~100 MB | 0.2 | Python WS client, I/O-bound |
| **Tổng** | **~19.2 GB** | **~12.4 GB** | **~9.8 cores** | |

---

### Thêm resource limits vào compose (production)

Nếu muốn giới hạn cứng, thêm `deploy.resources` vào mỗi service. Ví dụ:

```yaml
services:
  spark-worker:
    deploy:
      resources:
        limits:
          memory: 5g
          cpus: "2.0"
        reservations:
          memory: 4g
          cpus: "1.5"

  flink-taskmanager:
    deploy:
      resources:
        limits:
          memory: 2g
          cpus: "1.0"

  trino:
    deploy:
      resources:
        limits:
          memory: 2500m
          cpus: "1.0"
```

> **Lưu ý**: `deploy.resources` chỉ có hiệu lực khi chạy với Docker Swarm (`docker stack deploy`) hoặc bật tính năng resource limits trong Docker Desktop settings.
> Với `docker compose up` thông thường, dùng `mem_limit` + `cpus` trực tiếp ở cấp service.

---

### Gợi ý nếu máy chỉ có 16 GB RAM

Tắt bớt các service không cần thiết lúc dev:

```bash
# Tắt Trino nếu không query batch
docker compose stop trino

# Giảm Spark worker memory xuống 2G
# Sửa trong docker-compose.yml:
# SPARK_WORKER_MEMORY: 2G

# Tắt Spark History Server (port 18080) nếu không debug
# Xóa dòng SPARK_HISTORY_OPTS trong spark-master
```

Tổng RAM tiêu thụ khi tắt Trino + Spark History: giảm khoảng **~2.5 GB**, còn ~**10 GB** thực tế.
