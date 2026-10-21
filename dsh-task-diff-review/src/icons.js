export function createIcons(React) {
  const h = React.createElement

  const IconBranch = ({ size = 14 }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'dtd-svg-icon' },
    h('circle', { cx: 4, cy: 4, r: 2 }),
    h('circle', { cx: 4, cy: 12, r: 2 }),
    h('circle', { cx: 12, cy: 7, r: 2 }),
    h('path', { d: 'M4 6v4M4 8.5C6 8.5 7.5 7 10 7' }))

  const IconChevron = ({ size = 12, className = '' }) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', className: `dtd-svg-chevron ${className}` },
    h('path', { d: 'M3 4.5L6 7.5L9 4.5' }))

  const IconChevronRight = ({ size = 12, className = '' }) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', className: `dtd-svg-chevron-right ${className}` },
    h('path', { d: 'M4.5 3L7.5 6L4.5 9' }))

  const IconClose = ({ size = 12 }) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', className: 'dtd-svg-icon' },
    h('path', { d: 'M2.5 2.5l7 7M9.5 2.5l-7 7' }))

  const IconCheck = ({ size = 12 }) => h('svg', { width: size, height: size, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'dtd-svg-icon' },
    h('path', { d: 'M2.5 6.5l2.5 2.5 4.5-5' }))

  const IconRefresh = ({ size = 13 }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'dtd-svg-icon' },
    h('path', { d: 'M2.5 8a5.5 5.5 0 0 1 9.3-3.9L13.5 6M13.5 2v4h-4M13.5 8a5.5 5.5 0 0 1-9.3 3.9L2.5 10M2.5 14v-4h4' }))

  const IconInfo = ({ size = 13 }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'dtd-svg-icon' },
    h('circle', { cx: 8, cy: 8, r: 6.5 }),
    h('path', { d: 'M8 7v4.5M8 4.75v.5' }))

  const IconSparkles = ({ size = 13 }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'dtd-svg-icon' },
    h('path', { d: 'M8 1.5l1.5 3.8 3.8 1.5-3.8 1.5L8 12.1 6.5 8.3 2.7 6.8l3.8-1.5L8 1.5z' }))

  return { IconBranch, IconChevron, IconChevronRight, IconClose, IconCheck, IconRefresh, IconInfo, IconSparkles }
}
