import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
} from "../ui/field";

type FieldComponent = typeof Field & {
  Label: typeof FieldLabel;
  Description: typeof FieldDescription;
  Error: typeof FieldError;
  Group: typeof FieldGroup;
  Legend: typeof FieldLegend;
  Separator: typeof FieldSeparator;
  Set: typeof FieldSet;
  Content: typeof FieldContent;
  Title: typeof FieldTitle;
};

const AugmentedField = Field as FieldComponent;

AugmentedField.Label = FieldLabel;
AugmentedField.Description = FieldDescription;
AugmentedField.Error = FieldError;
AugmentedField.Group = FieldGroup;
AugmentedField.Legend = FieldLegend;
AugmentedField.Separator = FieldSeparator;
AugmentedField.Set = FieldSet;
AugmentedField.Content = FieldContent;
AugmentedField.Title = FieldTitle;

export { AugmentedField as Field };
