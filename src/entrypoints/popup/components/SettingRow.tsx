import { Label, Switch } from "@ci/shadcn";

/** Labeled switch row: title + description left, Switch right. */
export function SettingRow({
  id,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0 flex-1 pr-2">
        <Label htmlFor={id} className="text-sm leading-snug font-medium">
          {title}
        </Label>
        {description && (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
