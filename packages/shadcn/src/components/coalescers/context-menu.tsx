import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
} from "../ui/context-menu";

type ContextMenuComponent = typeof ContextMenu & {
  Trigger: typeof ContextMenuTrigger;
  Content: typeof ContextMenuContent;
  Item: typeof ContextMenuItem;
  CheckboxItem: typeof ContextMenuCheckboxItem;
  RadioItem: typeof ContextMenuRadioItem;
  Label: typeof ContextMenuLabel;
  Separator: typeof ContextMenuSeparator;
  Shortcut: typeof ContextMenuShortcut;
  Group: typeof ContextMenuGroup;
  Portal: typeof ContextMenuPortal;
  Sub: typeof ContextMenuSub;
  SubContent: typeof ContextMenuSubContent;
  SubTrigger: typeof ContextMenuSubTrigger;
  RadioGroup: typeof ContextMenuRadioGroup;
};

const AugmentedContextMenu = ContextMenu as ContextMenuComponent;

AugmentedContextMenu.Trigger = ContextMenuTrigger;
AugmentedContextMenu.Content = ContextMenuContent;
AugmentedContextMenu.Item = ContextMenuItem;
AugmentedContextMenu.CheckboxItem = ContextMenuCheckboxItem;
AugmentedContextMenu.RadioItem = ContextMenuRadioItem;
AugmentedContextMenu.Label = ContextMenuLabel;
AugmentedContextMenu.Separator = ContextMenuSeparator;
AugmentedContextMenu.Shortcut = ContextMenuShortcut;
AugmentedContextMenu.Group = ContextMenuGroup;
AugmentedContextMenu.Portal = ContextMenuPortal;
AugmentedContextMenu.Sub = ContextMenuSub;
AugmentedContextMenu.SubContent = ContextMenuSubContent;
AugmentedContextMenu.SubTrigger = ContextMenuSubTrigger;
AugmentedContextMenu.RadioGroup = ContextMenuRadioGroup;

export { AugmentedContextMenu as ContextMenu };
