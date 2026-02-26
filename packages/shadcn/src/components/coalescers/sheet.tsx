import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";

type SheetComponent = typeof Sheet & {
  Trigger: typeof SheetTrigger;
  Close: typeof SheetClose;
  Content: typeof SheetContent;
  Header: typeof SheetHeader;
  Footer: typeof SheetFooter;
  Title: typeof SheetTitle;
  Description: typeof SheetDescription;
};

const AugmentedSheet = Sheet as SheetComponent;

AugmentedSheet.Trigger = SheetTrigger;
AugmentedSheet.Close = SheetClose;
AugmentedSheet.Content = SheetContent;
AugmentedSheet.Header = SheetHeader;
AugmentedSheet.Footer = SheetFooter;
AugmentedSheet.Title = SheetTitle;
AugmentedSheet.Description = SheetDescription;

export { AugmentedSheet as Sheet };
