# CORNCRAKECI Server Development

## Docker Networking Notes
### Firewall Configuration
We use host.docker.internal for cross-platform compatibility (Linux/Windows/). On Linux, you may need to allow Docker networks through the firewall

```
sudo ufw allow from 172.21.0.0/16 to any port 3000 comment 'CORNCRAKECI custom network'
sudo ufw allow from 172.17.0.0/16 to any port 3000 comment 'Docker default bridge'
```

## Database schema code generation

We rely on Kanel to generate types from the database schema,
to use with the Kysely library.

This gives us type-safe queries.

See `task generate:db` / `pnpm generate:db`.

## Testing

To run the tests, you need to have a test database running.

### The easiest way

In the project root:

```
task test
```

This:

- spins up a database using the Compose file (described in the next section)
- runs code generation tools, including database schema code generation if required
- runs the test suite

To run tests and get a coverage report:
```
task test:coverage
```

### The manual way

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

To get a coverage report, ensure the test database is running as above, then:

```
pnpm coverage
```

To get a Change Risk Anti-Patterns report, ensure the test database is running as above, then:

```
pnpm run test -c vitest-crap.config.ts
```

## Runner configuration

The runner configuration controls which job runner is enabled.

| Environment variable | Description | Default |
| --- | --- | --- |
| `RUNNER_TYPE` | Runner type. Set to `container` to enable the container runner. | unset |
| `RUNNER_DEFAULTCONTAINER` | Default container image used for jobs. | `docker.io/alpine:3.23` |
| `RUNNER_RUNTIMEOVERLAYCONTAINER` | Runtime overlay container image providing runtime tools. | `localhost/corncrake-runtime-overlay:latest` |
| `RUNNER_RUNTIMEOVERLAYVOLUME` | Volume name containing runtime overlay tools. | `corncrake-runtime-overlay` |

### Building the runtime overlay image

The runtime overlay image provides tools mounted into job containers at `/.corncrake/tools`.

For local development, build it from the repository root:

```
cd runtime-overlay && docker build -t localhost/corncrake-runtime-overlay:latest .
```

(podman can also be used)

## Log storage configuration

Job logs (per step) are stored by a pluggable log store. The `logs` config block selects the backend and its settings.

This is distinct from the `log` block, which configures pino application
logging. Do not merge the two.

| Environment variable | Description | Default |
| --- | --- | --- |
| `LOGS_STORE` | Log store backend. Only `local-disk` is supported today. | `local-disk` |
| `LOGS_ROOT` | Root directory for the local disk store. One plaintext file is written per step at `<root>/<workflowRunId>/<jobRunId>/step-<index>`. | `./data/logs` |
| `LOGS_RETENTIONDAYS` | Number of days to retain job logs before they are eligible for deletion. | `30` |

The log store is constructed on startup and its root is created with a recursive `mkdir` if it does not already exist.