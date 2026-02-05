import { RadioGroup, RadioGroupItem } from '../ui/radio-group';

type RadioGroupComponent = typeof RadioGroup & {
  Item: typeof RadioGroupItem;
};

const AugmentedRadioGroup = RadioGroup as RadioGroupComponent;

AugmentedRadioGroup.Item = RadioGroupItem;

export { AugmentedRadioGroup as RadioGroup };
