import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';

type ToggleGroupComponent = typeof ToggleGroup & {
  Item: typeof ToggleGroupItem;
};

const AugmentedToggleGroup = ToggleGroup as ToggleGroupComponent;

AugmentedToggleGroup.Item = ToggleGroupItem;

export { AugmentedToggleGroup as ToggleGroup };
