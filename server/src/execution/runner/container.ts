import Dockerode from "dockerode";
import type { PlannedUserJob, PlannedUserStep } from "../plan";
import type { DockerError, IProgressReporter, IRunner } from "./interface";

/**
 * Path at which runtime tools are mounted into containers.
 */
const RUNTIME_OVERLAY_PATH = "/.corncrake/tools";

export type ContainerRunnerConfig = {
	defaultContainer: string;

	/**
	 * Name of the runtime overlay container image to use.
	 * The runtime overlay container image should provide runtime tools at `RUNTIME_TOOLS_PATH`.
	 */
	runtimeOverlayContainer: string;

	/**
	 * Name of the volume that will contain the runtime overlay tools.
	 */
	runtimeOverlayVolume: string;

	/**
	 * Maximum CPUs to allocate per job, in milliCPUs.
	 */
	cpuLimitMilli: number;

	/**
	 * Maximum memory to allocate per job, in megabytes.
	 */
	memoryLimitMb: number;
};

/**
 * Runs jobs in containers.
 *
 * Used with a Docker or Podman socket.
 */
export class ContainerRunner implements IRunner {
	private dockerode: Dockerode;

	constructor(private config: ContainerRunnerConfig) {
		this.config = {
			...config,
		} as ContainerRunnerConfig;
		// TODO Configure dockerode...
		this.dockerode = new Dockerode();
	}

	async initialise(): Promise<void> {
		// Set up the runtime overlay volume so it's ready
		const exists = await volumeExists(
			this.dockerode,
			this.config.runtimeOverlayVolume,
		);
		if (!exists) {
			await this.dockerode.createVolume({
				Name: this.config.runtimeOverlayVolume,
			});
		}
		// TODO Populate the overlay volume from the overlay image
		// (create container -> copy -> remove)
	}

	async runJob(
		job: PlannedUserJob,
		progressReporter: IProgressReporter,
	): Promise<void> {
		const { id: jobRunId, workflowRunId } = job;
		if (workflowRunId === undefined) {
			throw new Error(`job ${jobRunId} has no workflowRunId`);
		}

		const jobId = `${workflowRunId}-${jobRunId}`;
		const workspaceVolume = `corncrake-ws-${jobId}`;

		const steps = job.steps.flatMap((step): PlannedUserStep[] => {
			if (step.stepType === "user") {
				return [step];
			}
			console.warn(`skipping step of type '${step.stepType}'`);
			return [];
		});

		const pulledImages = new Set<string>();

		let lastStatusCode = 0;

		console.log(`Starting job ${jobId}`);
		try {
			// TODO: is it sane for the workspace volume to already exist or should we just unconditionally create it?
			const exists = await volumeExists(this.dockerode, workspaceVolume);
			if (!exists) {
				// Ensure the workspace volume exists before starting the job
				await this.dockerode.createVolume({ Name: workspaceVolume });
			}
			for (const [i, step] of steps.entries()) {
				const image = step.image ?? this.config.defaultContainer;
				console.log(`Starting step: ${step.command}`);

				if (!pulledImages.has(image)) {
					await ensureImage(this.dockerode, image);
					pulledImages.add(image);
				}

				const container = await this.dockerode.createContainer({
					name: `corncrake-${jobId}-step-${i}`,
					Image: image,
					Cmd: ["sh", "-c", step.command],
					WorkingDir: "/workspace",
					Labels: {
						"org.bytetank.corncrakeci.workflow-run-id": String(workflowRunId),
						"org.bytetank.corncrakeci.job-run-id": String(jobRunId),
					},
					// TODO make configurable
					StopTimeout: 60,

					HostConfig: {
						Binds: [
							`${workspaceVolume}:/workspace:rw`,
							`${this.config.runtimeOverlayVolume}:${RUNTIME_OVERLAY_PATH}:ro`,
						],
						NanoCpus: this.config.cpuLimitMilli * 1_000_000,
						Memory: this.config.memoryLimitMb * 1_000_000,
						AutoRemove: true,
					},
				});
				try {
					// TODO Pipe logs to progressReporter.onLog

					const stream = await container.attach({
						stream: true,
						stdout: true,
						stderr: true,
					});

					stream.on("data", (chunk) => {
						console.log(chunk.toString());
					});
					/*
					stream.on("data", (chunk) => {
						progressReporter.onLog(chunk.toString());
					});*/

					console.log(`Starting container ${container.id}`);
					await container.start();

					const result = await container.wait();

					lastStatusCode = result.StatusCode;

					if (result.StatusCode !== 0) {
						progressReporter.onJobEnd({
							success: false,
							exitCode: lastStatusCode,
						});
						return;
					}
				} finally {
					await container.remove({ force: true }).catch((err) => {
						const status = (err as DockerError).statusCode;
						if (status !== 409 && status !== 404) throw err;
					});
				}

				/*this.logger.info(
				{ jobId: job.id, exitCode: result.StatusCode },
				"",
			);*/
			}
			progressReporter.onJobEnd({ success: true });
		} catch (err) {
			console.error(`Job ${jobId} failed`, err);
			progressReporter.onJobEnd({
				success: false,
				...(lastStatusCode !== 0 ? { exitCode: lastStatusCode } : {}),
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		} finally {
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					await this.dockerode.getVolume(workspaceVolume).remove();
					break;
				} catch (err) {
					console.info(
						`Failed to remove Docker volume "${workspaceVolume}" (attempt ${attempt + 1}/5), retrying...`,
					);

					const status = (err as DockerError).statusCode;
					if (status === 404) break;
					if (status === 409 && attempt < 4) {
						await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
						continue;
					}
					console.log(err);
					break;
				}
			}
		}
	}

	// TODO
	cancelJob(_job: null): Promise<void> {
		throw new Error("Method not implemented.");
	}
}

async function volumeExists(
	dockerode: Dockerode,
	volume: string,
): Promise<boolean> {
	try {
		await dockerode.getVolume(volume).inspect();
		return true;
	} catch (err) {
		if ((err as DockerError).statusCode === 404) {
			return false;
		}
		throw err;
	}
}

async function ensureImage(dockerode: Dockerode, image: string): Promise<void> {
	const stream = await dockerode.pull(image);
	await new Promise<void>((resolve, reject) => {
		dockerode.modem.followProgress(stream, (err) =>
			err ? reject(err) : resolve(),
		);
	});
}
