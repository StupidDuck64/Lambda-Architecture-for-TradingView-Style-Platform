FROM python:3.11-slim

# ── System deps + Java 11 (for spark-submit) ──────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless wget curl procps && \
    rm -rf /var/lib/apt/lists/*

# ── Spark 3.4.1 (spark-submit only, no data processing here) ─────────────────
ENV SPARK_VERSION=3.4.1
ENV SPARK_HOME=/opt/spark
RUN wget -q https://archive.apache.org/dist/spark/spark-${SPARK_VERSION}/spark-${SPARK_VERSION}-bin-hadoop3.tgz && \
    tar -xzf spark-${SPARK_VERSION}-bin-hadoop3.tgz -C /opt && \
    mv /opt/spark-${SPARK_VERSION}-bin-hadoop3 ${SPARK_HOME} && \
    rm spark-${SPARK_VERSION}-bin-hadoop3.tgz
ENV PATH="${SPARK_HOME}/bin:${PATH}"
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# ── Python packages ───────────────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    dagster==1.9.* \
    dagster-webserver==1.9.* \
    dagster-postgres==0.25.* \
    pyspark==3.4.1 \
    requests \
    pyarrow

# ── Dagster home & config ─────────────────────────────────────────────────────
RUN mkdir -p /dagster-home
COPY dagster.yaml /dagster-home/dagster.yaml
ENV DAGSTER_HOME=/dagster-home

WORKDIR /app
