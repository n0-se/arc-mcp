import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import yaml from "js-yaml";

// --- State Machine ---
let state = {
  status: "idle", // idle | running | halted | completed
  plan: null,
  currentStepIndex: 0,
};

const server = new Server(
  { name: "executor-state-machine", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// --- Tool Definitions ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "begin_plan",
        description: "Initializes a new plan from a YAML string.",
        inputSchema: {
          type: "object",
          properties: { plan_yaml: { type: "string" } },
          required: ["plan_yaml"],
        },
      },
      {
        name: "get_next_step",
        description: "Retrieves the next executable step. Strips logging data to save tokens.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "mark_step_complete",
        description: "Marks the current step as complete and advances the state machine.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "report_failure",
        description: "Halts the plan and reports a structured failure.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
            actual: { type: "number" },
            captured: { type: "string" },
          },
          required: ["id", "reason"],
        },
      },
    ],
  };
});

// --- Tool Execution ---
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "begin_plan") {
      const parsed = yaml.load(args.plan_yaml);
      if (!parsed || !parsed.plan || !parsed.plan.steps) {
        throw new Error("Invalid plan format.");
      }
      state = {
        status: "running",
        plan: parsed.plan,
        currentStepIndex: 0,
      };
      return { content: [{ type: "text", text: `Plan '${state.plan.name}' initialized. Ready for execution.` }] };
    }

    if (name === "get_next_step") {
      if (state.status !== "running") return { content: [{ type: "text", text: `Error: State machine is ${state.status}.` }] };
      if (state.currentStepIndex >= state.plan.steps.length) {
        state.status = "completed";
        return { content: [{ type: "text", text: "Plan completed. No more steps." }] };
      }

      const step = state.plan.steps[state.currentStepIndex];

      // TOKEN OPTIMIZATION: Strip 'intent' to keep the payload strictly executable
      const { intent, ...executableStep } = step;

      return { content: [{ type: "text", text: JSON.stringify(executableStep, null, 2) }] };
    }

    if (name === "mark_step_complete") {
      if (state.status !== "running") return { content: [{ type: "text", text: `Error: Cannot complete step, machine is ${state.status}.` }] };

      const currentStep = state.plan.steps[state.currentStepIndex];
      if (args.id !== currentStep.id) {
        return { content: [{ type: "text", text: `Error: ID mismatch. Expected ${currentStep.id}, got ${args.id}.` }] };
      }

      state.currentStepIndex++;
      return { content: [{ type: "text", text: `Step ${args.id} complete. Advanced to next step.` }] };
    }

    if (name === "report_failure") {
      state.status = "halted";

      // TOKEN OPTIMIZATION: Truncate captured output to the last 1000 characters
      let truncatedCaptured = args.captured || "";
      if (truncatedCaptured.length > 1000) {
        truncatedCaptured = "...[TRUNCATED]...\n" + truncatedCaptured.slice(-1000);
      }

      const report = {
        id: args.id,
        reason: args.reason,
        actual: args.actual,
        captured: truncatedCaptured
      };

      // Returns a tight JSON string meant for the Architect (me) to analyze
      return { content: [{ type: "text", text: `HALTED.\n${JSON.stringify(report)}` }] };
    }

    throw new Error("Unknown tool");
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
});

// --- Boot ---
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Executor State Machine MCP Server running on stdio");
}

run().catch(console.error);