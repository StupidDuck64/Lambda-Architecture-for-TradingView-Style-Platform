# CryptoPrice — Real-time Crypto Streaming Platform

> **GitHub**: https://github.com/StupidDuck64/TradingView-Style-Crypto-Platform

Hệ thống streaming giá crypto real-time từ Binance, xử lý bằng Apache Flink + Spark, lưu trữ trên MinIO/Iceberg, query bằng Trino, orchestrate bằng Dagster. Thiết kế mô phỏng kiến trúc data platform kiểu TradingView trên nền lakehouse hiện đại.

---

## Kiến trúc tổng thể

![alt text](image.png)

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

## Hướng dẫn chạy

### Yêu cầu

- **Docker Desktop** >= 4.x (WSL2 backend trên Windows)
- **RAM tối thiểu**: 16 GB (khuyến nghị 20 GB+)
- **Disk**: 20 GB free
- **CPU**: 6 cores+

### 1. Clone repo

```bash
git clone https://github.com/StupidDuck64/TradingView-Style-Crypto-Platform.git
cd TradingView-Style-Crypto-Platform
```

### 2. Kiểm tra file `.env`

```env
INFLUX_TOKEN=rOR4d3WHhRWiXF4MSvjM0Kg3yiB_omldxVarArm4R2hMIfu6e5JFx9E2ktgk_Qomj4giZLKbjC-stDelB9FvZw==
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
POSTGRES_USER=iceberg
POSTGRES_PASSWORD=iceberg123
POSTGRES_DB=iceberg_catalog
```

> **Quan trọng**: File `.env` đã có trong repo nhưng **không được commit lại sau khi thay token thật**. Thêm `.env` vào `.gitignore` nếu dùng token production.

### 3. Build và start toàn bộ stack

```bash
# Lần đầu — build image custom (Flink, Dagster, Producer)
docker compose up -d --build

# Từ lần sau
docker compose up -d
```

### 4. Kiểm tra health

```bash
docker compose ps
# Tất cả services phải ở trạng thái "healthy" hoặc "running"
```

### 5. Submit Flink job (real-time ingest)

Flink là **long-running streaming job** — không qua Dagster, phải submit thủ công sau khi `flink-jobmanager` báo healthy:

```bash
docker exec flink-jobmanager \
  flink run -py /app/src/ingest_flink_crypto.py \
  -d \
  --jobmanager flink-jobmanager:8081
```

Kiểm tra job đang chạy tại http://localhost:8081.

### 6. Start Spark Streaming (batch to Iceberg)

Tương tự, `ingest_crypto.py` là **long-running streaming job** — submit thủ công:

```bash
docker exec spark-master \
  spark-submit \
  --master spark://spark-master:7077 \
  --packages org.apache.iceberg:iceberg-spark-runtime-3.4_2.12:1.5.2,org.apache.iceberg:iceberg-aws-bundle:1.5.2,org.apache.hadoop:hadoop-aws:3.3.4,org.postgresql:postgresql:42.7.2,org.apache.spark:spark-sql-kafka-0-10_2.12:3.4.1 \
  /app/src/ingest_crypto.py
```

### Dagster quản lý cái gì?

Dagster chỉ orchestrate **batch jobs có schedule** — không quản lý các streaming job (vì streaming job chạy liên tục, không có start/end rõ ràng):

| Job | Chạy bằng gì | Cách start |
|---|---|---|
| `producer_binance.py` | Docker container (producer) | Tự động khi `docker compose up` |
| `ingest_flink_crypto.py` | Flink cluster | Submit thủ công (bước 5) |
| `ingest_crypto.py` | Spark cluster | Submit thủ công (bước 6) |
| `ingest_historical_iceberg.py` | **Dagster** (02:00 AM) | Tự động theo schedule, hoặc manual trigger trên Dagster UI |
| `iceberg_maintenance.py` | **Dagster** (CN 03:00 AM) | Tự động theo schedule, hoặc manual trigger trên Dagster UI |

Vào http://localhost:3000 để xem status, trigger thủ công, hoặc bật/tắt schedule.

### Thứ tự khởi động container (docker compose up -d)

Đây là thứ tự Docker đảm bảo infrastructure sẵn sàng — tất cả chạy bằng 1 lệnh, không cần bật từng cái:

```
postgres ──────────────────────────────────────────────┐
minio ─────────────────────────────────────────────────┤
  └── minio-init (one-shot: tao bucket cryptoprice,    │
                  flink-checkpoints)                   │
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

### Port Map

| Service | Port (host) | URL |
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

### Lệnh hữu ích

```bash
# Xem log một service
docker compose logs -f kafka
docker compose logs -f flink-jobmanager

# Restart một service
docker compose restart flink-taskmanager

# Dừng toàn bộ (giữ data volumes)
docker compose stop

# Dừng và xoá hoàn toàn (kể cả volumes — mất data)
docker compose down -v

# Scale thêm Spark worker
docker compose up -d --scale spark-worker=3

# Vào shell container
docker exec -it kafka bash
docker exec -it flink-jobmanager bash
docker exec -it trino trino
```

---

## Quá trình thu thập và xử lý dữ liệu

### 1. Thu thập — `producer_binance.py`

```
Binance WebSocket API
  wss://stream.binance.com/stream?streams=btcusdt@ticker/ethusdt@ticker/...
        │
        ▼
  producer_binance.py
  (KafkaProducer, kafka-python)
        │
        ├── topic: crypto_ticker   ← JSON ticker: symbol, price, volume, timestamp
        └── topic: crypto_trades   ← JSON trade: symbol, price, qty, side, tradeId
```

Producer duy trì một WebSocket connection liên tục với Binance. Mỗi sự kiện ticker/trade được serialize thành JSON và publish vào Kafka với `key = symbol` (ví dụ `BTCUSDT`).

---

### 2. Xử lý real-time — `ingest_flink_crypto.py`

```
Kafka topic: crypto_ticker
        │
        ▼
  Flink Source (FlinkKafkaConsumer / Kafka SQL Table)
        │
        ├─── flatMap: KeyDBWriter
        │         └──► KeyDB  SET "ticker:BTCUSDT" → JSON latest price
        │              Key TTL: không set → giữ mãi, overwrite liên tục
        │
        └─── flatMap: InfluxDBWriter
                  └──► InfluxDB bucket: crypto
                       measurement: market_ticks
                       tags: symbol
                       fields: price (float), volume (float), quote_volume (float)
                       timestamp: event time từ Binance
```

**Checkpointing**: Flink ghi checkpoint vào `s3://flink-checkpoints/` (MinIO) mỗi 60s. Nếu job crash, recovery tự động từ checkpoint gần nhất — không mất data.

**NoopSink**: Terminal sink trong Flink job graph được gắn vào `NoopSink` (không in ra stdout) thay vì `.print()` để tránh I/O overhead.

---

### 3. Xử lý batch / micro-batch — `ingest_crypto.py`

```
Kafka topics: crypto_ticker + crypto_trades
        │
        ▼
  Spark Structured Streaming
  (readStream từ Kafka, trigger mỗi 1 phút)
        │
        ├── parse JSON → DataFrame
        ├── cast types, add partition cols (date, hour)
        │
        ├──► Iceberg table: cryptoprice.market_data.ticker_stream
        │         storage: s3://cryptoprice/iceberg/ticker_stream/
        │         format: Parquet, partitioned by (date, hour)
        │
        └──► Iceberg table: cryptoprice.market_data.trade_stream
                  storage: s3://cryptoprice/iceberg/trade_stream/
                  format: Parquet, partitioned by (date, symbol)
```

Mỗi micro-batch append Parquet files mới vào MinIO và cập nhật Iceberg metadata (snapshot mới) trong PostgreSQL.

---

### 4. Ingest lịch sử — `ingest_historical_iceberg.py`

```
Binance REST API
  GET /api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000
        │
        ▼
    Spark batch job (trigger thủ công hoặc Dagster 02:00 AM)
        │
      ├── fetch tất cả symbol theo danh sách config
      ├── convert sang DataFrame (open, high, low, close, volume, ...)
        │
        └──► Iceberg table: cryptoprice.market_data.historical_hourly
                  storage: s3://cryptoprice/iceberg/historical_hourly/
                  format: Parquet, partitioned by (symbol, year, month)
                  mode: MERGE INTO (upsert theo symbol + open_time)
```

---

### 5. Bảo trì Iceberg — `iceberg_maintenance.py`

```
Spark batch job (Dagster, Chủ nhật 03:00 AM)
        │
  ├── expire_snapshots()    → xoá snapshot cũ hơn 7 ngày
  │       └──► cập nhật iceberg_tables trong PostgreSQL
        │
  ├── remove_orphan_files() → quét MinIO, xoá Parquet không có snapshot tham chiếu
  │       └──► gọi S3 API trực tiếp trên MinIO
        │
  └── rewrite_data_files()  → compact small files thành file lớn hơn
    └──► ghi file Parquet mới vào MinIO, cập nhật metadata pointer trong PostgreSQL
```

---

### 6. Query — Trino

```
Client SQL
        │
        ▼
  Trino coordinator (port 8083)
        │
        ├── đọc Iceberg catalog từ PostgreSQL:
        │       DB iceberg_catalog → bảng iceberg_tables
        │       → lấy metadata_location (path tới file .avro trên MinIO)
        │
        ├── đọc metadata files (.avro, .json) từ MinIO
        │
        └── đọc data files (Parquet) từ MinIO, trả kết quả về client
```

Trino **chỉ đọc**, không ghi vào InfluxDB hay KeyDB.

---

### 7. Orchestration — Dagster

```
Dagster daemon (scheduler loop mỗi 30s)
        │
  ├── Schedule: daily_kline_ingest (02:00 AM hằng ngày)
        │       └── spark-submit ingest_historical_iceberg.py
  │               → ghi vào MinIO + PostgreSQL (Iceberg)
        │
  ├── Schedule: weekly_iceberg_maintenance (Chủ nhật 03:00 AM)
        │       └── spark-submit iceberg_maintenance.py
  │               → compact + expire trên MinIO + PostgreSQL
        │
        └── Dagster metadata → DB dagster (PostgreSQL)
                    tables: runs, event_logs, schedules, sensors, partitions, ...
```

---

### So do luong ghi theo tung storage

```
┌─────────────────┬──────────────────────────────────────────────────────┐
│ Storage         │ Ai ghi vao?                  Noi dung                 │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Kafka           │ producer_binance.py           raw ticker/trade JSON   │
│  crypto_ticker  │                                                        │
│  crypto_trades  │                                                        │
├─────────────────┼──────────────────────────────────────────────────────┤
│ KeyDB           │ ingest_flink_crypto.py        latest ticker per symbol│
│  key: ticker:XX │ (KeyDBWriter flatMap)         JSON, overwrite moi tick│
├─────────────────┼──────────────────────────────────────────────────────┤
│ InfluxDB        │ ingest_flink_crypto.py        OHLCV time-series       │
│  meas: market_  │ (InfluxDBWriter flatMap)      tag: symbol             │
│  ticks          │                               field: price, vol, ...  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ MinIO           │ ingest_crypto.py (Spark)      Parquet data files      │
│  s3://cryptopri │ ingest_historical_iceberg.py  theo partition          │
│  ce/iceberg/    │ iceberg_maintenance.py        compact + orphan delete │
│                 │ Flink checkpoint              s3://flink-checkpoints/ │
├─────────────────┼──────────────────────────────────────────────────────┤
│ PostgreSQL      │ Spark (qua Iceberg JDBC)      iceberg_tables,         │
│  iceberg_catalog│ iceberg_maintenance.py        iceberg_namespace_props │
│                 │ Trino (read-only)             snapshot pointers       │
├─────────────────┼──────────────────────────────────────────────────────┤
│ PostgreSQL      │ dagster-webserver (auto)      runs, events, schedules │
│  dagster        │ dagster-daemon                sensors, partitions     │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## Tech Stack, Phien ban & Config

### Stack

| Thanh phan | Image / Version | Vai tro |
|---|---|---|
| **Kafka** | `bitnami/kafka:3.9` (KRaft) | Message broker, 2 topics |
| **Flink** | `flink:1.18.1-java11` (custom) | Stream processing real-time |
| **Spark** | `bitnami/spark:3.4.1` | Batch / micro-batch to Iceberg |
| **MinIO** | `minio/minio:latest` | Object storage (S3-compatible) |
| **Iceberg** | runtime `1.5.0` (Scala 2.12) | Table format tren MinIO |
| **InfluxDB** | `influxdb:2.7` | Time-series DB — measurement `market_ticks` |
| **KeyDB** | `eqalpha/keydb:latest` | In-memory cache (Redis-compat) |
| **PostgreSQL** | `postgres:16-alpine` | Iceberg JDBC catalog + Dagster storage |
| **Trino** | `trinodb/trino:442` | Ad-hoc SQL query engine |
| **Dagster** | `1.9.*` (custom) | Workflow orchestration |
| **Producer** | Python 3.11 (custom) | Binance WS → Kafka |

### Key dependencies

| Package | Version | Dung trong |
|---|---|---|
| `apache-flink` | 1.18.1 | ingest_flink_crypto.py |
| `flink-sql-connector-kafka` | 3.1.0-1.18 (JAR) | Flink Kafka source |
| `influxdb-client` | 1.44.0 | ingest_flink_crypto.py |
| `redis` | 5.0.3 | ingest_flink_crypto.py (KeyDB) |
| `iceberg-spark-runtime-3.4_2.12` | 1.5.0 | Spark Iceberg jobs |
| `hadoop-aws` | 3.3.4 | Spark <-> MinIO (S3A) |
| `aws-java-sdk-bundle` | 1.12.262 | Spark <-> MinIO credential |
| `kafka-python` | 2.0.2 | producer_binance.py |
| `dagster` | 1.9.* | orchestration/assets.py |

### Cau truc thu muc

```
cryptoprice/
├── docker-compose.yml                   # Full stack, 13 services
├── .env                                 # Secrets (DO NOT commit to git)
├── spark-defaults.conf                  # Spark config (mounted into spark-master)
├── README.md
│
├── src/
│   ├── producer_binance.py              # Binance WebSocket → Kafka producer
│   ├── ingest_flink_crypto.py           # Flink job: Kafka → KeyDB + InfluxDB
│   ├── ingest_crypto.py                 # Spark Structured Streaming → Iceberg
│   ├── ingest_historical_iceberg.py     # Spark batch: Binance REST → Iceberg
│   └── iceberg_maintenance.py           # Spark: compact / expire Iceberg snapshots
│
├── orchestration/
│   ├── assets.py                        # Dagster assets wrapping Spark batch jobs
│   └── workspace.yaml                   # Dagster workspace config
│
└── docker/
    ├── flink/
    │   ├── Dockerfile                   # PyFlink 1.18.1 + Kafka connector JAR
    │   └── flink-conf.yaml              # Flink cluster config
    │
    ├── trino/
    │   └── etc/                         # Mounted to /etc/trino inside container
    │       ├── config.properties        # coordinator, port, query memory
    │       ├── jvm.config               # -Xmx2G, G1GC
    │       ├── node.properties          # node.id, data-dir
    │       ├── log.properties           # log level
    │       └── catalog/
    │           └── iceberg.properties   # Iceberg connector: JDBC/PG + MinIO
    │
    ├── dagster/
    │   ├── Dockerfile                   # Python 3.11 + Spark 3.4.1 + Dagster 1.9
    │   └── dagster.yaml                 # Storage backend: postgres
    │
    ├── producer/
    │   └── Dockerfile                   # Python 3.11-slim + kafka-python
    │
    └── postgres/
        └── init.sql                     # Creates iceberg_catalog + dagster DBs with Iceberg schema
```

### PostgreSQL phục vụ 2 hệ thống

```
postgres (port 5432)
├── DB: iceberg_catalog       ← Iceberg JDBC catalog (Spark + Trino)
│   ├── table: iceberg_tables               (metadata location cua moi table)
│   └── table: iceberg_namespace_properties (properties cua database/namespace)
│
└── DB: dagster               ← Dagster metadata (runs, events, schedules, sensors)
  └── (tạo tự động bởi dagster-webserver khi start lần đầu)
```

> Iceberg **không lưu data vào PostgreSQL** — PostgreSQL chỉ lưu *con trỏ metadata* (path tới file `.avro` trên MinIO). Dữ liệu thực tế (Parquet files) nằm trên MinIO tại `s3://cryptoprice/iceberg/`.

### Phân bổ tài nguyên

> Dựa trên máy khuyến nghị: **20 GB RAM**, **8 CPU cores**, **SSD**.

| Service | RAM (limit) | RAM (thường dùng) | CPU cores | Ghi chú |
|---|---|---|---|---|
| **kafka** | 1.5 GB | ~600 MB | 1.0 | JVM heap 1 GB, KRaft overhead |
| **minio** | 1 GB | ~300 MB | 0.5 | Tăng nếu có nhiều concurrent write |
| **minio-init** | 64 MB | ~30 MB | 0.1 | One-shot, thoát sau khi init |
| **influxdb** | 1.5 GB | ~500 MB | 0.5 | TSI index + write buffer |
| **postgres** | 512 MB | ~200 MB | 0.5 | Iceberg metadata + Dagster |
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

#### Gợi ý nếu máy chỉ có 16 GB RAM

```bash
# Tắt Trino nếu không query batch
docker compose stop trino

# Giảm Spark worker memory xuống 2G — sửa trong docker-compose.yml:
# SPARK_WORKER_MEMORY: 2G

# Tắt Spark History Server (port 18080) nếu không debug
# Xoá dòng SPARK_HISTORY_OPTS trong spark-master
```

Tổng RAM tiêu thụ khi tắt Trino + Spark History: giảm ~**2.5 GB**, còn ~**10 GB** thực tế.

#### Resource limits (production)

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

> `deploy.resources` chỉ có hiệu lực với Docker Swarm. Với `docker compose up` thông thường, dùng `mem_limit` + `cpus` trực tiếp ở cấp service.
