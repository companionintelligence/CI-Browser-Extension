import {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '../ui/pagination';

type PaginationComponent = typeof Pagination & {
  Content: typeof PaginationContent;
  Link: typeof PaginationLink;
  Item: typeof PaginationItem;
  Previous: typeof PaginationPrevious;
  Next: typeof PaginationNext;
  Ellipsis: typeof PaginationEllipsis;
};

const AugmentedPagination = Pagination as PaginationComponent;

AugmentedPagination.Content = PaginationContent;
AugmentedPagination.Link = PaginationLink;
AugmentedPagination.Item = PaginationItem;
AugmentedPagination.Previous = PaginationPrevious;
AugmentedPagination.Next = PaginationNext;
AugmentedPagination.Ellipsis = PaginationEllipsis;

export { AugmentedPagination as Pagination };
