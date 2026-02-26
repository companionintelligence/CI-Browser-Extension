import {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "../ui/menubar";

type MenubarComponent = typeof Menubar & {
  Portal: typeof MenubarPortal;
  Menu: typeof MenubarMenu;
  Trigger: typeof MenubarTrigger;
  Content: typeof MenubarContent;
  Group: typeof MenubarGroup;
  Separator: typeof MenubarSeparator;
  Label: typeof MenubarLabel;
  Item: typeof MenubarItem;
  Shortcut: typeof MenubarShortcut;
  CheckboxItem: typeof MenubarCheckboxItem;
  RadioGroup: typeof MenubarRadioGroup;
  RadioItem: typeof MenubarRadioItem;
  Sub: typeof MenubarSub;
  SubTrigger: typeof MenubarSubTrigger;
  SubContent: typeof MenubarSubContent;
};

const AugmentedMenubar = Menubar as MenubarComponent;

AugmentedMenubar.Portal = MenubarPortal;
AugmentedMenubar.Menu = MenubarMenu;
AugmentedMenubar.Trigger = MenubarTrigger;
AugmentedMenubar.Content = MenubarContent;
AugmentedMenubar.Group = MenubarGroup;
AugmentedMenubar.Separator = MenubarSeparator;
AugmentedMenubar.Label = MenubarLabel;
AugmentedMenubar.Item = MenubarItem;
AugmentedMenubar.Shortcut = MenubarShortcut;
AugmentedMenubar.CheckboxItem = MenubarCheckboxItem;
AugmentedMenubar.RadioGroup = MenubarRadioGroup;
AugmentedMenubar.RadioItem = MenubarRadioItem;
AugmentedMenubar.Sub = MenubarSub;
AugmentedMenubar.SubTrigger = MenubarSubTrigger;
AugmentedMenubar.SubContent = MenubarSubContent;

export { AugmentedMenubar as Menubar };
