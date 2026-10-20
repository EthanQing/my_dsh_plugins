export function isCollapsible(text) {
  return text.length > 1400 || text.split('\n').length > 18
}

export function useCollapsed(React, text) {
  const [expanded, setExpanded] = React.useState(false)
  React.useEffect(() => setExpanded(false), [text])
  return { collapsible: isCollapsible(text), expanded, toggle: () => setExpanded(value => !value) }
}
