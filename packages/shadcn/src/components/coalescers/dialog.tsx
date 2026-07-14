import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

type DialogComponent = typeof Dialog & {
  Close: typeof DialogClose;
  Content: typeof DialogContent;
  Description: typeof DialogDescription;
  Footer: typeof DialogFooter;
  Header: typeof DialogHeader;
  Overlay: typeof DialogOverlay;
  Portal: typeof DialogPortal;
  Title: typeof DialogTitle;
  Trigger: typeof DialogTrigger;
};

const AugmentedDialog = Dialog as DialogComponent;

AugmentedDialog.Close = DialogClose;
AugmentedDialog.Content = DialogContent;
AugmentedDialog.Description = DialogDescription;
AugmentedDialog.Footer = DialogFooter;
AugmentedDialog.Header = DialogHeader;
AugmentedDialog.Overlay = DialogOverlay;
AugmentedDialog.Portal = DialogPortal;
AugmentedDialog.Title = DialogTitle;
AugmentedDialog.Trigger = DialogTrigger;

export { AugmentedDialog as Dialog };
