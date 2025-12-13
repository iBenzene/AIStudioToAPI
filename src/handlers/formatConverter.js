/**
 * File: src/handlers/formatConverter.js
 * Description: Format converter that translates between OpenAI and Google Gemini API request/response formats
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

/**
 * Format Converter Module
 * Handles conversion between OpenAI and Google Gemini API formats
 */
class FormatConverter {
    constructor(logger, serverSystem) {
        this.logger = logger;
        this.serverSystem = serverSystem;
    }

    /**
     * Convert OpenAI request format to Google Gemini format
     */
    translateOpenAIToGoogle(openaiBody) { // eslint-disable-line no-unused-vars
        this.logger.info("[Adapter] Starting translation of OpenAI request format to Google format...");

        let systemInstruction = null;
        const googleContents = [];

        // Extract system messages
        const systemMessages = openaiBody.messages.filter(
            msg => msg.role === "system"
        );
        if (systemMessages.length > 0) {
            const systemContent = systemMessages.map(msg => msg.content).join("\n");
            systemInstruction = {
                parts: [{ text: systemContent }],
                role: "system",
            };
        }

        // Convert conversation messages
        const conversationMessages = openaiBody.messages.filter(
            msg => msg.role !== "system"
        );
        for (const message of conversationMessages) {
            const googleParts = [];

            if (typeof message.content === "string") {
                googleParts.push({ text: message.content });
            } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === "text") {
                        googleParts.push({ text: part.text });
                    } else if (part.type === "image_url" && part.image_url) {
                        const dataUrl = part.image_url.url;
                        const match = dataUrl.match(/^data:(image\/.*?);base64,(.*)$/);
                        if (match) {
                            googleParts.push({
                                inlineData: {
                                    data: match[2],
                                    mimeType: match[1],
                                },
                            });
                        }
                    }
                }
            }

            googleContents.push({
                parts: googleParts,
                role: message.role === "assistant" ? "model" : "user",
            });
        }

        // Build Google request
        const googleRequest = {
            contents: googleContents,
            ...(systemInstruction && {
                systemInstruction: { parts: systemInstruction.parts },
            }),
        };

        // Generation config
        const generationConfig = {
            maxOutputTokens: openaiBody.max_tokens,
            stopSequences: openaiBody.stop,
            temperature: openaiBody.temperature,
            topK: openaiBody.top_k,
            topP: openaiBody.top_p,
        };

        // Handle thinking config
        const extraBody = openaiBody.extra_body || {};
        const rawThinkingConfig
            = extraBody.google?.thinking_config
            || extraBody.google?.thinkingConfig
            || extraBody.thinkingConfig
            || extraBody.thinking_config
            || openaiBody.thinkingConfig
            || openaiBody.thinking_config;

        let thinkingConfig = null;

        if (rawThinkingConfig) {
            thinkingConfig = {};

            if (rawThinkingConfig.include_thoughts !== undefined) {
                thinkingConfig.includeThoughts = rawThinkingConfig.include_thoughts;
            } else if (rawThinkingConfig.includeThoughts !== undefined) {
                thinkingConfig.includeThoughts = rawThinkingConfig.includeThoughts;
            }

            this.logger.info(
                `[Adapter] Successfully extracted and converted thinking config: ${JSON.stringify(thinkingConfig)}`
            );
        }

        // Handle OpenAI reasoning_effort parameter
        if (!thinkingConfig) {
            const effort = openaiBody.reasoning_effort || extraBody.reasoning_effort;
            if (effort) {
                this.logger.info(
                    `[Adapter] Detected OpenAI standard reasoning parameter (reasoning_effort: ${effort}), auto-converting to Google format.`
                );
                thinkingConfig = { includeThoughts: true };
            }
        }

        // Force thinking mode
        if (this.serverSystem.forceThinking && !thinkingConfig) {
            this.logger.info(
                "[Adapter] ⚠️ Force thinking enabled and client did not provide config, injecting thinkingConfig"
            );
            thinkingConfig = { includeThoughts: true };
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

        // Force web search and URL context
        if (this.serverSystem.forceWebSearch || this.serverSystem.forceUrlContext) {
            if (!googleRequest.tools) {
                googleRequest.tools = [];
            }

            const toolsToAdd = [];

            // Handle Google Search
            if (this.serverSystem.forceWebSearch) {
                const hasSearch = googleRequest.tools.some(t => t.googleSearch);
                if (!hasSearch) {
                    googleRequest.tools.push({ googleSearch: {} });
                    toolsToAdd.push("googleSearch");
                }
            }

            // Handle URL Context
            if (this.serverSystem.forceUrlContext) {
                const hasUrlContext = googleRequest.tools.some(t => t.urlContext);
                if (!hasUrlContext) {
                    googleRequest.tools.push({ urlContext: {} });
                    toolsToAdd.push("urlContext");
                }
            }

            if (toolsToAdd.length > 0) {
                this.logger.info(
                    `[Adapter] ⚠️ Force features enabled, injecting tools: [${toolsToAdd.join(", ")}]`
                );
            }
        }

        // Safety settings
        googleRequest.safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];

        this.logger.info("[Adapter] Translation complete.");
        return googleRequest;
    }

    /**
     * Convert Google streaming response chunk to OpenAI format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - Optional state object to track thought mode
     */
    translateGoogleToOpenAIStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        if (!googleChunk || googleChunk.trim() === "") {
            return null;
        }

        let jsonString = googleChunk;
        if (jsonString.startsWith("data: ")) {
            jsonString = jsonString.substring(6).trim();
        }

        if (!jsonString || jsonString === "[DONE]") return null;

        let googleResponse;
        try {
            googleResponse = JSON.parse(jsonString);
        } catch (e) {
            this.logger.warn(`[Adapter] Unable to parse Google JSON chunk: ${jsonString}`);
            return null;
        }

        const candidate = googleResponse.candidates?.[0];
        if (!candidate) {
            if (googleResponse.promptFeedback) {
                this.logger.warn(
                    `[Adapter] Google returned promptFeedback, may have been blocked: ${JSON.stringify(
                        googleResponse.promptFeedback
                    )}`
                );
                const errorText = `[ProxySystem Error] Request blocked due to safety settings. Finish Reason: ${googleResponse.promptFeedback.blockReason}`;
                return `data: ${JSON.stringify({
                    choices: [
                        { delta: { content: errorText }, finish_reason: "stop", index: 0 },
                    ],
                    created: Math.floor(Date.now() / 1000),
                    id: `chatcmpl-${this._generateRequestId()}`,
                    model: modelName,
                    object: "chat.completion.chunk",
                })}\n\n`;
            }
            return null;
        }

        const delta = {};

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            const imagePart = candidate.content.parts.find(p => p.inlineData);

            if (imagePart) {
                const image = imagePart.inlineData;
                delta.content = `![Generated Image](data:${image.mimeType};base64,${image.data})`;
                this.logger.info("[Adapter] Successfully parsed image from streaming response chunk.");
            } else {
                let contentAccumulator = "";
                let reasoningAccumulator = "";

                for (const part of candidate.content.parts) {
                    if (part.thought === true) {
                        reasoningAccumulator += part.text || "";
                        // Track thought mode for proper tag closing
                        if (streamState) {
                            streamState.inThought = true;
                        }
                    } else {
                        contentAccumulator += part.text || "";
                    }
                }

                if (reasoningAccumulator) {
                    delta.reasoning_content = reasoningAccumulator;
                }
                if (contentAccumulator) {
                    delta.content = contentAccumulator;
                }
            }
        }

        if (!delta.content && !delta.reasoning_content && !candidate.finishReason) {
            return null;
        }

        const openaiResponse = {
            choices: [
                {
                    delta,
                    finish_reason: candidate.finishReason || null,
                    index: 0,
                },
            ],
            created: Math.floor(Date.now() / 1000),
            id: `chatcmpl-${this._generateRequestId()}`,
            model: modelName,
            object: "chat.completion.chunk",
        };

        return `data: ${JSON.stringify(openaiResponse)}\n\n`;
    }

    /**
     * Convert Google non-stream response to OpenAI format
     */
    convertGoogleToOpenAINonStream(googleResponse, modelName = "gemini-2.5-flash-lite") {
        const candidate = googleResponse.candidates?.[0];

        if (!candidate) {
            this.logger.warn("[Adapter] No candidate found in Google response");
            return {
                choices: [{
                    finish_reason: "stop",
                    index: 0,
                    message: { content: "", role: "assistant" },
                }],
                created: Math.floor(Date.now() / 1000),
                id: `chatcmpl-${this._generateRequestId()}`,
                model: modelName,
                object: "chat.completion",
            };
        }

        let content = "";
        let reasoning_content = "";

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                if (part.thought === true) {
                    reasoning_content += part.text || "";
                } else if (part.text) {
                    content += part.text;
                } else if (part.inlineData) {
                    const image = part.inlineData;
                    content += `![Generated Image](data:${image.mimeType};base64,${image.data})`;
                }
            }
        }

        const message = { content, role: "assistant" };
        if (reasoning_content) {
            message.reasoning_content = reasoning_content;
        }

        return {
            choices: [{
                finish_reason: candidate.finishReason || "stop",
                index: 0,
                message,
            }],
            created: Math.floor(Date.now() / 1000),
            id: `chatcmpl-${this._generateRequestId()}`,
            model: modelName,
            object: "chat.completion",
            usage: {
                completion_tokens: googleResponse.usageMetadata?.candidatesTokenCount || 0,
                prompt_tokens: googleResponse.usageMetadata?.promptTokenCount || 0,
                total_tokens: googleResponse.usageMetadata?.totalTokenCount || 0,
            },
        };
    }

    _generateRequestId() {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
}

module.exports = FormatConverter;
