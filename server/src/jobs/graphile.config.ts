import { WorkerPreset } from "graphile-worker";

const preset: GraphileConfig.Preset = {
	extends: [WorkerPreset],
	worker: {
		maxPoolSize: 10,
		pollInterval: 2000,
		preparedStatements: true,
		schema: "graphile_worker",
		concurrentJobs: 5,
	},
};

export default preset;
