import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from "../ui/popover";

type PopoverComponent = typeof Popover & {
  Trigger: typeof PopoverTrigger;
  Content: typeof PopoverContent;
  Anchor: typeof PopoverAnchor;
};

const AugmentedPopover = Popover as PopoverComponent;

AugmentedPopover.Trigger = PopoverTrigger;
AugmentedPopover.Content = PopoverContent;
AugmentedPopover.Anchor = PopoverAnchor;

export { AugmentedPopover as Popover };
