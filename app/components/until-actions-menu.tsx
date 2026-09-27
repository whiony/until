"use client";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function ActionsMenu({
  label,
  accessibleLabel,
  disabled,
  icon: Icon = ChevronDown,
  actions,
}: {
  label: string;
  accessibleLabel?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  actions: {
    label: string;
    icon?: LucideIcon;
    destructive?: boolean;
    run: () => void;
  }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="actions-menu-trigger"
          disabled={disabled}
          aria-label={accessibleLabel}
        >
          <Icon size={18} aria-hidden="true" />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="until-actions-menu"
        align="end"
        collisionPadding={12}
      >
        {actions.map(({ label: name, icon: ActionIcon, destructive, run }) => (
          <div key={name}>
            {destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={disabled}
              variant={destructive ? "destructive" : "default"}
              onSelect={run}
            >
              {ActionIcon && <ActionIcon aria-hidden="true" />}
              {name}
            </DropdownMenuItem>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
