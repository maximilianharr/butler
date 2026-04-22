FROM ubuntu:latest

ARG HTTP_PROXY_URL="http://127.0.0.1:8080"

ENV http_proxy="${HTTP_PROXY_URL}" \
    https_proxy="${HTTP_PROXY_URL}" \
    HTTP_PROXY="${HTTP_PROXY_URL}" \
    HTTPS_PROXY="${HTTP_PROXY_URL}"

RUN printf 'Acquire::http::proxy "%s";\nAcquire::https::proxy "%s";\n' \
    "${HTTP_PROXY_URL}" "${HTTP_PROXY_URL}" > /etc/apt/apt.conf.d/95proxies

WORKDIR /usr/src/app

# Install packages
RUN apt update
RUN apt install -y dos2unix nginx openssl

# optional packages for debugging
RUN DEBIAN_FRONTEND=noninteractive apt install -y vim net-tools

# Create self-signed SSL certificate
# (will be overwritten with volume in .container file if available)
RUN mkdir -p /etc/nginx/ssl
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/dashboard.key \
    -out /etc/nginx/ssl/dashboard.crt \
    -subj "/C=DE/ST=BW/L=TU/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1"

# Create startup script
COPY start.sh /start.sh
RUN dos2unix /start.sh && chmod +x /start.sh

# Start with script
CMD ["/start.sh"]
