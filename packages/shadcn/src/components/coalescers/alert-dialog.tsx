import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../ui/alert-dialog';

type AlertDialogComponent = typeof AlertDialog & {
  Portal: typeof AlertDialogPortal;
  Overlay: typeof AlertDialogOverlay;
  Trigger: typeof AlertDialogTrigger;
  Content: typeof AlertDialogContent;
  Header: typeof AlertDialogHeader;
  Footer: typeof AlertDialogFooter;
  Title: typeof AlertDialogTitle;
  Description: typeof AlertDialogDescription;
  Action: typeof AlertDialogAction;
  Cancel: typeof AlertDialogCancel;
};

const AugmentedAlertDialog = AlertDialog as AlertDialogComponent;

AugmentedAlertDialog.Portal = AlertDialogPortal;
AugmentedAlertDialog.Overlay = AlertDialogOverlay;
AugmentedAlertDialog.Trigger = AlertDialogTrigger;
AugmentedAlertDialog.Content = AlertDialogContent;
AugmentedAlertDialog.Header = AlertDialogHeader;
AugmentedAlertDialog.Footer = AlertDialogFooter;
AugmentedAlertDialog.Title = AlertDialogTitle;
AugmentedAlertDialog.Description = AlertDialogDescription;
AugmentedAlertDialog.Action = AlertDialogAction;
AugmentedAlertDialog.Cancel = AlertDialogCancel;

export { AugmentedAlertDialog as AlertDialog };
