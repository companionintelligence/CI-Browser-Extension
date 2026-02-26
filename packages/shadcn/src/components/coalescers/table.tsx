import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "../ui/table";

type TableComponent = typeof Table & {
  Header: typeof TableHeader;
  Body: typeof TableBody;
  Footer: typeof TableFooter;
  Head: typeof TableHead;
  Row: typeof TableRow;
  Cell: typeof TableCell;
  Caption: typeof TableCaption;
};

const AugmentedTable = Table as TableComponent;

AugmentedTable.Header = TableHeader;
AugmentedTable.Body = TableBody;
AugmentedTable.Footer = TableFooter;
AugmentedTable.Head = TableHead;
AugmentedTable.Row = TableRow;
AugmentedTable.Cell = TableCell;
AugmentedTable.Caption = TableCaption;

export { AugmentedTable as Table };
