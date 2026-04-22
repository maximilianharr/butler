#!/bin/bash

# Fix permissions on mounted volume
find /usr/src/app -type d -exec chmod 755 {} \;
find /usr/src/app -type f -exec chmod 644 {} \;

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

# Check if nginx config test passed
if [ $? -eq 0 ]; then
    echo "Nginx configuration is valid. Starting nginx..."
    # Start nginx in foreground
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed!"
    exit 1
fi