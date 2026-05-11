import Dockerode from "dockerode";
import type { IProgressReporter, IRunner } from "./interface";

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
};

const DEFAULT_CONFIG: Partial<ContainerRunnerConfig> = {
	// At 4 MB in size, it's a decent default.
	defaultContainer: "docker.io/alpine:3.23",

	// TODO We should pull this in from somewhere else too.
	runtimeOverlayContainer: "localhost/corncrake-runtime-overlay:latest",

	runtimeOverlayVolume: "corncrake-runtime-overlay",
};

/**
 * Runs jobs in containers.
 *
 * Used with a Docker or Podman socket.
 */
export class ContainerRunner implements IRunner {
	private dockerode: Dockerode;

	constructor(private config: ContainerRunnerConfig) {
		// TODO Configure dockerode...
		this.dockerode = new Dockerode();
	}

	async initialise(): Promise<void> {
		// Set up the runtime overlay volume so it's ready
	}

	async runJob(job: null, progressReporter: IProgressReporter): Promise<void> {
		throw new Error("Method not implemented.");
	}

	cancelJob(job: null): Promise<void> {
		throw new Error("Method not implemented.");
	}
}

async function volumeExists(
	dockerode: Dockerode,
	volume: string,
): Promise<bool> {
	try {
		await dockerode.getVolume(volume).inspect();
		return true;
	} catch (err) {
		if ((err as any).statusCode === 404) {
			return false;
		}
		throw err;
	}
}
