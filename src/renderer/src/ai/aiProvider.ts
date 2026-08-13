import type { AiChatMessage, AiChatResponse, AiProviderConfig } from './aiTypes'

export interface AiClient {
  chat: (messages: AiChatMessage[]) => Promise<AiChatResponse>
}

/**
 * OpenAI-compatible chat client (works with OpenAI, DeepSeek and other
 * compatible endpoints). The API key is sent only in the Authorization header
 * and is never included in prompts or logs.
 */
export function createOpenAiCompatibleClient(config: AiProviderConfig): AiClient {
  return {
    async chat(messages) {
      if (!config.endpoint || !config.apiKey || !config.model) {
        return { ok: false, content: '', error: 'AI 未配置（endpoint / apiKey / model）' }
      }

      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), config.timeoutMs)

      try {
        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            model: config.model,
            temperature: config.temperature,
            max_tokens: config.maxTokens,
            messages
          }),
          signal: controller.signal
        })

        if (!response.ok) {
          return { ok: false, content: '', error: `AI 请求失败（HTTP ${response.status}）` }
        }

        const payload = await response.json()
        const content = payload?.choices?.[0]?.message?.content
        if (typeof content !== 'string' || content.length === 0) {
          return { ok: false, content: '', error: 'AI 返回格式无效' }
        }

        return { ok: true, content }
      } catch (error) {
        const isTimeout = error instanceof Error && error.name === 'AbortError'
        return { ok: false, content: '', error: isTimeout ? 'AI 请求超时' : 'AI 连接失败' }
      } finally {
        window.clearTimeout(timeout)
      }
    }
  }
}
