// DSH 0.2.1-rc.2 ui-sidebar-right PanelChrome's ExitFullscreenGlyph.
// This shared product glyph is not exported by ui-primitives. Preserve the
// original viewBox, paths and default one-unit stroke; only size is configurable.
export function createRestoreIcon({ createElement: h }) {
  return function RestoreIcon({ size = 14 }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
      h('path', { d: 'M9 2.5V6C9 6.26522 9.10536 6.51957 9.29289 6.70711C9.48043 6.89464 9.73478 7 10 7H13.5', stroke: 'currentColor' }),
      h('path', { d: 'M7 13.5V10C7 9.73478 6.89464 9.48043 6.70711 9.29289C6.51957 9.10536 6.26522 9 6 9H2.5', stroke: 'currentColor' }))
  }
}
