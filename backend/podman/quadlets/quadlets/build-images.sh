if grep -qi microsoft /proc/version 2>/dev/null; then
    PROXY_URL="http://127.0.0.1:3128"
    PROXY_URL_POST="http://host.containers.internal:3128"
    NO_PROXY="localhost,127.0.0.1"
    echo "Building for WSL environment with PX proxy"
else
    PROXY_URL_POST=${PROXY_URL}
    NO_PROXY=""
    echo "Building for Ubuntu server environment"
fi

podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/api:latest api/
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/nginx:latest nginx/
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/loki:latest loki/

# Observability stack (Prometheus, exporters, Alloy)
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/alloy:latest alloy/
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/grafana:latest grafana/
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/node-exporter:latest node-exporter/
podman build --build-arg HTTP_PROXY_URL="${PROXY_URL}" --network=host -t butler/prometheus:latest prometheus/
