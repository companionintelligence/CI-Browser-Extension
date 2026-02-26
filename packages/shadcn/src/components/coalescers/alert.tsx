import { Alert, AlertTitle, AlertDescription } from '../ui/alert';

type AlertComponent = typeof Alert & {
  Title: typeof AlertTitle;
  Description: typeof AlertDescription;
};

const AugmentedAlert = Alert as AlertComponent;

AugmentedAlert.Title = AlertTitle;
AugmentedAlert.Description = AlertDescription;

export { AugmentedAlert as Alert };
