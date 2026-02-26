import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type SelectComponent = typeof Select & {
  Content: typeof SelectContent;
  Group: typeof SelectGroup;
  Item: typeof SelectItem;
  Label: typeof SelectLabel;
  ScrollDownButton: typeof SelectScrollDownButton;
  ScrollUpButton: typeof SelectScrollUpButton;
  Separator: typeof SelectSeparator;
  Trigger: typeof SelectTrigger;
  Value: typeof SelectValue;
};

const AugmentedSelect = Select as SelectComponent;

AugmentedSelect.Content = SelectContent;
AugmentedSelect.Group = SelectGroup;
AugmentedSelect.Item = SelectItem;
AugmentedSelect.Label = SelectLabel;
AugmentedSelect.ScrollDownButton = SelectScrollDownButton;
AugmentedSelect.ScrollUpButton = SelectScrollUpButton;
AugmentedSelect.Separator = SelectSeparator;
AugmentedSelect.Trigger = SelectTrigger;
AugmentedSelect.Value = SelectValue;

export { AugmentedSelect as Select };
