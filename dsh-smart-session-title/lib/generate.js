/**
 * One bounded model call producing one candidate title.
 *
 * The provider and the batch preview share this module so both obey the same
 * system instruction, input budget, length/topic rules, and retry policy.
 */
import { executeSessionTitleLlm } from '@deepseek-ai/dsh-session-title-llm'
import {
  assistantTextAfter,
  buildProviderInput,
  collectUserMessages,
  decideTitle,
} from './title.js'

/** The instruction that keeps output usable as one plain Chinese title line. */
export function systemPrompt() {
  return [
    '你是会话标题生成器。阅读给定 JSON 里的会话目标（goal，按时间顺序的真人消息）、本轮助手回复（assistant）与当前标题（currentTitle）。',
    '只输出一行标题，不要引号、星号、Markdown、XML、前缀“标题：”、解释或代码。',
    '标题必须是简体中文，6 到 16 个汉字（可含必要英文或数字），准确概括会话要解决的具体问题。',
    '保留项目名、技术名、文件名、错误码、英文专名等辨识度高的词，例如 “修复 DSH 插件 Remote 校验”。',
    '禁止“新会话”“问题讨论”“代码优化”“继续排查”这类泛化标题；不要复述客套话。',
    '如果 currentTitle 已经贴合同一主题，原样输出 currentTitle。',
    '输出只有标题本身，不要句号结尾。',
  ].join('\n')
}

/** Reframed instruction for the single retry after a length/empty rejection. */
function retryPrompt() {
  return [
    systemPrompt(),
    '上一次输出不符合要求。这次只输出 6 到 16 个汉字的一行标题，不含任何其他字符。',
  ].join('\n')
}

/** Select the route's least supported reasoning effort for a title call. */
const selectReasoningEffort = model => model.reasoning?.efforts[0]?.id

/**
 * Resolve the model route for one Session.
 * @param session - live Session.
 * @param config - plugin configuration.
 * @returns `{provider, model}`.
 * @throws when neither the plugin config nor the logged request header names a route.
 */
export function resolveRoute(session, config) {
  if (typeof config.provider === 'string' && typeof config.model === 'string') {
    return { provider: config.provider, model: config.model }
  }
  const header = session.requestHeader()?.config
  if (header !== undefined && typeof header.provider === 'string' && typeof header.model === 'string') {
    return { provider: header.provider, model: header.model }
  }
  throw new Error('smart-session-title: 会话尚未记录模型路由，请在插件配置中同时设置 provider 与 model')
}

/**
 * Convert plugin configuration into the execution controls of the shared helper.
 * @param config - validated plugin configuration.
 * @returns execution controls for `executeSessionTitleLlm`.
 */
export function executionConfig(config) {
  return {
    maxInputBytes: config.maxInputBytes,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
    ...config.provider === undefined ? {} : { provider: config.provider },
    ...config.model === undefined ? {} : { model: config.model },
  }
}

/**
 * Generate one title candidate from a Session snapshot.
 * @param ctx - Host context exposing `llm`.
 * @param config - validated plugin configuration.
 * @param options - session, log, bounds, title, cancellation, and provider identity.
 * @returns `{title, model, messageSeqs, retried}`.
 * @throws when the route, input budget, assistant text, or model output cannot produce a valid title.
 */
export async function generateCandidate(ctx, config, options) {
  const { session, events, lastUserSeq, throughSeq, currentTitle, signal, titleProvider } = options
  signal?.throwIfAborted()
  const messages = collectUserMessages(events).filter(message => message.seq <= lastUserSeq)
  if (messages.length === 0) throw new Error('smart-session-title: 会话没有可用的真人消息')
  const assistantText = assistantTextAfter(events, lastUserSeq, throughSeq)
  const assistantLength = assistantText.trim().length
  if (assistantLength === 0) throw new Error('smart-session-title: 本轮没有 AI 文本回复，保留原标题')
  if (assistantLength < config.minAssistantChars) {
    throw new Error(`smart-session-title: 本轮 AI 文本过短（${assistantLength} 字符），保留原标题`)
  }
  const route = options.route ?? resolveRoute(session, config)
  const { input, messageSeqs } = buildProviderInput({
    messages,
    assistantText,
    currentTitle,
    budgetBytes: config.maxInputBytes,
  })
  const request = {
    session,
    messages,
    route,
    ...currentTitle === undefined ? {} : { currentTitle },
    signal,
  }
  const call = async system => {
    signal?.throwIfAborted()
    if (Buffer.byteLength(input, 'utf8') > config.maxInputBytes) {
      throw new Error('smart-session-title: input exceeds maxInputBytes')
    }
    const response = await executeSessionTitleLlm(ctx, executionConfig(config), request, titleProvider, {
      system,
      input,
      messageSeqs,
      selectReasoningEffort,
    })
    if (response.finish.kind === 'tool-calls') throw new Error('smart-session-title: 标题输出只能是文本')
    if (response.finish.kind === 'max-tokens') throw new Error('smart-session-title: 标题输出达到 maxOutputTokens')
    const text = response.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n')
    return { text, model: response.model }
  }
  let first = await call(systemPrompt())
  let decision = decideTitle(first.text, { currentTitle })
  let retried = false
  if (decision.kind === 'reject') {
    first = await call(retryPrompt())
    decision = decideTitle(first.text, { currentTitle })
    retried = true
  }
  if (decision.kind === 'reject') {
    throw new Error(`smart-session-title: 模型输出不是合法标题（${decision.reason}），保留原标题`)
  }
  return { title: decision.title, model: first.model, messageSeqs, retried }
}
