# Stop all running containers
podman stop --all

# Remove all containers (running and stopped)
podman rm --all --force

# Remove all volumes
podman volume rm --all --force

# Remove all pods
podman pod rm --all --force

# Prune everything (networks, build cache, etc.)
#podman system prune --all --force --volumes

# Optional: Reset Podman completely (removes all data)
#podman system reset --force
