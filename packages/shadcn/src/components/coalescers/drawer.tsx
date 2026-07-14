import {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from "../ui/drawer";

type DrawerComponent = typeof Drawer & {
  Portal: typeof DrawerPortal;
  Overlay: typeof DrawerOverlay;
  Trigger: typeof DrawerTrigger;
  Close: typeof DrawerClose;
  Content: typeof DrawerContent;
  Header: typeof DrawerHeader;
  Footer: typeof DrawerFooter;
  Title: typeof DrawerTitle;
  Description: typeof DrawerDescription;
};

const AugmentedDrawer = Drawer as DrawerComponent;

AugmentedDrawer.Portal = DrawerPortal;
AugmentedDrawer.Overlay = DrawerOverlay;
AugmentedDrawer.Trigger = DrawerTrigger;
AugmentedDrawer.Close = DrawerClose;
AugmentedDrawer.Content = DrawerContent;
AugmentedDrawer.Header = DrawerHeader;
AugmentedDrawer.Footer = DrawerFooter;
AugmentedDrawer.Title = DrawerTitle;
AugmentedDrawer.Description = DrawerDescription;

export { AugmentedDrawer as Drawer };
