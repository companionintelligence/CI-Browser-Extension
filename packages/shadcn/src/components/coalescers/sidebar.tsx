import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from '../ui/sidebar';

type SidebarComponent = typeof Sidebar & {
  Content: typeof SidebarContent;
  Footer: typeof SidebarFooter;
  Group: typeof SidebarGroup;
  GroupAction: typeof SidebarGroupAction;
  GroupContent: typeof SidebarGroupContent;
  GroupLabel: typeof SidebarGroupLabel;
  Header: typeof SidebarHeader;
  Input: typeof SidebarInput;
  Inset: typeof SidebarInset;
  Menu: typeof SidebarMenu;
  MenuAction: typeof SidebarMenuAction;
  MenuBadge: typeof SidebarMenuBadge;
  MenuButton: typeof SidebarMenuButton;
  MenuItem: typeof SidebarMenuItem;
  MenuSkeleton: typeof SidebarMenuSkeleton;
  MenuSub: typeof SidebarMenuSub;
  MenuSubButton: typeof SidebarMenuSubButton;
  MenuSubItem: typeof SidebarMenuSubItem;
  Provider: typeof SidebarProvider;
  Rail: typeof SidebarRail;
  Separator: typeof SidebarSeparator;
  Trigger: typeof SidebarTrigger;
};

const AugmentedSidebar = Sidebar as SidebarComponent;

AugmentedSidebar.Content = SidebarContent;
AugmentedSidebar.Footer = SidebarFooter;
AugmentedSidebar.Group = SidebarGroup;
AugmentedSidebar.GroupAction = SidebarGroupAction;
AugmentedSidebar.GroupContent = SidebarGroupContent;
AugmentedSidebar.GroupLabel = SidebarGroupLabel;
AugmentedSidebar.Header = SidebarHeader;
AugmentedSidebar.Input = SidebarInput;
AugmentedSidebar.Inset = SidebarInset;
AugmentedSidebar.Menu = SidebarMenu;
AugmentedSidebar.MenuAction = SidebarMenuAction;
AugmentedSidebar.MenuBadge = SidebarMenuBadge;
AugmentedSidebar.MenuButton = SidebarMenuButton;
AugmentedSidebar.MenuItem = SidebarMenuItem;
AugmentedSidebar.MenuSkeleton = SidebarMenuSkeleton;
AugmentedSidebar.MenuSub = SidebarMenuSub;
AugmentedSidebar.MenuSubButton = SidebarMenuSubButton;
AugmentedSidebar.MenuSubItem = SidebarMenuSubItem;
AugmentedSidebar.Provider = SidebarProvider;
AugmentedSidebar.Rail = SidebarRail;
AugmentedSidebar.Separator = SidebarSeparator;
AugmentedSidebar.Trigger = SidebarTrigger;

export { AugmentedSidebar as Sidebar, useSidebar };
