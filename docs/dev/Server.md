# MOLCI Server Development

## Testing

To run the tests, you need to have a test database running.

The included test Compose file is the easiest way to get a fast test database (as it disables various crash-safety features and uses a tmpfs mount to not persist data).

In the `server` directory:

```
docker compose -f docker-compose.test.yml up
```

(podman can also be used.)

Then

```
pnpm run test
```
