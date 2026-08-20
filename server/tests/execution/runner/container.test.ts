import { type Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRunId } from "../../../src/db/schema/public/JobRuns";
import type { WorkflowRunId } from "../../../src/db/schema/public/WorkflowRuns";
import { ContainerRunner } from "../../../src/execution/runner/container";

const config = {
	defaultContainer: "docker.io/alpine:3.23",
	runtimeOverlayContainer: "corncrake-runtime-overlay",
	runtimeOverlayVolume: "corncrake-runtime-overlay",
	cpuLimitMilli: 1000,
	memoryLimitMb: 2048,
} as ConstructorParameters<typeof ContainerRunner>[0];

function mockStream(): Readable {
	const stream = new Writable({ write: () => {} }) as unknown as Readable;
	stream.setEncoding = vi.fn();
	stream.pause = vi.fn();
	stream.resume = vi.fn();
	stream.destroy = vi.fn();
	return stream;
}

function makeContainer() {
	return {
		id: "fake-container-id",
		attach: vi.fn().mockResolvedValue(mockStream()),
		start: vi.fn().mockResolvedValue(undefined),
		wait: vi.fn().mockResolvedValue({ StatusCode: 0 }),
		remove: vi.fn().mockResolvedValue(undefined),
	};
}

function makeVolume(
	overrides: { inspect?: () => unknown; remove?: () => unknown } = {},
) {
	return {
		inspect: vi.fn().mockRejectedValue({ statusCode: 404 }),
		remove: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// biome-ignore lint/suspicious/noExplicitAny: can we avoid it?
let dockerode: any;

vi.mock("dockerode", () => ({
	default: vi.fn().mockImplementation(function Dockerode() {
		return dockerode;
	}),
}));

describe("container runner", () => {
	let container: ReturnType<typeof makeContainer>;

	beforeEach(() => {
		vi.clearAllMocks();
		container = makeContainer();

		dockerode = {
			getVolume: vi.fn(() => makeVolume()),
			createVolume: vi.fn().mockResolvedValue({}),
			createContainer: vi.fn().mockResolvedValue(container),
			pull: vi.fn().mockResolvedValue(mockStream()),
			modem: {
				followProgress: vi.fn((_stream: unknown, cb: (err: null) => void) =>
					cb(null),
				),
			},
		};
	});

	describe("initialise", () => {
		it("creates the runtime overlay volume if it does not exist", async () => {
			const runner = new ContainerRunner(config);

			await runner.initialise();

			expect(dockerode.createVolume).toHaveBeenCalledWith({
				Name: "corncrake-runtime-overlay",
			});
		});

		it("does not recreate the volume if it already exists", async () => {
			dockerode.getVolume = vi.fn(() =>
				makeVolume({ inspect: vi.fn().mockResolvedValue({}) }),
			);
			const runner = new ContainerRunner(config);

			await runner.initialise();

			expect(dockerode.createVolume).not.toHaveBeenCalled();
		});
	});

	describe("runJob", () => {
		it("creates a container with the default image and a readable name", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "echo hello",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.createContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "corncrake-1-1-step-0",
					Image: "docker.io/alpine:3.23",
				}),
			);
		});

		it("uses a step-specific image when provided", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							image: "node:20",
							command: "node --version",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.createContainer).toHaveBeenCalledWith(
				expect.objectContaining({ Image: "node:20" }),
			);
		});

		it("mounts workspace and overlay volumes with correct binds and working dir", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "echo hi",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.createContainer).toHaveBeenCalledWith(
				expect.objectContaining({
					WorkingDir: "/workspace",
					HostConfig: expect.objectContaining({
						Binds: [
							"corncrake-ws-1-1:/workspace:rw",
							"corncrake-runtime-overlay:/.corncrake/tools:ro",
						],
					}),
				}),
			);
		});

		it("starts and waits for the container, removes it on success", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "echo hi",
						},
					],
				},
				{
					onLog: vi.fn(),
					onStepEnd: vi.fn(),
					onJobEnd: vi.fn(),
				},
			);

			expect(container.start).toHaveBeenCalled();
			expect(container.wait).toHaveBeenCalled();
			expect(container.remove).toHaveBeenCalledWith({ force: true });
		});

		it("removes the workspace volume on success", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "echo hi",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.getVolume).toHaveBeenCalledWith("corncrake-ws-1-1");
		});

		it("reports failure when the container exits non-zero", async () => {
			const runner = new ContainerRunner(config);
			container.wait.mockResolvedValue({ StatusCode: 1 });
			const reporter = {
				onLog: vi.fn(),
				onStepEnd: vi.fn(),
				onJobEnd: vi.fn(),
			};

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "false",
						},
					],
				},
				reporter,
			);

			expect(reporter.onStepEnd).toHaveBeenCalledWith({
				stepIndex: 0,
				status: "failed",
				exitCode: 1,
			});
			expect(reporter.onJobEnd).toHaveBeenCalledWith({
				success: false,
				steps: [{ stepIndex: 0, status: "failed", exitCode: 1 }],
			});
		});

		it("removes container and volume even on failure", async () => {
			const runner = new ContainerRunner(config);
			container.wait.mockResolvedValue({ StatusCode: 1 });

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "false",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(container.remove).toHaveBeenCalledWith({ force: true });
			expect(dockerode.getVolume).toHaveBeenCalledWith("corncrake-ws-1-1");
		});

		it("creates the workspace volume when missing", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "echo hi",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.createVolume).toHaveBeenCalledWith(
				expect.objectContaining({ Name: "corncrake-ws-1-1" }),
			);
		});

		it("only pulls each unique image once per job", async () => {
			const runner = new ContainerRunner(config);

			await runner.runJob(
				{
					id: 1 as JobRunId,
					workflowRunId: 1n as WorkflowRunId,
					jobType: "user",
					sourceLocation: { file: "corncrake", line: 1 },
					steps: [
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "step1",
						},
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							command: "step2",
						},
						{
							stepType: "user",
							sourceLocation: { file: "corncrake", line: 1 },
							image: "custom:latest",
							command: "step3",
						},
					],
				},
				{ onLog: vi.fn(), onStepEnd: vi.fn(), onJobEnd: vi.fn() },
			);

			expect(dockerode.pull).toHaveBeenCalledTimes(2);
			expect(dockerode.pull).toHaveBeenCalledWith("docker.io/alpine:3.23");
			expect(dockerode.pull).toHaveBeenCalledWith("custom:latest");
		});

		// TODO: onLog assertion — currently console.log in source, not progressReporter.onLog
	});
});
