# CORNCRAKECI Server Development

## Docker Networking Notes
### Firewall Configuration
We use host.docker.internal for cross-platform compatibility (Linux/Windows/). On Linux, you may need to allow Docker networks through the firewall

```
sudo ufw allow from 172.21.0.0/16 to any port 3000 comment 'CORNCRAKECI custom network'
sudo ufw allow from 172.17.0.0/16 to any port 3000 comment 'Docker default bridge'
```

## Testing

To run the tests, you need to have a test database running.

## The easiest way

In the project root:

```
task test
```

This:

- spins up a database using the Compose file (described in the next section)
- runs code generation tools
- runs the test suite

## The manual way

The included test Compose file provides a fast test database (as it disables various crash-safety features and uses a tmpfs mount to not persist data).

In the `server` directory:

```
docker compose -f docker-compose.test.yml up
```

(podman can also be used.)

Then

```
pnpm run test
```
