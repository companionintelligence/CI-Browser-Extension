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
} from '../ui/field';

type SidebarComponent = typeof Sidebar & {
  Field: typeof Field;
  FieldLabel: typeof FieldLabel;
  FieldDescription: typeof FieldDescription;
  FieldError: typeof FieldError;
  FieldGroup: typeof FieldGroup;
  FieldLegend: typeof FieldLegend;
  FieldSeparator: typeof FieldSeparator;
  FieldSet: typeof FieldSet;
  FieldContent: typeof FieldContent;
  FieldTitle: typeof FieldTitle;
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
