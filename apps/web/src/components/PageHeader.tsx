interface Props {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between px-8 py-5 border-b border-border bg-surface">
      <h1 className="text-xl font-semibold text-text-primary">{title}</h1>
      {action && <div>{action}</div>}
    </div>
  )
}
