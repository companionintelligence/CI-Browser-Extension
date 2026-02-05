import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from '../ui/command';

type CommandComponent = typeof Command & {
  Dialog: typeof CommandDialog;
  Input: typeof CommandInput;
  List: typeof CommandList;
  Empty: typeof CommandEmpty;
  Group: typeof CommandGroup;
  Item: typeof CommandItem;
  Shortcut: typeof CommandShortcut;
  Separator: typeof CommandSeparator;
};

const AugmentedCommand = Command as CommandComponent;

AugmentedCommand.Dialog = CommandDialog;
AugmentedCommand.Input = CommandInput;
AugmentedCommand.List = CommandList;
AugmentedCommand.Empty = CommandEmpty;
AugmentedCommand.Group = CommandGroup;
AugmentedCommand.Item = CommandItem;
AugmentedCommand.Shortcut = CommandShortcut;
AugmentedCommand.Separator = CommandSeparator;

export { AugmentedCommand as Command };
