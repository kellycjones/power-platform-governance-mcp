export type Logger = (event: string, fields?: Record<string, unknown>) => void;

/**
 * One JSON object per line on stderr. Stdout is reserved for the MCP protocol
 * in stdio mode, and JSON lines drop straight into App Insights, Datadog or jq.
 */
export const logToStderr: Logger = (event, fields = {}) => {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), event, ...fields })}\n`);
};

export const silentLogger: Logger = () => {};
