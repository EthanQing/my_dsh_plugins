import Include from '@deepseek-ai/cordis-plugin-include'

export const name = 'dsh-aegis-workflow'

// Composition only: DSH owns preset registration, agents and notification delivery.
export function apply(ctx) {
  ctx.plugin(Include, { path: new URL('./presets.yml', import.meta.url).href })
}
