#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-simple-notes}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-simple-notes}"
PLATFORM="${PLATFORM:-linux/amd64}"
TAR_FILE="${TAR_FILE:-simple-notes-amd64.tar}"
SSH_TARGET="${SSH_TARGET:-dmitri@nuc}"
REMOTE_TAR_FILE="${REMOTE_TAR_FILE:-~/${TAR_FILE}}"
HOST_BIND="${HOST_BIND:-127.0.0.1}"
HOST_PORT="${HOST_PORT:-9081}"
CONTAINER_PORT="${CONTAINER_PORT:-8080}"

IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "Building ${IMAGE} for ${PLATFORM}..."
docker buildx build \
  --platform "${PLATFORM}" \
  --output "type=docker,dest=${TAR_FILE}" \
  -t "${IMAGE}" \
  .

echo "Copying ${TAR_FILE} to ${SSH_TARGET}:${REMOTE_TAR_FILE}..."
scp "${TAR_FILE}" "${SSH_TARGET}:${REMOTE_TAR_FILE}"

echo "Loading image on ${SSH_TARGET}..."
ssh "${SSH_TARGET}" "docker load -i ${REMOTE_TAR_FILE}"

echo "Replacing container ${CONTAINER_NAME} on ${SSH_TARGET}..."
ssh "${SSH_TARGET}" "docker stop ${CONTAINER_NAME} >/dev/null 2>&1 || true; docker rm ${CONTAINER_NAME} >/dev/null 2>&1 || true"

echo "Starting ${CONTAINER_NAME} on ${HOST_BIND}:${HOST_PORT}..."
ssh "${SSH_TARGET}" "docker run -d --name ${CONTAINER_NAME} --restart unless-stopped -p ${HOST_BIND}:${HOST_PORT}:${CONTAINER_PORT} ${IMAGE}"

echo "Deployed ${IMAGE} to ${SSH_TARGET}."
