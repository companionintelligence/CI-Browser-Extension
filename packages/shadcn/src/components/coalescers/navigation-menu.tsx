import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "../ui/navigation-menu";

type NavigationMenuComponent = typeof NavigationMenu & {
  List: typeof NavigationMenuList;
  Item: typeof NavigationMenuItem;
  Content: typeof NavigationMenuContent;
  Trigger: typeof NavigationMenuTrigger;
  Link: typeof NavigationMenuLink;
  Indicator: typeof NavigationMenuIndicator;
  Viewport: typeof NavigationMenuViewport;
  triggerStyle: typeof navigationMenuTriggerStyle;
};

const AugmentedNavigationMenu = NavigationMenu as NavigationMenuComponent;

AugmentedNavigationMenu.List = NavigationMenuList;
AugmentedNavigationMenu.Item = NavigationMenuItem;
AugmentedNavigationMenu.Content = NavigationMenuContent;
AugmentedNavigationMenu.Trigger = NavigationMenuTrigger;
AugmentedNavigationMenu.Link = NavigationMenuLink;
AugmentedNavigationMenu.Indicator = NavigationMenuIndicator;
AugmentedNavigationMenu.Viewport = NavigationMenuViewport;
AugmentedNavigationMenu.triggerStyle = navigationMenuTriggerStyle;

export { AugmentedNavigationMenu as NavigationMenu };
