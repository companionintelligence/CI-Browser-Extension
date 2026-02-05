import { Form, FormItem, FormLabel, FormControl, FormDescription, FormMessage, FormField } from '../ui/form';

type FormComponent = typeof Form & {
  Item: typeof FormItem;
  Label: typeof FormLabel;
  Control: typeof FormControl;
  Description: typeof FormDescription;
  Message: typeof FormMessage;
  Field: typeof FormField;
};

const AugmentedForm = Form as FormComponent;

AugmentedForm.Item = FormItem;
AugmentedForm.Label = FormLabel;
AugmentedForm.Control = FormControl;
AugmentedForm.Description = FormDescription;
AugmentedForm.Message = FormMessage;
AugmentedForm.Field = FormField;

export { AugmentedForm as Form };
export { useFieldArray, useForm, useFormContext } from 'react-hook-form';
export { zodResolver as formDataResolver } from '@hookform/resolvers/zod';
export { z as formDataSchema } from 'zod';
