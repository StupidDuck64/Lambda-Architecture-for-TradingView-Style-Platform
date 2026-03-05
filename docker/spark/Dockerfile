FROM apache/spark:3.5.5

USER root

# Install Python and pip packages needed by Spark jobs
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-pip curl procps \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir requests

# Create spark-events dir
RUN mkdir -p /opt/spark-events && chmod 777 /opt/spark-events

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV SPARK_HOME=/opt/spark
ENV PATH="$SPARK_HOME/bin:$SPARK_HOME/sbin:$PATH"
ENV PYTHONPATH="$SPARK_HOME/python:$SPARK_HOME/python/lib/py4j-0.10.9.7-src.zip"

EXPOSE 7077 8080 8081 18080

ENTRYPOINT ["/entrypoint.sh"]
