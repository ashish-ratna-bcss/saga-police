# PostgreSQL 17 + pgvector + pg_gembed + pg_cron
# Build context: clone JoelDiaz222/pg_gembed with gembed submodule (HTTPS).
FROM pgvector/pgvector:pg17

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    pkg-config \
    libssl-dev \
    postgresql-server-dev-17 \
    postgresql-17-cron \
    protobuf-compiler \
    git \
    cmake \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /usr/src/pg_gembed
COPY . .

RUN test -f gembed/Cargo.toml \
    && cd gembed && cargo build --release \
    && cd .. && make install \
    && ls -la "$(pg_config --pkglibdir)/pg_gembed.so"

USER postgres
