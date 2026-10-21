// Geometry is tested on the live Dock; the comparison stage clones its rendered DOM
// only for a readable side-by-side screenshot (it is never used for action tests).
export function createIconChecks({ store, main, pause, check }) {
  const shape = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  const toolbar = () => main().querySelector('.dbt-toolbar')
  async function icons() {
    if (store.getSnapshot().maximized) store.maximize()
    if (store.getSnapshot().collapsed) store.collapse()
    store.show(); await pause()
    const inspect = mode => {
      const buttons = [...toolbar().querySelectorAll('.dbt-action-btn')]
      check(`${mode}: all toolbar action buttons have SVG and no text glyph`, buttons.length >= 5 && buttons.every(button => button.querySelector('svg') && !button.textContent.trim()))
      for (const button of buttons) {
        const label = button.getAttribute('aria-label') || button.title
        const computed = getComputedStyle(button), r = shape(button), svg = button.querySelector('svg'), icon = shape(svg)
        const expectedSize = button.title === '新建底部终端' ? 16 : 14
        check(`${mode}: ${label} button is 22px/border0/radius4`, Math.abs(r.width - 22) < .1 && Math.abs(r.height - 22) < .1 && computed.borderTopWidth === '0px' && computed.borderRadius === '4px', { r, border: computed.borderTopWidth, radius: computed.borderRadius })
        check(`${mode}: ${label} uses official SVG metrics and stroke`, icon.width === expectedSize && icon.height === expectedSize && svg.getAttribute('viewBox') === '0 0 16 16' && getComputedStyle(svg).strokeWidth === '1px', { icon, stroke: getComputedStyle(svg).strokeWidth })
      }
    }
    inspect('normal'); store.collapse(); await pause(); inspect('collapsed'); store.collapse(); store.maximize(); await pause(); inspect('maximized'); store.maximize(); await pause()
  }
  async function iconComparison() {
    document.querySelector('[data-icon-comparison]')?.remove()
    if (store.getSnapshot().maximized) store.maximize()
    if (store.getSnapshot().collapsed) store.collapse()
    store.show(); store.resize(240); await pause()
    const stage = document.createElement('section')
    stage.dataset.iconComparison = ''
    stage.style.cssText = 'position:fixed;inset:140px 24px auto;z-index:9999;background:#fff;border:1px solid #d9dce2;border-radius:12px;padding:24px;box-shadow:0 16px 60px #0003;'
    const title = document.createElement('div'); title.textContent = '隔离预览 · 真实官方SVG · Menu/Button测试替身'; title.style.cssText = 'font-size:14px;color:#59606a;margin-bottom:22px'; stage.append(title)
    const columns = document.createElement('div'); columns.style.cssText = 'display:grid;grid-template-columns:340px minmax(0,1fr);gap:28px;align-items:start'; stage.append(columns)
    const left = document.createElement('div'), right = document.createElement('div'); columns.append(left, right)
    const caption = (parent, text) => { const label = document.createElement('div'); label.textContent = text; label.style.cssText = 'font-size:12px;color:#747b86;margin:0 0 10px'; parent.append(label) }
    caption(left, '开始卡片：官方 Artwork 与 ChevronRight')
    for (const guide of main().querySelectorAll('.fixture-guide-gallery .dbt-terminal-guide')) { const clone = guide.cloneNode(true); clone.style.marginBottom = '12px'; left.append(clone) }
    const addToolbar = label => { caption(right, label); const shell = document.createElement('div'); shell.className = 'dbt-dock'; shell.style.cssText = 'margin-bottom:18px;border:1px solid #d9dce2;border-radius:6px'; const clone = toolbar().cloneNode(true); shell.append(clone); right.append(shell); return shell }
    addToolbar('标签栏：新建 / Shell / 折叠 / 最大化 / 隐藏')
    const normal = addToolbar('悬停新建按钮（真实鼠标）')
    store.maximize(); await pause(); addToolbar('最大化状态：还原图标'); store.maximize(); store.collapse(); await pause(); addToolbar('折叠状态：展开图标'); store.collapse(); await pause()
    document.body.append(stage)
    const button = normal.querySelector('[title="新建底部终端"]'); button.dataset.iconHoverTarget = ''
    const rect = shape(button)
    return { clip: { ...shape(stage), scale: 1 }, hover: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, background: getComputedStyle(button).backgroundColor }
  }
  async function verifyIconHover(before) {
    await pause()
    const button = document.querySelector('[data-icon-hover-target]')
    const after = getComputedStyle(button).backgroundColor
    check('official SVG action hover changes background without border or size shift', before !== after && after !== 'rgba(0, 0, 0, 0)' && getComputedStyle(button).borderTopWidth === '0px' && shape(button).width === 22, { before, after })
  }
  return { icons, iconComparison, verifyIconHover }
}
