#!/usr/bin/env bash
set -e

IMAGE="ignazioc/media-player"
TAG="${1:-latest}"

echo "Building $IMAGE:$TAG ..."
docker build -t "$IMAGE:$TAG" .

echo "Pushing $IMAGE:$TAG to Docker Hub ..."
docker push "$IMAGE:$TAG"

echo "Done. Pull with:"
echo "  docker pull $IMAGE:$TAG"
