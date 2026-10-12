FROM golang:1.27 AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/ingest ./cmd/simulate

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/ingest /ingest
COPY --from=build /out/simulate /simulate

ENTRYPOINT ["/ingest"]
