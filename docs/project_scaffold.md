Building the MCP state machine first is an excellent idea. Having the infrastructure in place ensures that once we start executing actual project plans, the Executor has the strict, controlled environment it requires.

To address your goal of minimizing token usage, we can implement two key optimizations in this state machine:

1. **Strip Non-Executable Data:** The `get_next_step` tool will automatically remove the `intent` field before handing the step to the Executor.
2. **Truncate Logs:** The `report_failure` tool will truncate captured stdout/stderr to a reasonable character limit so a hanging build doesn't flood the context window.

Here is the blueprint and the Node.js code for the MCP state machine.

---

## 1. Project Dependencies

To build this, you will need the official MCP SDK and a YAML parser.

```bash
npm init -y
npm install @modelcontextprotocol/sdk js-yaml

```

---

## 2. The Node.js MCP State Machine

Save this as `index.js`. It implements the exact state machine protocol defined in the specification, exposing the four required tools while enforcing the one-step-at-a-time invariant.

```javascript
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

```

---

## 3. Token Limits and Workflow

By implementing this MCP, you are establishing a hard boundary. The Executor will **only** see the output of `get_next_step`, which will now omit all human-readable fluff. When something goes wrong, you will receive a tightly formatted failure report with truncated logs, ensuring our context window stays clean and strictly focused on problem-solving.

Would you like to manually initialize this node project, or would you like me to write our very first `.yaml` plan so an Executor can bootstrap this MCP server automatically?