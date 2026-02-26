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
