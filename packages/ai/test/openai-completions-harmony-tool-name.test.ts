import { Type } from "typebox";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModel } from "../src/models.js";
import { streamSimple } from "../src/stream.js";
import type { Tool } from "../src/types.js";

const mockState = vi.hoisted(() => ({
	chunks: undefined as
		| Array<{
				id?: string;
				choices?: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>;
				usage?: {
					prompt_tokens: number;
					completion_tokens: number;
					prompt_tokens_details: { cached_tokens: number };
					completion_tokens_details: { reasoning_tokens: number };
				};
		  }>
		| undefined,
}));

vi.mock("openai", () => {
	class FakeOpenAI {
		chat = {
			completions: {
				create: () => {
					const stream = {
						async *[Symbol.asyncIterator]() {
							for (const chunk of mockState.chunks ?? []) {
								yield chunk;
							}
						},
					};
					const promise = Promise.resolve(stream) as Promise<typeof stream> & {
						withResponse: () => Promise<{
							data: typeof stream;
							response: { status: number; headers: Headers };
						}>;
					};
					promise.withResponse = async () => ({
						data: stream,
						response: { status: 200, headers: new Headers() },
					});
					return promise;
				},
			},
		};
	}

	return { default: FakeOpenAI };
});

function makeToolCallChunks(toolName: string, args: string) {
	return [
		{
			id: "chatcmpl-harmony-test",
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id: "call_1",
								type: "function",
								function: { name: toolName, arguments: "" },
							},
						],
					},
					finish_reason: null,
				},
			],
		},
		{
			id: "chatcmpl-harmony-test",
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								type: "function",
								function: { name: null, arguments: args },
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				prompt_tokens_details: { cached_tokens: 0 },
				completion_tokens_details: { reasoning_tokens: 0 },
			},
		},
	];
}

const readTool: Tool = {
	name: "read",
	description: "Read a file",
	parameters: Type.Object({ path: Type.String() }),
};

function buildModel() {
	const { compat: _compat, ...baseModel } = getModel("openai", "gpt-4o-mini")!;
	return { ...baseModel, api: "openai-completions" } as const;
}

function buildContext() {
	return {
		messages: [{ role: "user" as const, content: "Read README.md", timestamp: Date.now() }],
		tools: [readTool],
	};
}

describe("openai-completions harmony tool name sanitization", () => {
	beforeEach(() => {
		mockState.chunks = undefined;
	});

	it("strips <|channel|> token leaked into tool name", async () => {
		mockState.chunks = makeToolCallChunks("read<|channel|>commentary", '{"path":"README.md"}');

		const response = await streamSimple(buildModel(), buildContext(), { apiKey: "test" }).result();

		const toolCall = response.content.find((b) => b.type === "toolCall");
		expect(toolCall).toBeDefined();
		expect(toolCall!.type).toBe("toolCall");
		if (toolCall!.type === "toolCall") {
			expect(toolCall!.name).toBe("read");
		}
	});

	it("strips <|constrain|> token leaked into tool name", async () => {
		mockState.chunks = makeToolCallChunks("read<|constrain|>json", '{"path":"README.md"}');

		const response = await streamSimple(buildModel(), buildContext(), { apiKey: "test" }).result();

		const toolCall = response.content.find((b) => b.type === "toolCall");
		expect(toolCall).toBeDefined();
		if (toolCall!.type === "toolCall") {
			expect(toolCall!.name).toBe("read");
		}
	});

	it("passes clean tool name through unchanged", async () => {
		mockState.chunks = makeToolCallChunks("read", '{"path":"README.md"}');

		const response = await streamSimple(buildModel(), buildContext(), { apiKey: "test" }).result();

		const toolCall = response.content.find((b) => b.type === "toolCall");
		expect(toolCall).toBeDefined();
		if (toolCall!.type === "toolCall") {
			expect(toolCall!.name).toBe("read");
		}
	});
});
