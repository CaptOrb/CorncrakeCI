import "@typespec/http";
import "./common.tsp";

using Http;

namespace CorncrakeCIAPI {
  /** A runner capable of executing jobs. */
  model Runner {
    id: string;
    name: string;

    /** Total CPU cores available. */
    cpu: integer;

    /** Total RAM in MiB available. */
    ram: integer;

    /** CPU cores currently allocated to running jobs. */
    cpu_allocated: integer;

    /** RAM in MiB currently allocated to running jobs. */
    ram_allocated: integer;

    status: "idle" | "running" | "offline";
  }

  @route("/runners")
  @get
  @summary("List all registered runners and their current status")
  op listRunners(): Body<Runner[]> | InternalError;
}
