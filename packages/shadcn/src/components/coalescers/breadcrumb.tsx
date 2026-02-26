import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from "../ui/breadcrumb";

type BreadcrumbComponent = typeof Breadcrumb & {
  List: typeof BreadcrumbList;
  Item: typeof BreadcrumbItem;
  Link: typeof BreadcrumbLink;
  Page: typeof BreadcrumbPage;
  Separator: typeof BreadcrumbSeparator;
  Ellipsis: typeof BreadcrumbEllipsis;
};

const AugmentedBreadcrumb = Breadcrumb as BreadcrumbComponent;

AugmentedBreadcrumb.List = BreadcrumbList;
AugmentedBreadcrumb.Item = BreadcrumbItem;
AugmentedBreadcrumb.Link = BreadcrumbLink;
AugmentedBreadcrumb.Page = BreadcrumbPage;
AugmentedBreadcrumb.Separator = BreadcrumbSeparator;
AugmentedBreadcrumb.Ellipsis = BreadcrumbEllipsis;

export { AugmentedBreadcrumb as Breadcrumb };
