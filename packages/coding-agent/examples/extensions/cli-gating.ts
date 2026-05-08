/**
 * CLI Gating - Intercepts `bash` commands and prompts the user for permission.
 *
 * This extension provides a security gate for any `bash` command the agent
 * attempts to execute. When a new command is detected, it presents the user
 * with a UI prompt to make a decision.
 *
 * Features:
 *  - Intercepts all `bash` tool calls to check for approval.
 *  - Provides three choices:
 *    1. Allow Once: Permits the single execution of the specific command. The
 *       prompt will reappear if the same command is run again.
 *    2. Deny Once: Blocks the command from executing.
 *    3. Allow all 'cmd**' for this session: Creates a session-level glob
 *       permission (e.g., `ls**`) that allows the agent to run any command
 *       starting with that name for the remainder of the session.
 *  - Informs the agent when a command was explicitly approved by the user by
 *    prepending a note to the tool's output.
 *  - Notifies the user with an info message when a permission choice is made.
 *  - All permissions are ephemeral and reset at the start of each session.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { minimatch } from "minimatch";

// Stores glob patterns (e.g., "ls**") approved for the current session.
// This is ephemeral and resets when the agent is restarted.
const allowedGlobsOnce = new Set<string>();

// Temporarily stores the toolCallId of a command that has just been approved
// by the user. This is used by the `tool_result` handler to add a notification
// to the agent's context.
const justApproved = new Set<string>();

export default function (pi: ExtensionAPI) {
	// Intercept every tool call to check if it's a `bash` command that needs approval.
	pi.on("tool_call", async (event, ctx) => {
		// Only act on `bash` commands. Other tools are ignored.
		if (!isToolCallEventType("bash", event)) {
			return;
		}

		const command = event.input.command;

		// Check if the command matches a glob pattern approved for this session.
		const isAllowedByGlob = [...allowedGlobsOnce].some((pattern) => minimatch(command, pattern));

		// If it's allowed by a glob, let it execute without prompting.
		if (isAllowedByGlob) {
			return;
		}

		// --- Prompt the user for permission ---

		// Extract the base command name (e.g., "ls" from "ls -la") for the prompt.
		const commandName = command.trim().split(/\s+/)[0];
		const allowOnceLabel = "Allow Once";
		const denyOnceLabel = "Deny Once";
		const globLabel = `Allow all '${commandName}**' for this session`;

		// Present a dialog with the three choices.
		const choice = await ctx.ui.select(`The agent wants to execute the following command:\n\n${command}`, [
			allowOnceLabel,
			denyOnceLabel,
			globLabel,
		]);

		// --- Handle the user's choice ---

		if (choice === allowOnceLabel) {
			// Notify the user that their choice was acknowledged.
			ctx.ui.notify("Command approved for single execution.", "info");
			// Mark this specific tool call as approved so the agent can be notified.
			justApproved.add(event.toolCallId);
			// Allow the command to proceed.
			return;
		}

		if (choice === denyOnceLabel) {
			// Block the command and inform the agent why.
			return { block: true, reason: "User denied execution." };
		}

		if (choice === globLabel) {
			// Create a glob pattern to match this command and any arguments.
			const globPattern = `${commandName}**`;
			// Add the pattern to the session-level allow list.
			allowedGlobsOnce.add(globPattern);
			ctx.ui.notify(`Session permission added: ${globPattern}`, "info");
			// Mark this specific tool call as approved for agent notification.
			justApproved.add(event.toolCallId);
			// Allow the command to proceed.
			return;
		}

		// If the user dismissed the prompt (e.g., with Esc), block the command.
		return { block: true, reason: "User dismissed permission prompt." };
	});

	// Intercept the result of a tool call to notify the agent of an approval.
	pi.on("tool_result", async (event, _ctx) => {
		// Check if this is a `bash` command that was just approved via the prompt.
		if (event.toolName === "bash" && justApproved.has(event.toolCallId)) {
			// Remove the ID from the set to ensure this logic only runs once per approval.
			justApproved.delete(event.toolCallId);

			// Prepend a message to the command's output to inform the agent.
			const newContent =
				event.content[0]?.type === "text"
					? `[User approved this command for execution]\n\n${event.content[0].text}`
					: "[User approved this command for execution]";

			// Return the modified content. This is what the agent will see in its context.
			return {
				content: [{ type: "text", text: newContent }],
			};
		}
	});
}
