#!/usr/bin/env python3
import os
import subprocess
from pathlib import Path

from dagster import (
    AssetExecutionContext,
    Definitions,
    ScheduleDefinition,
    asset,
    get_dagster_logger,
)

PROJECT_DIR = Path(os.environ.get("CRYPTO_PROJECT_DIR", "/app"))

SPARK_HOME = Path(os.environ.get("SPARK_HOME", "/opt/spark"))

SPARK_EVENTS_DIR = Path(os.environ.get("SPARK_EVENTS_DIR", "/opt/spark-events"))

SPARK_MASTER = os.environ.get("SPARK_MASTER", "spark://spark-master:7077")

SPARK_PACKAGES = ",".join([
    "org.apache.iceberg:iceberg-spark-runtime-3.4_2.12:1.5.0",
    "org.apache.hadoop:hadoop-aws:3.3.4",
    "com.amazonaws:aws-java-sdk-bundle:1.12.262",
])

def _run_spark_job(context: AssetExecutionContext, script_name: str, extra_args: list[str] = None) -> None:
    logger = get_dagster_logger()
    script_path = PROJECT_DIR / script_name

    if not script_path.exists():
        raise FileNotFoundError(f"Không tìm thấy script: {script_path}")

    SPARK_EVENTS_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(SPARK_HOME / "bin" / "spark-submit"),
        "--master", SPARK_MASTER,
        "--packages", SPARK_PACKAGES,
        "--conf", "spark.eventLog.enabled=true",
        "--conf", f"spark.eventLog.dir=file://{SPARK_EVENTS_DIR}",
        str(script_path),
    ]

    if extra_args:
        cmd.extend(extra_args)

    logger.info("Chạy lệnh: %s", " ".join(cmd))

    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,    # gộp stderr vào stdout để đọc một luồng
        text=True,
        bufsize=1,                   # line-buffered
        cwd=str(PROJECT_DIR),
    )

    for line in process.stdout:
        line = line.rstrip()
        if line:
            logger.info(line)

    process.wait()

    if process.returncode != 0:
        raise Exception(
            f"Spark job '{script_name}' thất bại với exit code {process.returncode}. "
            f"Xem log ở Dagster UI hoặc Spark History Server (http://localhost:18080)."
        )

    logger.info("Spark job '%s' hoàn thành thành công.", script_name)


@asset(
    description=(
        "Kéo dữ liệu nến 1 giờ (OHLCV) từ Binance API cho tất cả cặp USDT, "
        "chỉ lấy phần mới kể từ lần chạy cuối, rồi ghi vào bảng Iceberg "
        "local.crypto.historical_hourly trên MinIO."
    ),
    group_name="ingestion",
)
def iceberg_historical_klines(context: AssetExecutionContext) -> None:
    _run_spark_job(
        context,
        script_name="ingest_historical_iceberg.py",
        extra_args=["--mode", "incremental"],
    )


@asset(
    description=(
        "Thực hiện 4 tác vụ bảo trì cho các bảng Iceberg: "
        "(1) Compact file nhỏ thành file ~128MB, "
        "(2) Gộp manifest để giảm overhead metadata, "
        "(3) Xoá snapshot cũ hơn 48 giờ, "
        "(4) Dọn file rác không còn được tham chiếu."
    ),
    group_name="maintenance",
)
def iceberg_table_maintenance(context: AssetExecutionContext) -> None:
    _run_spark_job(
        context,
        script_name="iceberg_maintenance.py",
    )


schedule_daily_klines = ScheduleDefinition(
    name="daily_kline_update",
    target=iceberg_historical_klines,
    cron_schedule="0 2 * * *",
    description="Chạy hàng ngày lúc 02:00 AM để cập nhật nến mới vào Iceberg.",
)

schedule_weekly_maintenance = ScheduleDefinition(
    name="weekly_iceberg_maintenance",
    target=iceberg_table_maintenance,
    cron_schedule="0 3 * * 0",
    description="Chạy mỗi Chủ Nhật lúc 03:00 AM để compact và dọn dẹp Iceberg.",
)

defs = Definitions(
    assets=[
        iceberg_historical_klines,
        iceberg_table_maintenance,
    ],
    schedules=[
        schedule_daily_klines,
        schedule_weekly_maintenance,
    ],
)
