FROM rust:1-slim-bookworm AS server-builder
WORKDIR /build
ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
COPY server/Cargo.toml server/Cargo.lock* ./server/
COPY server/src ./server/src
RUN cargo build --manifest-path server/Cargo.toml --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --create-home salvo
COPY --from=server-builder /build/server/target/release/signal-salvo-server /usr/local/bin/signal-salvo-server
USER 10001
WORKDIR /home/salvo
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/signal-salvo-server"]
