import {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "../ui/dropdown-menu";

type DropdownMenuComponent = typeof DropdownMenu & {
  Portal: typeof DropdownMenuPortal;
  Trigger: typeof DropdownMenuTrigger;
  Content: typeof DropdownMenuContent;
  Group: typeof DropdownMenuGroup;
  Label: typeof DropdownMenuLabel;
  Item: typeof DropdownMenuItem;
  CheckboxItem: typeof DropdownMenuCheckboxItem;
  RadioGroup: typeof DropdownMenuRadioGroup;
  RadioItem: typeof DropdownMenuRadioItem;
  Separator: typeof DropdownMenuSeparator;
  Shortcut: typeof DropdownMenuShortcut;
  Sub: typeof DropdownMenuSub;
  SubTrigger: typeof DropdownMenuSubTrigger;
  SubContent: typeof DropdownMenuSubContent;
};

const AugmentedDropdownMenu = DropdownMenu as DropdownMenuComponent;

AugmentedDropdownMenu.Portal = DropdownMenuPortal;
AugmentedDropdownMenu.Trigger = DropdownMenuTrigger;
AugmentedDropdownMenu.Content = DropdownMenuContent;
AugmentedDropdownMenu.Group = DropdownMenuGroup;
AugmentedDropdownMenu.Label = DropdownMenuLabel;
AugmentedDropdownMenu.Item = DropdownMenuItem;
AugmentedDropdownMenu.CheckboxItem = DropdownMenuCheckboxItem;
AugmentedDropdownMenu.RadioGroup = DropdownMenuRadioGroup;
AugmentedDropdownMenu.RadioItem = DropdownMenuRadioItem;
AugmentedDropdownMenu.Separator = DropdownMenuSeparator;
AugmentedDropdownMenu.Shortcut = DropdownMenuShortcut;
AugmentedDropdownMenu.Sub = DropdownMenuSub;
AugmentedDropdownMenu.SubTrigger = DropdownMenuSubTrigger;
AugmentedDropdownMenu.SubContent = DropdownMenuSubContent;

export { AugmentedDropdownMenu as DropdownMenu };
