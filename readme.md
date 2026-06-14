# Executor State Machine MCP Server (`arc-mcp`)

```                                                                  
  ▄▄▄▄   ▄▄▄▄▄▄▄    ▄▄▄▄▄▄▄       ▄▄▄      ▄▄▄  ▄▄▄▄▄▄▄ ▄▄▄▄▄▄▄   
▄██▀▀██▄ ███▀▀███▄ ███▀▀▀▀▀       ████▄  ▄████ ███▀▀▀▀▀ ███▀▀███▄ 
███  ███ ███▄▄███▀ ███            ███▀████▀███ ███      ███▄▄███▀ 
███▀▀███ ███▀▀██▄  ███      ▀▀▀▀▀ ███  ▀▀  ███ ███      ███▀▀▀▀   
███  ███ ███  ▀███ ▀███████       ███      ███ ▀███████ ███       
```                                                                                                                                  
An execution state machine implemented as a Model Context Protocol (MCP) server via standard I/O. This server manages step-by-step execution of structured plans defined in YAML, providing a reliable way for AI agents and clients to follow complex, multi-step procedures while tracking execution status and conserving token limits.

## 🚀 Features

- **Plan Initialization**: Parse and load sequential execution plans from YAML format.
- **State Management**: Tracks execution machine states seamlessly (`idle`, `running`, `halted`, `completed`).
- **Token Optimization**: Automatically strips out non-executable logging data (e.g., `intent`) from payload steps when retrieved, keeping context windows lightweight.
- **Robust Execution Tracking**: Built-in tools for cleanly advancing steps or reporting structured failure modes.
- **Standard Protocol**: Built on the official `@modelcontextprotocol/sdk` using the `StdioServerTransport`.

## 🛠️ Provided MCP Tools

This server exposes the following tools to the connected MCP client:

### 1. `begin_plan`
- **Description**: Initializes a new plan from a YAML string and sets the state machine to `running`.
- **Parameters**: 
  - `plan_yaml` (string, required): The execution plan strictly formatted in YAML.

### 2. `get_next_step`
- **Description**: Retrieves the next executable step. Strips logging data to save tokens.
- **Parameters**: None

### 3. `mark_step_complete`
- **Description**: Marks the current step as complete, validates the step `id`, and advances the state machine to the next step.
- **Parameters**: 
  - `id` (string, required): The ID of the step to mark complete.

### 4. `report_failure`
- **Description**: Halts the plan, logs the failure, and returns a structured diagnostic report meant for the orchestrating Architect. Note: captured output is securely truncated to the last 1000 characters.
- **Parameters**: 
  - `id` (string, required): The step ID where the failure occurred.
  - `reason` (string, required): The explanation of the failure.
  - `actual` (number, optional): Actual outcome/metric.
  - `captured` (string, optional): Captured stdout, stderr, or context logs.

## 📦 Prerequisites & Installation

- **Node.js** v18 or higher (due to underlying MCP SDK requirements)
- **npm**

1. Clone or download the repository.
2. Install the necessary dependencies:
   ```bash
   npm install

```

## ⚙️ Configuration (MCP Client integration)

To integrate this server with your MCP client (e.g., Claude Desktop, custom MCP-enabled IDE), add the following to your MCP settings file.

**Note**: Be sure to replace `YOUR_FULL_PATH_HERE` with the actual absolute directory path containing your `index.js` file:

```json
{
  "mcpServers": {
    "arc-mcp": {
      "command": "node",
      "args": [
        "YOUR_FULL_PATH_HERE/arc-mcp/index.js"
      ],
      "env": {}
    }
  }
}

```

## 📜 Dependencies

* [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (^1.29.0)
* [`js-yaml`](https://www.npmjs.com/package/js-yaml) (^4.2.0)
