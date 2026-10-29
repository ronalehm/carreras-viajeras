import type { ReactNode } from "react";

type CrmPageHeaderProps = {
  title: string;
  description: string;
  section?: string;
  action?: ReactNode;
};

export function CrmPageHeader({
  title,
  description,
  section = "Vista general",
  action,
}: CrmPageHeaderProps) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
          CRM{" "}
          <span aria-hidden="true" className="mx-2">
            /
          </span>{" "}
          {section}
        </p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
